"""Reset production database to empty state with a single org.

Drops all tables, re-runs Alembic migrations, cleans up ZITADEL orgs,
and seeds a single organization with one owner.

DESTRUCTIVE — requires --confirm flag.

Usage (from local machine):
    # 1. Scale down the worker to prevent background jobs during reset
    kubectl scale deployment run-api-worker --replicas=0 -n civpulse-prod

    # 2. Exec into the API pod and run the reset
    kubectl exec -it deploy/run-api -n civpulse-prod -- \
        python scripts/reset_prod.py --confirm

    # 3. Scale the worker back up
    kubectl scale deployment run-api-worker --replicas=1 -n civpulse-prod

    # 4. Verify: login at https://run.civpulse.org
    #    - Only "Vote Hatcher" org should appear
    #    - You should be the sole org_owner

Dry-run (shows what would happen without --confirm):
    kubectl exec -it deploy/run-api -n civpulse-prod -- \
        python scripts/reset_prod.py

Environment variables (already set in the prod pod):
    DATABASE_URL          - async connection string (used for seeding)
    DATABASE_URL_SYNC     - sync connection string (used for schema drop + alembic)
    ZITADEL_ISSUER        - e.g. https://auth.civpulse.org
    ZITADEL_BASE_URL      - internal URL for in-cluster calls
    ZITADEL_PROJECT_ID    - ZITADEL project ID
    ZITADEL_SERVICE_CLIENT_ID
    ZITADEL_SERVICE_CLIENT_SECRET
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import uuid

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ORG_NAME = "Vote Hatcher"
OWNER_EMAIL = "admin@civpulse.org"

# ZITADEL project roles that get granted to the org
PROJECT_ROLES = ["owner", "admin", "manager", "volunteer", "viewer"]


# ---------------------------------------------------------------------------
# ZITADEL helpers (raw httpx — ZitadelService doesn't have admin/search APIs)
# ---------------------------------------------------------------------------


class ZitadelAdmin:
    """Lightweight ZITADEL admin client for reset operations."""

    def __init__(self) -> None:
        self.issuer = os.environ["ZITADEL_ISSUER"].rstrip("/")
        self.base_url = (
            os.environ.get("ZITADEL_BASE_URL", "").rstrip("/") or self.issuer
        )
        self.client_id = os.environ["ZITADEL_SERVICE_CLIENT_ID"]
        self.client_secret = os.environ["ZITADEL_SERVICE_CLIENT_SECRET"]
        self.project_id = os.environ["ZITADEL_PROJECT_ID"]
        self._token: str | None = None

        from urllib.parse import urlparse

        issuer_host = urlparse(self.issuer).hostname or ""
        issuer_netloc = urlparse(self.issuer).netloc or ""
        base_host = urlparse(self.base_url).hostname or ""
        self._extra_headers: dict[str, str] = (
            {"Host": issuer_netloc} if base_host != issuer_host else {}
        )
        self._verify_tls = base_host == issuer_host

    async def _get_token(self) -> str:
        if self._token:
            return self._token
        async with httpx.AsyncClient(
            headers=self._extra_headers, verify=self._verify_tls, timeout=10.0
        ) as client:
            resp = await client.post(
                f"{self.base_url}/oauth/v2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": "openid urn:zitadel:iam:org:project:id:zitadel:aud",
                },
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
            return self._token

    def _headers(self, token: str, *, org_id: str | None = None) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            **self._extra_headers,
        }
        if org_id:
            h["x-zitadel-orgid"] = org_id
        return h

    async def list_orgs(self) -> list[dict]:
        """List all ZITADEL orgs via Admin API.

        Requires IAM_OWNER or equivalent role on the service account.
        """
        token = await self._get_token()
        async with httpx.AsyncClient(verify=self._verify_tls, timeout=15.0) as client:
            resp = await client.post(
                f"{self.base_url}/admin/v1/orgs/_search",
                headers=self._headers(token),
                json={"query": {"limit": 100}},
            )
            if resp.status_code == 403:
                print(
                    "ERROR: Service account lacks Admin API permissions.\n"
                    "The service account needs IAM_OWNER or IAM_ORG_MANAGER role\n"
                    "in ZITADEL to list all organizations.\n"
                    "Grant it at: ZITADEL Console > Instance > Members"
                )
                sys.exit(1)
            resp.raise_for_status()
            return resp.json().get("result", [])

    async def deactivate_org(self, org_id: str) -> None:
        token = await self._get_token()
        async with httpx.AsyncClient(verify=self._verify_tls, timeout=10.0) as client:
            # Try management API first, fall back to just logging
            resp = await client.post(
                f"{self.base_url}/management/v1/orgs/{org_id}/_deactivate",
                headers=self._headers(token, org_id=org_id),
            )
            # 412 = already deactivated, 404 = already gone
            if resp.status_code not in (200, 404, 412):
                resp.raise_for_status()

    async def delete_org(self, org_id: str) -> None:
        token = await self._get_token()
        async with httpx.AsyncClient(verify=self._verify_tls, timeout=10.0) as client:
            resp = await client.delete(
                f"{self.base_url}/management/v1/orgs/{org_id}",
                headers=self._headers(token, org_id=org_id),
            )
            if resp.status_code not in (200, 404):
                resp.raise_for_status()

    async def create_org(self, name: str) -> str:
        """Create a ZITADEL org. Returns the org ID."""
        token = await self._get_token()
        async with httpx.AsyncClient(verify=self._verify_tls, timeout=10.0) as client:
            resp = await client.post(
                f"{self.base_url}/management/v1/orgs",
                headers=self._headers(token),
                json={"name": name},
            )
            resp.raise_for_status()
            return resp.json()["id"]

    async def ensure_project_grant(self, org_id: str) -> str:
        """Ensure project grant exists for org. Returns grant ID."""
        token = await self._get_token()
        async with httpx.AsyncClient(verify=self._verify_tls, timeout=10.0) as client:
            # Try create first
            resp = await client.post(
                f"{self.base_url}/management/v1/projects/{self.project_id}/grants",
                headers=self._headers(token),
                json={
                    "grantedOrgId": org_id,
                    "roleKeys": PROJECT_ROLES,
                },
            )
            if resp.status_code in (200, 201):
                return resp.json()["grantId"]

            # Already exists — search for it
            resp2 = await client.post(
                f"{self.base_url}/management/v1/projects/{self.project_id}/grants/_search",
                headers=self._headers(token),
                json={},
            )
            resp2.raise_for_status()
            for grant in resp2.json().get("result", []):
                if grant.get("grantedOrgId") == org_id:
                    return grant["grantId"]

            # Should not reach here
            resp.raise_for_status()
            return ""  # unreachable

    async def search_user_by_email(self, email: str) -> dict | None:
        """Search for a ZITADEL user by email.

        Tries v2 API first, then falls back to management v1 API.
        Returns user dict or None.
        """
        token = await self._get_token()
        async with httpx.AsyncClient(verify=self._verify_tls, timeout=10.0) as client:
            # Try global admin user search first
            resp = await client.post(
                f"{self.base_url}/admin/v1/users/_search",
                headers=self._headers(token),
                json={
                    "queries": [
                        {
                            "emailQuery": {
                                "emailAddress": email,
                                "method": "TEXT_QUERY_METHOD_EQUALS",
                            }
                        }
                    ]
                },
            )
            if resp.status_code == 200:
                results = resp.json().get("result", [])
                if results:
                    return results[0]

            # Fallback: try v2 API
            resp2 = await client.post(
                f"{self.base_url}/v2/users",
                headers=self._headers(token),
                json={
                    "queries": [
                        {
                            "emailQuery": {
                                "emailAddress": email,
                                "method": "TEXT_QUERY_METHOD_EQUALS",
                            }
                        }
                    ]
                },
            )
            if resp2.status_code == 200:
                results = resp2.json().get("result", [])
                if results:
                    return results[0]

            # Last resort: try management v1 within Vote Hatcher org
            resp3 = await client.post(
                f"{self.base_url}/management/v1/users/_search",
                headers=self._headers(token),
                json={
                    "queries": [
                        {
                            "emailQuery": {
                                "emailAddress": email,
                                "method": "TEXT_QUERY_METHOD_EQUALS",
                            }
                        }
                    ]
                },
            )
            if resp3.status_code == 200:
                results = resp3.json().get("result", [])
                if results:
                    return results[0]

            return None

    async def assign_role(self, user_id: str, role: str, org_id: str) -> None:
        """Assign a project role to a user within an org."""
        token = await self._get_token()
        async with httpx.AsyncClient(verify=self._verify_tls, timeout=10.0) as client:
            resp = await client.post(
                f"{self.base_url}/management/v1/users/{user_id}/grants",
                headers=self._headers(token, org_id=org_id),
                json={
                    "projectId": self.project_id,
                    "roleKeys": [role],
                },
            )
            # 409 = already assigned
            if resp.status_code not in (200, 201, 409):
                resp.raise_for_status()


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------


def drop_and_migrate() -> None:
    """Drop all tables and re-run Alembic migrations."""
    from sqlalchemy import create_engine, inspect

    sync_url = os.environ.get("DATABASE_URL_SYNC")
    if not sync_url:
        print("ERROR: DATABASE_URL_SYNC not set")
        sys.exit(1)

    print("  Dropping all tables...")
    engine = create_engine(sync_url)
    with engine.connect() as conn:
        # Drop alembic version table first so migrations run fresh
        conn.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE"))
        # Drop procrastinate tables (separate schema)
        conn.execute(text("DROP SCHEMA IF EXISTS procrastinate CASCADE"))
        # Get all user tables and drop them
        inspector = inspect(conn)
        # Exclude PostGIS system tables (owned by superuser)
        postgis_tables = {"spatial_ref_sys", "geometry_columns", "geography_columns"}
        tables = [
            t
            for t in inspector.get_table_names(schema="public")
            if t not in postgis_tables
        ]
        if tables:
            # Drop all tables in one CASCADE statement
            table_list = ", ".join(f'"{t}"' for t in tables)
            conn.execute(text(f"DROP TABLE IF EXISTS {table_list} CASCADE"))
        # Drop custom types (enums etc) that alembic may have created
        conn.execute(
            text(
                "DO $$ DECLARE r RECORD; BEGIN "
                "FOR r IN (SELECT typname FROM pg_type t "
                "JOIN pg_namespace n ON t.typnamespace = n.oid "
                "WHERE n.nspname = 'public' AND t.typtype = 'e') "
                "LOOP EXECUTE 'DROP TYPE IF EXISTS ' "
                "|| quote_ident(r.typname) || ' CASCADE'; "
                "END LOOP; END $$;"
            )
        )
        conn.commit()
    engine.dispose()
    print(f"  Dropped {len(tables)} tables.")

    # Pre-create alembic_version with wider column (default is VARCHAR(32)
    # but our revision IDs exceed that — see memory note on #19)
    engine2 = create_engine(sync_url)
    with engine2.connect() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version "
                "(version_num VARCHAR(128) NOT NULL)"
            )
        )
        conn.commit()
    engine2.dispose()

    print("  Running alembic upgrade head...")
    result = subprocess.run(
        ["python", "-m", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  ERROR: Alembic migration failed:\n{result.stderr}")
        sys.exit(1)
    print("  Migrations complete.")


async def seed_org(zitadel_org_id: str, user_id: str, grant_id: str) -> None:
    """Seed Vote Hatcher org, user, and membership."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session, session.begin():
        # Create user record (let server_default handle timestamps —
        # columns are TIMESTAMP WITHOUT TIME ZONE, asyncpg rejects tz-aware)
        user = User(
            id=user_id,
            display_name="Kerry Hatcher",
            email=OWNER_EMAIL,
        )
        session.add(user)
        await session.flush()
        print(f"  Created user: {user.display_name} ({user.id})")

        # Create organization
        org = Organization(
            id=uuid.uuid4(),
            zitadel_org_id=zitadel_org_id,
            zitadel_project_grant_id=grant_id,
            name=ORG_NAME,
            created_by=user_id,
        )
        session.add(org)
        await session.flush()
        print(f"  Created organization: {org.name} ({org.id})")

        # Create org membership
        member = OrganizationMember(
            user_id=user_id,
            organization_id=org.id,
            role="org_owner",
            joined_at=None,
        )
        session.add(member)
        await session.flush()
        print("  Created org membership: org_owner")

    await engine.dispose()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    confirm = "--confirm" in sys.argv

    print("=" * 60)
    print("  CivicPulse Run API — Production Reset")
    print("=" * 60)
    print()
    print(f"  Target org:  {ORG_NAME}")
    print(f"  Owner email: {OWNER_EMAIL}")
    print()

    if not confirm:
        print("DRY RUN — what would happen:")
        print()
        print("  1. DROP SCHEMA public CASCADE + alembic upgrade head")
        print("  2. Delete all ZITADEL orgs except 'Vote Hatcher'")
        print("  3. Create/keep 'Vote Hatcher' org with project grant")
        print(f"  4. Seed database: user ({OWNER_EMAIL}), org, org_owner membership")
        print()
        print("  Run with --confirm to execute.")
        return

    print("⚠  THIS WILL DESTROY ALL DATA IN THE PRODUCTION DATABASE")
    print()

    # Step 1: Drop and re-migrate
    print("[1/4] Dropping schema and running migrations...")
    drop_and_migrate()
    print()

    # Step 2: ZITADEL cleanup
    print("[2/4] Cleaning up ZITADEL organizations...")
    z = ZitadelAdmin()

    orgs = await z.list_orgs()
    vote_hatcher_org_id = None

    for org in orgs:
        org_name = org.get("name", "")
        org_id = org.get("id", "")
        # Skip the default ZITADEL system org (usually first org, often "ZITADEL")
        if org_name == "ZITADEL":
            print(f"  Skipping system org: {org_name} ({org_id})")
            continue
        if org_name == ORG_NAME:
            vote_hatcher_org_id = org_id
            print(f"  Keeping: {org_name} ({org_id})")
        else:
            print(f"  Deleting: {org_name} ({org_id})...")
            try:
                await z.deactivate_org(org_id)
                await z.delete_org(org_id)
                print("    Deleted.")
            except Exception as e:
                print(f"    WARNING: Failed to delete: {e}")

    # Create Vote Hatcher org if it didn't exist
    if not vote_hatcher_org_id:
        print(f"  Creating ZITADEL org: {ORG_NAME}...")
        vote_hatcher_org_id = await z.create_org(ORG_NAME)
        print(f"  Created: {vote_hatcher_org_id}")
    print()

    # Step 3: Ensure project grant
    print("[3/4] Ensuring project grant and finding user...")
    grant_id = await z.ensure_project_grant(vote_hatcher_org_id)
    print(f"  Project grant: {grant_id}")

    # Find Kerry's ZITADEL user ID
    user = await z.search_user_by_email(OWNER_EMAIL)
    if not user:
        print(f"  ERROR: No ZITADEL user found for {OWNER_EMAIL}")
        print("  The user must exist in ZITADEL before running this script.")
        sys.exit(1)

    user_id = user.get("userId", "")
    user_name = user.get("human", {}).get("profile", {}).get("displayName", "unknown")
    print(f"  Found user: {user_name} ({user_id})")

    # Assign owner role in ZITADEL
    await z.assign_role(user_id, "owner", vote_hatcher_org_id)
    print("  Assigned project role: owner")
    print()

    # Step 4: Seed database
    print("[4/4] Seeding database...")
    await seed_org(vote_hatcher_org_id, user_id, grant_id)
    print()

    print("=" * 60)
    print("  Reset complete!")
    print()
    print(f"  Org:    {ORG_NAME}")
    print(f"  Owner:  Kerry Hatcher ({user_id})")
    print(f"  Grant:  {grant_id}")
    print()
    print("  Next: scale worker back up and verify login at")
    print("  https://run.civpulse.org")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
