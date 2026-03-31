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
PAT_PATH = os.environ.get("PAT_PATH", "/zitadel-data/pat.txt")
_VERIFY_TLS = False

PROJECT_NAME = "CivicPulse"

LOGIN_POLICY_SEARCH_PATH = "/management/v1/policies/login/_search"
LOGIN_POLICY_PATH = "/management/v1/policies/login"

NO_MFA_LOGIN_POLICY = {
    "allowUsernamePassword": True,
    "allowRegister": False,
    "allowExternalIdp": True,
    "forceMfa": False,
    "secondFactors": [],
    "multiFactors": [],
}

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


def _strict_policy_exit(
    method: str,
    path: str,
    exc: httpx.HTTPStatusError,
) -> None:
    status = exc.response.status_code
    body = exc.response.text
    raise SystemExit(
        "Strict policy verification failed for "
        f"{method} {path}: status={status}, body={body}. "
        "Remediation: ensure org login policy disables MFA "
        "(secondFactors/multiFactors empty, forceMfa=false)."
    )


def _policy_search_payload(org_id: str) -> dict:
    return {
        "query": {
            "offset": "0",
            "limit": 10,
            "asc": True,
        },
        "queries": [{"inherited": False, "isDefault": False, "orgId": org_id}],
    }


def _policy_payload(org_id: str) -> dict:
    return {"orgId": org_id, **NO_MFA_LOGIN_POLICY}


def _extract_policies(data: dict) -> list[dict]:
    if isinstance(data.get("result"), list):
        return data["result"]
    if isinstance(data.get("policies"), list):
        return data["policies"]
    return []


def _is_compliant_no_mfa_policy(policy: dict) -> bool:
    second_factors = policy.get("secondFactors", [])
    multi_factors = policy.get("multiFactors", [])
    force_mfa = policy.get("forceMfa", False)
    allow_username_password = policy.get("allowUsernamePassword", True)
    return (
        isinstance(second_factors, list)
        and len(second_factors) == 0
        and isinstance(multi_factors, list)
        and len(multi_factors) == 0
        and force_mfa is False
        and allow_username_password is True
    )


def fetch_org_login_policies(client: httpx.Client, pat: str, org_id: str) -> list[dict]:
    data = api_call(
        client,
        "POST",
        LOGIN_POLICY_SEARCH_PATH,
        pat,
        json=_policy_search_payload(org_id),
    )
    return _extract_policies(data or {})


def verify_org_login_policy(
    client: httpx.Client,
    pat: str,
    org_id: str,
    *,
    strict: bool,
) -> bool:
    try:
        policies = fetch_org_login_policies(client, pat, org_id)
    except httpx.HTTPStatusError as exc:
        if strict:
            _strict_policy_exit("POST", LOGIN_POLICY_SEARCH_PATH, exc)
        print(
            "WARNING: Could not verify org login policy "
            f"(POST {LOGIN_POLICY_SEARCH_PATH}): {exc}",
            file=sys.stderr,
        )
        return False

    for policy in policies:
        if _is_compliant_no_mfa_policy(policy):
            return True

    message = (
        "Org login policy is not compliant with no-MFA requirements "
        f"(searched {LOGIN_POLICY_SEARCH_PATH} for orgId={org_id})."
    )
    if strict:
        raise SystemExit(message)
    print(f"WARNING: {message}", file=sys.stderr)
    return False


def ensure_org_login_policy(
    client: httpx.Client,
    pat: str,
    org_id: str,
    *,
    strict: bool,
) -> None:
    policies: list[dict] = []
    try:
        policies = fetch_org_login_policies(client, pat, org_id)
    except httpx.HTTPStatusError as exc:
        _strict_policy_exit("POST", LOGIN_POLICY_SEARCH_PATH, exc)

    compliant = next((p for p in policies if _is_compliant_no_mfa_policy(p)), None)
    if compliant:
        print("  Org login policy already compliant (no MFA required)")
        return

    payload = _policy_payload(org_id)

    try:
        if not policies:
            api_call(client, "POST", LOGIN_POLICY_PATH, pat, json=payload)
            print("  Created org login policy with no-MFA settings")
        else:
            policy_id = policies[0].get("id", "")
            if not policy_id:
                raise SystemExit(
                    "Cannot update org login policy: missing id in search result"
                )
            api_call(
                client,
                "PUT",
                f"{LOGIN_POLICY_PATH}/{policy_id}",
                pat,
                json=payload,
            )
            print(f"  Updated org login policy {policy_id} to no-MFA settings")
    except httpx.HTTPStatusError as exc:
        _strict_policy_exit(exc.request.method, exc.request.url.path, exc)

    if not verify_org_login_policy(client, pat, org_id, strict=strict):
        raise SystemExit(1)


def _parse_flags(argv: list[str]) -> tuple[bool, bool]:
    verify_policy_only = "--verify-policy-only" in argv
    strict_policy = "--strict-policy" in argv
    return verify_policy_only, strict_policy


# ---------------------------------------------------------------------------
# ZITADEL user management
# ---------------------------------------------------------------------------


def find_project_id(client: httpx.Client, pat: str) -> str:
    """Find the CivicPulse project ID."""
    data = (
        api_call(
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
        or {}
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
    data = (
        api_call(
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
        or {}
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
        "/v2beta/users/human",
        pat,
        json={
            "username": username,
            "profile": {
                "givenName": user_def["firstName"],
                "familyName": user_def["lastName"],
                "displayName": f"{user_def['firstName']} {user_def['lastName']}",
            },
            "email": {
                "email": user_def["email"],
                "isVerified": True,
            },
            "password": {
                "password": user_def["password"],
                "changeRequired": False,
            },
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
# Database helpers
# ---------------------------------------------------------------------------


def _get_sync_url() -> str | None:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        return None
    return database_url.replace("postgresql+asyncpg://", "postgresql://")


def ensure_user_row(
    user_zitadel_id: str,
    display_name: str,
    email: str,
) -> None:
    """Ensure a users table row exists for the given ZITADEL user."""
    import psycopg2  # noqa: PLC0415

    sync_url = _get_sync_url()
    if not sync_url:
        print("  WARNING: DATABASE_URL not set, skipping user row insert")
        return

    try:
        conn = psycopg2.connect(sync_url)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users (id, display_name, email)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                email = EXCLUDED.email
            """,
            (user_zitadel_id, display_name, email),
        )
        print(f"  Ensured user row: {user_zitadel_id} ({display_name})")
        cur.close()
        conn.close()
    except Exception as exc:
        print(f"  WARNING: Could not insert user row: {exc}", file=sys.stderr)


def update_seed_org_zitadel_id(zitadel_org_id: str) -> None:
    """Update the seed organization's zitadel_org_id to match ZITADEL.

    The seed script creates the org with a placeholder zitadel_org_id.
    We need to fix it so the frontend's useOrgPermissions hook can
    match it against the JWT claims.
    """
    import psycopg2  # noqa: PLC0415

    sync_url = _get_sync_url()
    if not sync_url:
        print("  WARNING: DATABASE_URL not set, skipping org ID update")
        return

    try:
        conn = psycopg2.connect(sync_url)
        conn.autocommit = True
        cur = conn.cursor()
        # Update the seed org (identified by its seed- prefix zitadel_org_id)
        cur.execute(
            """
            UPDATE organizations
            SET zitadel_org_id = %s
            WHERE zitadel_org_id LIKE 'seed-%%'
            """,
            (zitadel_org_id,),
        )
        rows = cur.rowcount
        if rows > 0:
            print(f"  Updated seed org zitadel_org_id to {zitadel_org_id}")
        else:
            print("  No seed org found to update (already has real ID)")
        cur.close()
        conn.close()
    except Exception as exc:
        print(
            f"  WARNING: Could not update seed org zitadel_org_id: {exc}",
            file=sys.stderr,
        )


def ensure_org_membership(
    user_zitadel_id: str,
    org_role: str,
) -> None:
    """Insert an organization_members row via psycopg2.

    The user.id in our DB is the ZITADEL subject ID (user_zitadel_id).
    We look up the first organization and insert the membership.
    """
    import psycopg2  # noqa: PLC0415

    sync_url = _get_sync_url()
    if not sync_url:
        print("  WARNING: DATABASE_URL not set, skipping org membership insert")
        return

    try:
        conn = psycopg2.connect(sync_url)
        conn.autocommit = True
        cur = conn.cursor()

        # Find the seed organization specifically
        cur.execute(
            "SELECT id FROM organizations WHERE name LIKE 'Macon-Bibb%%' LIMIT 1"
        )
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
    """Insert campaign_members row with explicit role for the seed campaign.

    Targets the seed campaign specifically (name starts with 'Macon-Bibb')
    to avoid accidentally joining E2E-created campaigns with the wrong role.
    """
    import psycopg2  # noqa: PLC0415

    sync_url = _get_sync_url()
    if not sync_url:
        print("  WARNING: DATABASE_URL not set, skipping campaign membership insert")
        return

    try:
        conn = psycopg2.connect(sync_url)
        conn.autocommit = True
        cur = conn.cursor()

        # Find the seed campaign specifically (not just any campaign)
        cur.execute("SELECT id FROM campaigns WHERE name LIKE 'Macon-Bibb%%' LIMIT 1")
        row = cur.fetchone()
        if not row:
            # Fallback to first campaign if seed campaign not found
            cur.execute("SELECT id FROM campaigns LIMIT 1")
            row = cur.fetchone()
        if not row:
            print("  WARNING: No campaigns found, skipping campaign membership")
            cur.close()
            conn.close()
            return
        campaign_id = row[0]

        cur.execute(
            """
            INSERT INTO campaign_members (id, user_id, campaign_id, role)
            VALUES (gen_random_uuid(), %s, %s, %s)
            ON CONFLICT ON CONSTRAINT uq_user_campaign DO UPDATE
            SET role = EXCLUDED.role
            """,
            (user_zitadel_id, str(campaign_id), campaign_role),
        )
        print(
            f"  Ensured campaign membership: "
            f"user={user_zitadel_id}, role={campaign_role}, "
            f"campaign={campaign_id}"
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


def get_zitadel_org_id(client: httpx.Client, pat: str) -> str:
    """Get the default ZITADEL organization ID."""
    data = api_call(client, "GET", "/management/v1/orgs/me", pat) or {}
    org_id = data.get("org", {}).get("id", "")
    if not org_id:
        print("ERROR: Could not determine ZITADEL org ID", file=sys.stderr)
        sys.exit(1)
    return org_id


def main() -> None:
    verify_policy_only, strict_policy = _parse_flags(sys.argv[1:])

    print("=" * 60)
    if verify_policy_only:
        print("Verify E2E org login policy (no-MFA)")
    else:
        print("Create E2E Test Users (15 users across 5 roles)")
    print("=" * 60)
    print(f"  ZITADEL URL: {ZITADEL_URL}")

    print("\nStep 0: Waiting for ZITADEL...")
    wait_for_zitadel()

    print("\nStep 1: Reading PAT...")
    pat = read_pat()

    with httpx.Client(verify=_VERIFY_TLS) as client:
        print("\nStep 2: Getting ZITADEL org ID...")
        zitadel_org_id = get_zitadel_org_id(client, pat)
        print(f"  ZITADEL org ID: {zitadel_org_id}")

        print("\nStep 3: Ensuring org login policy (no-MFA)...")
        ensure_org_login_policy(
            client,
            pat,
            zitadel_org_id,
            strict=strict_policy,
        )

        if verify_policy_only:
            print("\n" + "=" * 60)
            print("Org login policy verification passed")
            print("=" * 60)
            return

        print("\nStep 4: Finding project...")
        project_id = find_project_id(client, pat)
        print(f"  Project ID: {project_id}")

        print("\nStep 5: Updating seed org ID...")
        update_seed_org_zitadel_id(zitadel_org_id)

        for i, user_def in enumerate(E2E_USERS, 1):
            username = user_def["userName"]
            print(f"\nUser {i}/{len(E2E_USERS)}: Creating '{username}'...")
            user_id = create_human_user(client, pat, user_def)

            print(f"  Granting project role '{user_def['projectRole']}'...")
            grant_project_role(
                client, pat, project_id, user_id, user_def["projectRole"]
            )

            # Ensure user row exists in our DB for ALL users
            display_name = f"{user_def['firstName']} {user_def['lastName']}"
            ensure_user_row(user_id, display_name, user_def["email"])

            # Insert org membership if needed (owner/admin only)
            if user_def["orgRole"]:
                print(f"  Ensuring org membership (role={user_def['orgRole']})...")
                ensure_org_membership(user_id, user_def["orgRole"])

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
