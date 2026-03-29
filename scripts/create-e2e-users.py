"""Create ZITADEL users for E2E role-gated testing.

Creates 15 human users across 5 campaign roles (3 per role):
  - owner1-3@localhost   (owner role)      -> org_owner in DB + campaign owner
  - admin1-3@localhost   (admin role)      -> org_admin in DB + campaign admin
  - manager1-3@localhost (manager role)    -> campaign manager (no org membership)
  - volunteer1-3@localhost (volunteer role) -> campaign volunteer (no org membership)
  - viewer1-3@localhost  (viewer role)     -> campaign viewer (no org membership)

Each user gets ZITADEL user creation, project role grant, optional
organization membership (owner/admin only), and campaign membership
(all users). Idempotent — safe to run multiple times.

Usage:
  docker compose exec api bash -c \
      "PYTHONPATH=/home/app python scripts/create-e2e-users.py"
"""

from __future__ import annotations

import os
import sys
import time

import httpx

# ---------------------------------------------------------------------------
# ZITADEL connection settings (mirrors bootstrap-zitadel.py)
# ---------------------------------------------------------------------------

ZITADEL_DOMAIN = os.environ.get("ZITADEL_DOMAIN", "localhost")
ZITADEL_EXTERNAL_PORT = os.environ.get("ZITADEL_EXTERNAL_PORT", "8080")
ZITADEL_EXTERNAL_SECURE = (
    os.environ.get("ZITADEL_EXTERNAL_SECURE", "false").lower() == "true"
)
_INTERNAL_SCHEME = "https" if ZITADEL_EXTERNAL_SECURE else "http"
ZITADEL_URL = os.environ.get("ZITADEL_URL", f"{_INTERNAL_SCHEME}://zitadel:8080")
PAT_PATH = "/zitadel-data/pat.txt"
_VERIFY_TLS = False

PROJECT_NAME = "CivicPulse"

# ---------------------------------------------------------------------------
# E2E user definitions
# ---------------------------------------------------------------------------

E2E_USERS = [
    # Owners (3) — org_owner + campaign owner
    {
        "userName": "owner1@localhost",
        "password": "Owner1234!",
        "firstName": "Test",
        "lastName": "Owner1",
        "email": "owner1@localhost",
        "projectRole": "owner",
        "orgRole": "org_owner",
        "campaignRole": "owner",
    },
    {
        "userName": "owner2@localhost",
        "password": "Owner1234!",
        "firstName": "Test",
        "lastName": "Owner2",
        "email": "owner2@localhost",
        "projectRole": "owner",
        "orgRole": "org_owner",
        "campaignRole": "owner",
    },
    {
        "userName": "owner3@localhost",
        "password": "Owner1234!",
        "firstName": "Test",
        "lastName": "Owner3",
        "email": "owner3@localhost",
        "projectRole": "owner",
        "orgRole": "org_owner",
        "campaignRole": "owner",
    },
    # Admins (3) — org_admin + campaign admin
    {
        "userName": "admin1@localhost",
        "password": "Admin1234!",
        "firstName": "Test",
        "lastName": "Admin1",
        "email": "admin1@localhost",
        "projectRole": "admin",
        "orgRole": "org_admin",
        "campaignRole": "admin",
    },
    {
        "userName": "admin2@localhost",
        "password": "Admin1234!",
        "firstName": "Test",
        "lastName": "Admin2",
        "email": "admin2@localhost",
        "projectRole": "admin",
        "orgRole": "org_admin",
        "campaignRole": "admin",
    },
    {
        "userName": "admin3@localhost",
        "password": "Admin1234!",
        "firstName": "Test",
        "lastName": "Admin3",
        "email": "admin3@localhost",
        "projectRole": "admin",
        "orgRole": "org_admin",
        "campaignRole": "admin",
    },
    # Managers (3) — campaign manager only (no org membership)
    {
        "userName": "manager1@localhost",
        "password": "Manager1234!",
        "firstName": "Test",
        "lastName": "Manager1",
        "email": "manager1@localhost",
        "projectRole": "manager",
        "orgRole": None,
        "campaignRole": "manager",
    },
    {
        "userName": "manager2@localhost",
        "password": "Manager1234!",
        "firstName": "Test",
        "lastName": "Manager2",
        "email": "manager2@localhost",
        "projectRole": "manager",
        "orgRole": None,
        "campaignRole": "manager",
    },
    {
        "userName": "manager3@localhost",
        "password": "Manager1234!",
        "firstName": "Test",
        "lastName": "Manager3",
        "email": "manager3@localhost",
        "projectRole": "manager",
        "orgRole": None,
        "campaignRole": "manager",
    },
    # Volunteers (3) — campaign volunteer only (no org membership)
    {
        "userName": "volunteer1@localhost",
        "password": "Volunteer1234!",
        "firstName": "Test",
        "lastName": "Volunteer1",
        "email": "volunteer1@localhost",
        "projectRole": "volunteer",
        "orgRole": None,
        "campaignRole": "volunteer",
    },
    {
        "userName": "volunteer2@localhost",
        "password": "Volunteer1234!",
        "firstName": "Test",
        "lastName": "Volunteer2",
        "email": "volunteer2@localhost",
        "projectRole": "volunteer",
        "orgRole": None,
        "campaignRole": "volunteer",
    },
    {
        "userName": "volunteer3@localhost",
        "password": "Volunteer1234!",
        "firstName": "Test",
        "lastName": "Volunteer3",
        "email": "volunteer3@localhost",
        "projectRole": "volunteer",
        "orgRole": None,
        "campaignRole": "volunteer",
    },
    # Viewers (3) — campaign viewer only (no org membership)
    {
        "userName": "viewer1@localhost",
        "password": "Viewer1234!",
        "firstName": "Test",
        "lastName": "Viewer1",
        "email": "viewer1@localhost",
        "projectRole": "viewer",
        "orgRole": None,
        "campaignRole": "viewer",
    },
    {
        "userName": "viewer2@localhost",
        "password": "Viewer1234!",
        "firstName": "Test",
        "lastName": "Viewer2",
        "email": "viewer2@localhost",
        "projectRole": "viewer",
        "orgRole": None,
        "campaignRole": "viewer",
    },
    {
        "userName": "viewer3@localhost",
        "password": "Viewer1234!",
        "firstName": "Test",
        "lastName": "Viewer3",
        "email": "viewer3@localhost",
        "projectRole": "viewer",
        "orgRole": None,
        "campaignRole": "viewer",
    },
]


# ---------------------------------------------------------------------------
# Helpers (duplicated from bootstrap-zitadel.py to avoid import issues)
# ---------------------------------------------------------------------------


def _host_header() -> str:
    return f"{ZITADEL_DOMAIN}:{ZITADEL_EXTERNAL_PORT}"


def wait_for_zitadel() -> None:
    for attempt in range(60):
        try:
            resp = httpx.get(
                f"{ZITADEL_URL}/debug/ready", timeout=5, verify=_VERIFY_TLS
            )
            if resp.status_code == 200:
                print(f"  ZITADEL is ready (attempt {attempt + 1})")
                return
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        if attempt < 59:
            time.sleep(3)
    print("ERROR: ZITADEL did not become ready after 3 minutes", file=sys.stderr)
    sys.exit(1)


def read_pat() -> str:
    for attempt in range(30):
        try:
            with open(PAT_PATH) as f:
                token = f.read().strip()
            if token:
                return token
        except (FileNotFoundError, OSError):
            pass
        if attempt < 29:
            time.sleep(2)
    print("ERROR: Could not read PAT after 60 seconds", file=sys.stderr)
    sys.exit(1)


def api_call(
    client: httpx.Client,
    method: str,
    path: str,
    pat: str,
    json: dict | None = None,
    *,
    allow_conflict: bool = False,
) -> dict | None:
    resp = client.request(
        method,
        f"{ZITADEL_URL}{path}",
        headers={
            "Authorization": f"Bearer {pat}",
            "Host": _host_header(),
        },
        json=json,
        timeout=30,
    )
    if allow_conflict and resp.status_code == 409:
        print(f"  {path} -> already exists (409), skipping")
        return None
    if resp.status_code >= 400:
        print(
            f"ERROR: {method} {path} -> {resp.status_code}: {resp.text}",
            file=sys.stderr,
        )
        resp.raise_for_status()
    return resp.json() if resp.content else {}


# ---------------------------------------------------------------------------
# ZITADEL user management
# ---------------------------------------------------------------------------


def find_project_id(client: httpx.Client, pat: str) -> str:
    """Find the CivicPulse project ID."""
    data = api_call(
        client,
        "POST",
        "/management/v1/projects/_search",
        pat,
        json={
            "queries": [
                {
                    "nameQuery": {
                        "name": PROJECT_NAME,
                        "method": "TEXT_QUERY_METHOD_EQUALS",
                    }
                }
            ]
        },
    )
    results = data.get("result", [])
    if not results:
        print(
            "ERROR: CivicPulse project not found — run bootstrap first",
            file=sys.stderr,
        )
        sys.exit(1)
    return results[0]["id"]


def find_user_by_username(client: httpx.Client, pat: str, username: str) -> str | None:
    """Search for a user by username, return userId or None."""
    data = api_call(
        client,
        "POST",
        "/management/v1/users/_search",
        pat,
        json={
            "queries": [
                {
                    "userNameQuery": {
                        "userName": username,
                        "method": "TEXT_QUERY_METHOD_EQUALS",
                    }
                }
            ]
        },
    )
    users = data.get("result", [])
    return users[0]["id"] if users else None


def create_human_user(
    client: httpx.Client,
    pat: str,
    user_def: dict,
) -> str:
    """Create a ZITADEL human user. Returns userId."""
    username = user_def["userName"]

    # Check if user already exists
    existing_id = find_user_by_username(client, pat, username)
    if existing_id:
        print(f"  User '{username}' already exists: {existing_id}")
        return existing_id

    data = api_call(
        client,
        "POST",
        "/management/v1/users/human",
        pat,
        json={
            "userName": username,
            "profile": {
                "firstName": user_def["firstName"],
                "lastName": user_def["lastName"],
                "displayName": f"{user_def['firstName']} {user_def['lastName']}",
            },
            "email": {
                "email": user_def["email"],
                "isEmailVerified": True,
            },
            "password": user_def["password"],
            "passwordChangeRequired": False,
        },
        allow_conflict=True,
    )

    if data is None:
        # 409 conflict — user exists, look it up
        found_id = find_user_by_username(client, pat, username)
        if found_id:
            print(f"  User '{username}' found after conflict: {found_id}")
            return found_id
        print(f"ERROR: Could not find user '{username}' after 409", file=sys.stderr)
        sys.exit(1)

    user_id = data.get("userId", "")
    print(f"  Created user '{username}': {user_id}")
    return user_id


def grant_project_role(
    client: httpx.Client,
    pat: str,
    project_id: str,
    user_id: str,
    role: str,
) -> None:
    """Grant a project role to a user."""
    api_call(
        client,
        "POST",
        f"/management/v1/users/{user_id}/grants",
        pat,
        json={
            "projectId": project_id,
            "roleKeys": [role],
        },
        allow_conflict=True,
    )
    print(f"  Granted project role '{role}' to user {user_id}")


# ---------------------------------------------------------------------------
# Database: insert organization_members row for org_admin
# ---------------------------------------------------------------------------


def ensure_org_membership(
    user_zitadel_id: str,
    org_role: str,
    display_name: str,
    email: str,
) -> None:
    """Insert an organization_members row via psycopg2.

    The user.id in our DB is the ZITADEL subject ID (user_zitadel_id).
    We look up the first organization and insert the membership.
    """
    import psycopg2  # noqa: PLC0415

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        print("  WARNING: DATABASE_URL not set, skipping org membership insert")
        return

    # Convert async URL to sync for psycopg2
    sync_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = psycopg2.connect(sync_url)
        conn.autocommit = True
        cur = conn.cursor()

        # Ensure user row exists (users table expects string PK = ZITADEL sub)
        cur.execute(
            """
            INSERT INTO users (id, display_name, email)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (user_zitadel_id, display_name, email),
        )

        # Find the first organization
        cur.execute("SELECT id FROM organizations LIMIT 1")
        row = cur.fetchone()
        if not row:
            print("  WARNING: No organizations found, skipping org membership")
            cur.close()
            conn.close()
            return
        org_id = row[0]

        # Insert membership (idempotent via ON CONFLICT)
        cur.execute(
            """
            INSERT INTO organization_members (id, user_id, organization_id, role)
            VALUES (gen_random_uuid(), %s, %s, %s)
            ON CONFLICT ON CONSTRAINT uq_user_organization DO UPDATE
            SET role = EXCLUDED.role
            """,
            (user_zitadel_id, str(org_id), org_role),
        )
        print(f"  Ensured org membership: user={user_zitadel_id}, role={org_role}")

        cur.close()
        conn.close()
    except Exception as exc:
        print(f"  WARNING: Could not insert org membership: {exc}", file=sys.stderr)


def ensure_campaign_membership(user_zitadel_id: str, campaign_role: str) -> None:
    """Insert campaign_members row with explicit role for the seed campaign."""
    import psycopg2  # noqa: PLC0415

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        print("  WARNING: DATABASE_URL not set, skipping campaign membership insert")
        return

    sync_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = psycopg2.connect(sync_url)
        conn.autocommit = True
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO campaign_members (id, user_id, campaign_id, role)
            VALUES (gen_random_uuid(), %s, (SELECT id FROM campaigns LIMIT 1), %s)
            ON CONFLICT ON CONSTRAINT uq_user_campaign DO UPDATE
            SET role = EXCLUDED.role
            """,
            (user_zitadel_id, campaign_role),
        )
        print(
            f"  Ensured campaign membership: "
            f"user={user_zitadel_id}, role={campaign_role}"
        )

        cur.close()
        conn.close()
    except Exception as exc:
        print(
            f"  WARNING: Could not insert campaign membership: {exc}",
            file=sys.stderr,
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print("=" * 60)
    print("Create E2E Test Users (15 users across 5 roles)")
    print("=" * 60)
    print(f"  ZITADEL URL: {ZITADEL_URL}")

    print("\nStep 0: Waiting for ZITADEL...")
    wait_for_zitadel()

    print("\nStep 1: Reading PAT...")
    pat = read_pat()

    with httpx.Client(verify=_VERIFY_TLS) as client:
        print("\nStep 2: Finding project...")
        project_id = find_project_id(client, pat)
        print(f"  Project ID: {project_id}")

        for i, user_def in enumerate(E2E_USERS, 1):
            username = user_def["userName"]
            print(f"\nUser {i}/{len(E2E_USERS)}: Creating '{username}'...")
            user_id = create_human_user(client, pat, user_def)

            print(f"  Granting project role '{user_def['projectRole']}'...")
            grant_project_role(
                client, pat, project_id, user_id, user_def["projectRole"]
            )

            # Insert org membership if needed (owner/admin only)
            if user_def["orgRole"]:
                display_name = f"{user_def['firstName']} {user_def['lastName']}"
                print(f"  Ensuring org membership (role={user_def['orgRole']})...")
                ensure_org_membership(
                    user_id,
                    user_def["orgRole"],
                    display_name,
                    user_def["email"],
                )

            # Insert campaign membership for ALL users
            print(
                f"  Ensuring campaign membership (role={user_def['campaignRole']})..."
            )
            ensure_campaign_membership(user_id, user_def["campaignRole"])

    print("\n" + "=" * 60)
    print("E2E users created successfully!")
    print("  Owners:     owner1-3@localhost     / Owner1234!")
    print("  Admins:     admin1-3@localhost     / Admin1234!")
    print("  Managers:   manager1-3@localhost   / Manager1234!")
    print("  Volunteers: volunteer1-3@localhost / Volunteer1234!")
    print("  Viewers:    viewer1-3@localhost    / Viewer1234!")
    print("=" * 60)


if __name__ == "__main__":
    main()
