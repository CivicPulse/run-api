"""Bootstrap a local ZITADEL instance for development.

Runs as a one-shot container after ZITADEL starts. Creates the project,
roles, SPA application, and API application (service account credentials),
then writes .env.zitadel with the generated IDs/secrets.
"""

from __future__ import annotations

import os
import sys
import time

import httpx

ZITADEL_DOMAIN = os.environ.get("ZITADEL_DOMAIN", "localhost")
ZITADEL_EXTERNAL_PORT = os.environ.get("ZITADEL_EXTERNAL_PORT", "8080")
ZITADEL_EXTERNAL_SECURE = (
    os.environ.get("ZITADEL_EXTERNAL_SECURE", "false").lower() == "true"
)
# Internal URL for container-to-container calls; scheme follows TLS mode
_INTERNAL_SCHEME = "https" if ZITADEL_EXTERNAL_SECURE else "http"
ZITADEL_URL = os.environ.get("ZITADEL_URL", f"{_INTERNAL_SCHEME}://zitadel:8080")
PAT_PATH = "/zitadel-data/pat.txt"
OUTPUT_PATH = "/home/app/output/.env.zitadel"

PROJECT_NAME = "CivicPulse"
ROLES = ["owner", "admin", "manager", "volunteer", "viewer"]

# Build the external issuer URL (what appears in JWTs and what browsers use)
_SCHEME = "https" if ZITADEL_EXTERNAL_SECURE else "http"
EXTERNAL_ISSUER = f"{_SCHEME}://{ZITADEL_DOMAIN}:{ZITADEL_EXTERNAL_PORT}"

# Always skip TLS verification for internal container-to-container calls.
# The TLS cert is issued for the external domain (e.g. dev.tailb56d83.ts.net)
# but internal calls connect to Docker hostname "zitadel", which won't match.
_VERIFY_TLS = False


def wait_for_zitadel() -> None:
    """Wait for ZITADEL to be ready by polling the health endpoint."""
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
    """Read the PAT written by ZITADEL's first-instance setup."""
    # ZITADEL writes the PAT file at PATPATH — retry until it appears
    for attempt in range(30):
        try:
            with open(PAT_PATH) as f:
                token = f.read().strip()
            if token:
                print(f"  Read PAT from {PAT_PATH}")
                return token
        except (FileNotFoundError, OSError):
            pass
        if attempt < 29:
            time.sleep(2)
    print("ERROR: Could not read PAT after 60 seconds", file=sys.stderr)
    sys.exit(1)


def _host_header() -> str:
    """Build the Host header ZITADEL expects (matching ExternalDomain)."""
    return f"{ZITADEL_DOMAIN}:{ZITADEL_EXTERNAL_PORT}"


def api_call(
    client: httpx.Client,
    method: str,
    path: str,
    pat: str,
    json: dict | None = None,
    *,
    allow_conflict: bool = False,
) -> dict | None:
    """Make an authenticated call to the ZITADEL API.

    Uses verify=False because internal Docker networking uses the hostname
    'zitadel' but the TLS cert is for 'dev.tailb56d83.ts.net'.
    """
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


def get_machine_user_id(client: httpx.Client, pat: str) -> str:
    """Find the machine user ID by searching for the run-api-service username."""
    data = api_call(
        client,
        "POST",
        "/management/v1/users/_search",
        pat,
        json={
            "queries": [
                {
                    "userNameQuery": {
                        "userName": "run-api-service",
                        "method": "TEXT_QUERY_METHOD_EQUALS",
                    }
                }
            ]
        },
    )
    users = data.get("result", [])
    if not users:
        print("ERROR: Machine user 'run-api-service' not found", file=sys.stderr)
        sys.exit(1)
    return users[0]["id"]


def grant_iam_owner(client: httpx.Client, pat: str, user_id: str) -> None:
    """Grant IAM_OWNER role to the machine user."""
    print("  Granting IAM_OWNER to machine user...")
    result = api_call(
        client,
        "POST",
        "/admin/v1/members",
        pat,
        json={"userId": user_id, "roles": ["IAM_OWNER"]},
        allow_conflict=True,
    )
    if result is not None:
        print("  IAM_OWNER granted")


def create_project(client: httpx.Client, pat: str) -> str:
    """Create the CivicPulse project (or find existing)."""
    # Search for existing project first
    search = api_call(
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
    existing = search.get("result", [])
    if existing:
        project_id = existing[0]["id"]
        print(f"  Project '{PROJECT_NAME}' already exists: {project_id}")
        return project_id

    data = api_call(
        client,
        "POST",
        "/management/v1/projects",
        pat,
        json={
            "name": PROJECT_NAME,
            "projectRoleAssertion": True,
            "projectRoleCheck": True,
        },
    )
    project_id = data.get("id")
    if not project_id:
        print(f"ERROR: Missing 'id' in API response: {data}", file=sys.stderr)
        sys.exit(1)
    print(f"  Created project '{PROJECT_NAME}': {project_id}")
    return project_id


def add_project_roles(client: httpx.Client, pat: str, project_id: str) -> None:
    """Add the campaign roles to the project."""
    print(f"  Adding roles: {ROLES}")
    api_call(
        client,
        "POST",
        f"/management/v1/projects/{project_id}/roles/_bulk",
        pat,
        json={
            "roles": [{"key": role, "displayName": role.capitalize()} for role in ROLES]
        },
        allow_conflict=True,
    )


def create_spa_app(client: httpx.Client, pat: str, project_id: str) -> str:
    """Create the SPA (PKCE) OIDC application for the browser."""
    # Check for existing app
    search = api_call(
        client,
        "POST",
        f"/management/v1/projects/{project_id}/apps/_search",
        pat,
        json={
            "queries": [
                {
                    "nameQuery": {
                        "name": "CivicPulse SPA",
                        "method": "TEXT_QUERY_METHOD_EQUALS",
                    }
                }
            ]
        },
    )
    existing = search.get("result", [])
    # Build redirect URIs for both localhost and optional Tailscale domain.
    # Include both dev-server and preview-server HTTPS origins because the
    # frontend derives redirect_uri from window.location.origin at runtime.
    redirect_uris = [
        "http://localhost:5173/callback",
        "https://localhost:5173/callback",
        "http://localhost:8000/callback",
        "https://localhost:4173/callback",
    ]
    post_logout_uris = [
        "http://localhost:5173",
        "https://localhost:5173",
        "http://localhost:8000",
        "https://localhost:4173",
    ]

    if existing:
        app_id = existing[0]["id"]
        oidc_config = existing[0].get("oidcConfig", {})
        client_id = oidc_config.get("clientId", "")
        current_type = oidc_config.get("accessTokenType", "")
        current_redirects = set(oidc_config.get("redirectUris", []))
        current_post_logout = set(oidc_config.get("postLogoutRedirectUris", []))
        needs_redirect_update = not set(redirect_uris).issubset(current_redirects)
        needs_logout_update = not set(post_logout_uris).issubset(current_post_logout)
        needs_token_update = current_type != "OIDC_TOKEN_TYPE_JWT"
        print(f"  SPA app already exists, clientId: {client_id}")

        # Ensure the existing app keeps the full redirect URI set required by
        # worktree E2E/dev-server flows and issues JWT access tokens.
        if needs_redirect_update or needs_logout_update or needs_token_update:
            print("  Updating existing SPA app OIDC config...")
            update_body = {
                "redirectUris": sorted(current_redirects.union(redirect_uris)),
                "responseTypes": oidc_config.get("responseTypes", []),
                "grantTypes": oidc_config.get("grantTypes", []),
                "appType": oidc_config.get("appType", "OIDC_APP_TYPE_USER_AGENT"),
                "authMethodType": oidc_config.get(
                    "authMethodType", "OIDC_AUTH_METHOD_TYPE_NONE"
                ),
                "postLogoutRedirectUris": sorted(
                    current_post_logout.union(post_logout_uris)
                ),
                "devMode": oidc_config.get("devMode", True),
                "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
                "accessTokenRoleAssertion": True,
                "idTokenRoleAssertion": True,
                "idTokenUserinfoAssertion": True,
            }
            api_call(
                client,
                "PUT",
                f"/management/v1/projects/{project_id}/apps/{app_id}/oidc_config",
                pat,
                json=update_body,
            )
            print("  Updated existing SPA app OIDC config")

        return client_id
    if ZITADEL_DOMAIN != "localhost":
        redirect_uris.extend(
            [
                f"http://{ZITADEL_DOMAIN}:5173/callback",
                f"https://{ZITADEL_DOMAIN}:5173/callback",
                f"http://{ZITADEL_DOMAIN}:8000/callback",
                f"https://{ZITADEL_DOMAIN}:8000/callback",
            ]
        )
        post_logout_uris.extend(
            [
                f"http://{ZITADEL_DOMAIN}:5173",
                f"https://{ZITADEL_DOMAIN}:5173",
            ]
        )

    data = api_call(
        client,
        "POST",
        f"/management/v1/projects/{project_id}/apps/oidc",
        pat,
        json={
            "name": "CivicPulse SPA",
            "redirectUris": redirect_uris,
            "postLogoutRedirectUris": post_logout_uris,
            "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
            "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
            "appType": "OIDC_APP_TYPE_USER_AGENT",
            "authMethodType": "OIDC_AUTH_METHOD_TYPE_NONE",
            "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
            "devMode": True,
        },
    )
    client_id = data.get("clientId", "")
    print(f"  Created SPA app, clientId: {client_id}")
    return client_id


def generate_machine_secret(
    client: httpx.Client, pat: str, user_id: str
) -> tuple[str, str]:
    """Generate a client secret for the machine user (for client_credentials).

    ZITADEL returns the machine user's username as the OAuth2 client_id
    (not the numeric user ID).
    """
    data = api_call(
        client,
        "PUT",
        f"/management/v1/users/{user_id}/secret",
        pat,
    )
    client_id = data.get("clientId", "")
    client_secret = data.get("clientSecret", "")
    print(f"  Generated secret: clientId={client_id}")
    return client_id, client_secret


INSTANCE_LOGIN_POLICY = {
    "allowUsernamePassword": True,
    "allowRegister": False,
    "allowExternalIdp": True,
    "forceMfa": False,
    "secondFactors": [],
    "multiFactors": [],
    # Lifetime fields MUST be set explicitly — omitting them causes ZITADEL
    # to default to "0s", which makes every successful password check expire
    # instantly and produces an infinite login redirect loop.
    "passwordCheckLifetime": "864000s",
    "externalLoginCheckLifetime": "864000s",
    "mfaInitSkipLifetime": "2592000s",
    "secondFactorCheckLifetime": "64800s",
    "multiFactorCheckLifetime": "43200s",
}


def set_instance_login_policy(client: httpx.Client, pat: str) -> None:
    """Set the instance-level login policy with explicit session lifetimes.

    Omitting lifetime fields causes ZITADEL to use "0s" defaults, which
    makes sessions expire immediately after login — creating an infinite
    redirect loop. This sets sane defaults on the instance policy so all
    orgs (including the default org) inherit them.

    ZITADEL returns 400 "not changed" when the submitted values are identical
    to the current policy — treat that as idempotent success.
    """
    print("  Setting instance login policy...")
    resp = client.request(
        "PUT",
        f"{ZITADEL_URL}/admin/v1/policies/login",
        headers={
            "Authorization": f"Bearer {pat}",
            "Host": _host_header(),
        },
        json=INSTANCE_LOGIN_POLICY,
        timeout=30,
    )
    if resp.status_code == 400 and "not been changed" in resp.text:
        print("  Instance login policy already up to date")
        return
    if resp.status_code >= 400:
        print(
            f"ERROR: PUT /admin/v1/policies/login -> {resp.status_code}: {resp.text}",
        )
        resp.raise_for_status()
    print("  Instance login policy set")


def reset_admin_password(client: httpx.Client, pat: str, user_id: str) -> None:
    """Reset the admin user password via the v2 API with changeRequired=false.

    The v1 Management SetHumanPassword endpoint ignores changeRequired=false
    in ZITADEL v2.71.x, always marking the password as requiring a change.
    The v2 API correctly respects the flag.
    """
    if not user_id:
        return
    password = os.environ.get("ZITADEL_ADMIN_PASSWORD", "Admin1234!")
    api_call(
        client,
        "POST",
        f"/v2/users/{user_id}/password",
        pat,
        json={
            "newPassword": {
                "password": password,
                "changeRequired": False,
            },
        },
    )
    print("  Reset admin password via v2 API (changeRequired=false)")


def get_admin_user_id(client: httpx.Client, pat: str) -> str:
    """Find the admin human user ID."""
    data = api_call(
        client,
        "POST",
        "/management/v1/users/_search",
        pat,
        json={
            "queries": [
                {
                    "userNameQuery": {
                        "userName": "admin@localhost",
                        "method": "TEXT_QUERY_METHOD_EQUALS",
                    }
                }
            ]
        },
    )
    users = data.get("result", [])
    if not users:
        print("  Warning: admin user not found, skipping grant")
        return ""
    return users[0]["id"]


def get_admin_resource_owner_org(client: httpx.Client, pat: str, user_id: str) -> str:
    """Return the ZITADEL org ID that owns the admin user (their home org).

    The admin user's home org is the ZITADEL default/first-instance org.
    Its ID ends up in the JWT role claim keys and in `resourceowner:id`,
    so it is the org_id the app sees when the admin logs in.  We need a
    matching row in the DB `organizations` table so the admin can create
    campaigns.
    """
    if not user_id:
        return ""
    data = api_call(client, "GET", f"/management/v1/users/{user_id}", pat)
    org_id = (data or {}).get("user", {}).get("details", {}).get("resourceOwner", "")
    if not org_id:
        # Fallback: top-level resourceOwner (older API shape)
        org_id = (data or {}).get("resourceOwner", "")
    print(f"  Admin user resource owner org: {org_id}")
    return org_id


def grant_user_role(
    client: httpx.Client, pat: str, project_id: str, user_id: str, role: str
) -> None:
    """Grant a project role to a user."""
    if not user_id:
        return
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
    print(f"  Granted role '{role}' to user {user_id}")


def write_env_file(
    project_id: str,
    spa_client_id: str,
    api_client_id: str,
    api_client_secret: str,
    admin_user_id: str = "",
    dev_org_zitadel_id: str = "",
) -> None:
    """Write .env.zitadel with the generated credentials."""
    # ZITADEL_BASE_URL is the internal Docker URL for container-to-container calls
    base_url = f"{_INTERNAL_SCHEME}://zitadel:8080"
    content = f"""\
# Auto-generated by bootstrap-zitadel.py — do not edit manually
# Regenerate by removing this file and running: docker compose up zitadel-bootstrap
ZITADEL_ISSUER={EXTERNAL_ISSUER}
ZITADEL_BASE_URL={base_url}
ZITADEL_PROJECT_ID={project_id}
ZITADEL_SERVICE_CLIENT_ID={api_client_id}
ZITADEL_SERVICE_CLIENT_SECRET={api_client_secret}
ZITADEL_SPA_CLIENT_ID={spa_client_id}
VITE_ZITADEL_ISSUER={EXTERNAL_ISSUER}
VITE_ZITADEL_CLIENT_ID={spa_client_id}
VITE_ZITADEL_PROJECT_ID={project_id}
# Dev org — used by ensure-dev-org.py to seed the DB organizations table
DEV_ADMIN_ZITADEL_ID={admin_user_id}
DEV_ORG_ZITADEL_ID={dev_org_zitadel_id}
# Also exposed as SEED_ZITADEL_ORG_ID so seed.py uses the real org
SEED_ZITADEL_ORG_ID={dev_org_zitadel_id}
"""
    with open(OUTPUT_PATH, "w") as f:
        f.write(content)
    print(f"  Wrote {OUTPUT_PATH}")

    # Also write to the shared zitadel-data volume so the API container
    # can source it at runtime on first boot (before env_file is resolved).
    zitadel_data_path = "/zitadel-data/env.zitadel"
    try:
        with open(zitadel_data_path, "w") as f:
            f.write(content)
        print(f"  Wrote {zitadel_data_path}")
    except OSError as exc:
        print(f"ERROR: Could not write {zitadel_data_path}: {exc}", file=sys.stderr)
        sys.exit(1)


def get_token_via_client_credentials(env_path: str) -> str:
    """Obtain a bearer token via client_credentials grant.

    Used on re-bootstrap when the PAT file no longer exists but
    service account credentials are already stored in .env.zitadel.
    """
    env_vars: dict[str, str] = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env_vars[key] = value

    client_id = env_vars.get("ZITADEL_SERVICE_CLIENT_ID", "")
    client_secret = env_vars.get("ZITADEL_SERVICE_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        print(
            "ERROR: Cannot obtain token — missing client_id/secret in env file",
            file=sys.stderr,
        )
        sys.exit(1)

    # Request the ZITADEL API audience scope so the token can call
    # management/admin APIs, plus openid for standard OIDC compliance.
    scope = "openid urn:zitadel:iam:org:project:id:zitadel:aud"

    try:
        with httpx.Client(verify=_VERIFY_TLS) as http:
            resp = http.post(
                f"{ZITADEL_URL}/oauth/v2/token",
                headers={"Host": _host_header()},
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": scope,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                token = resp.json().get("access_token", "")
                if token:
                    return token
            print(
                f"ERROR: client_credentials token request failed "
                f"({resp.status_code}): {resp.text}",
                file=sys.stderr,
            )
            sys.exit(1)
    except Exception as exc:
        print(
            f"ERROR: client_credentials token request failed: {exc}",
            file=sys.stderr,
        )
        sys.exit(1)


def validate_existing_env() -> bool:
    """Check if .env.zitadel exists and credentials still work."""
    if not os.path.exists(OUTPUT_PATH):
        return False

    # Read existing values
    env_vars: dict[str, str] = {}
    with open(OUTPUT_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env_vars[key] = value

    client_id = env_vars.get("ZITADEL_SERVICE_CLIENT_ID", "")
    client_secret = env_vars.get("ZITADEL_SERVICE_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        print("  Existing .env.zitadel is incomplete, recreating...")
        return False

    # Try a token exchange to verify credentials
    try:
        with httpx.Client(verify=_VERIFY_TLS) as client:
            resp = client.post(
                f"{ZITADEL_URL}/oauth/v2/token",
                headers={"Host": _host_header()},
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": "openid",
                },
                timeout=10,
            )
            if resp.status_code == 200:
                print("  Existing .env.zitadel credentials are valid")
                return True
            print(f"  Existing credentials invalid ({resp.status_code}), recreating...")
            return False
    except Exception as exc:
        print(f"  Could not validate existing credentials: {exc}")
        return False


def main() -> None:
    print("=" * 60)
    print("ZITADEL Bootstrap")
    print("=" * 60)
    print(f"  ZITADEL URL: {ZITADEL_URL}")
    print(f"  External issuer: {EXTERNAL_ISSUER}")
    print(f"  Domain: {ZITADEL_DOMAIN}")

    print("\nStep 0: Waiting for ZITADEL to be ready...")
    wait_for_zitadel()

    # Check if already bootstrapped — if credentials are valid, skip only
    # the secret regeneration step (Step 7) to avoid invalidating working
    # credentials. All other steps are idempotent and must still run to
    # ensure configuration (e.g. JWT token type, role grants) is correct.
    credentials_valid = validate_existing_env()

    print("\nStep 1: Obtaining bearer token...")
    if credentials_valid:
        # Re-bootstrap: PAT file may not exist (only written on first init).
        if os.path.exists(PAT_PATH):
            pat = read_pat()
        else:
            print(f"  PAT file {PAT_PATH} not found (expected on re-bootstrap)")
            pat = get_token_via_client_credentials(OUTPUT_PATH)
            print("  Obtained bearer token via client_credentials")
    else:
        # Fresh bootstrap: must wait for ZITADEL to write the PAT file.
        pat = read_pat()

    print("\nStep 2: Finding machine user...")
    with httpx.Client(verify=_VERIFY_TLS) as client:
        user_id = get_machine_user_id(client, pat)
        print(f"  Machine user ID: {user_id}")

        print("\nStep 3: Granting IAM_OWNER...")
        grant_iam_owner(client, pat, user_id)

        print("\nStep 4: Creating project...")
        project_id = create_project(client, pat)

        print("\nStep 5: Adding project roles...")
        add_project_roles(client, pat, project_id)

        print("\nStep 6: Creating SPA application...")
        spa_client_id = create_spa_app(client, pat, project_id)

        if credentials_valid:
            # Credentials still work — read existing values instead of
            # regenerating (which would invalidate current secrets).
            print("\nStep 7: Skipping secret regeneration (existing credentials valid)")
            env_vars: dict[str, str] = {}
            with open(OUTPUT_PATH) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        env_vars[key] = value
            api_client_id = env_vars.get("ZITADEL_SERVICE_CLIENT_ID", "")
            api_client_secret = env_vars.get("ZITADEL_SERVICE_CLIENT_SECRET", "")
        else:
            print("\nStep 7: Generating service account secret...")
            api_client_id, api_client_secret = generate_machine_secret(
                client, pat, user_id
            )

        print("\nStep 8: Setting instance login policy...")
        set_instance_login_policy(client, pat)

        print("\nStep 9: Granting admin user role on project...")
        admin_id = get_admin_user_id(client, pat)
        # Grant the admin user an "owner" project role. Note: admin@localhost
        # belongs to the ZITADEL default org, not a CivicPulse org.  At
        # runtime, security.py's get_current_user() resolves the org_id from
        # the role claim structure (the nested dict inside
        # "urn:zitadel:iam:org:project:{pid}:roles") rather than from
        # "urn:zitadel:iam:user:resourceowner:id", so this grant provides
        # the correct org_id for API access.
        grant_user_role(client, pat, project_id, admin_id, "owner")
        if admin_id:
            print(
                f"  Admin user {admin_id} granted 'owner' role on project {project_id}"
            )

        print("\nStep 10: Resetting admin password (v2 API, changeRequired=false)...")
        reset_admin_password(client, pat, admin_id)

        print("\nStep 11: Fetching admin user's home org (for dev DB seed)...")
        dev_org_zitadel_id = get_admin_resource_owner_org(client, pat, admin_id)

    print("\nStep 12: Writing .env.zitadel...")
    write_env_file(
        project_id,
        spa_client_id,
        api_client_id,
        api_client_secret,
        admin_user_id=admin_id,
        dev_org_zitadel_id=dev_org_zitadel_id,
    )

    print("\n" + "=" * 60)
    print("Bootstrap complete!")
    print(f"  ZITADEL Console: {EXTERNAL_ISSUER}")
    print("  Admin login: admin@localhost / Admin1234!")
    print("=" * 60)


if __name__ == "__main__":
    main()
