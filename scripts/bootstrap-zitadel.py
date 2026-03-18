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

ZITADEL_URL = os.environ.get("ZITADEL_URL", "http://zitadel:8080")
ZITADEL_DOMAIN = os.environ.get("ZITADEL_DOMAIN", "localhost")
ZITADEL_EXTERNAL_PORT = os.environ.get("ZITADEL_EXTERNAL_PORT", "8080")
PAT_PATH = "/zitadel-pat/pat.txt"
OUTPUT_PATH = "/home/app/output/.env.zitadel"

PROJECT_NAME = "CivicPulse"
ROLES = ["owner", "admin", "manager", "volunteer", "viewer"]

# Build the external issuer URL (what appears in JWTs and what browsers use)
EXTERNAL_ISSUER = f"http://{ZITADEL_DOMAIN}:{ZITADEL_EXTERNAL_PORT}"


def read_pat() -> str:
    """Read the PAT written by ZITADEL's first-instance setup."""
    # ZITADEL writes the PAT file asynchronously — retry a few times
    for attempt in range(30):
        try:
            # ZITADEL writes PAT files as <username>_pat.txt in the PATPATH dir
            pat_dir = "/zitadel-pat"
            for fname in os.listdir(pat_dir):
                if fname.endswith("_pat.txt") or fname == "pat.txt":
                    path = os.path.join(pat_dir, fname)
                    with open(path) as f:
                        token = f.read().strip()
                    if token:
                        print(f"  Read PAT from {path}")
                        return token
            raise FileNotFoundError("No PAT file found yet")
        except (FileNotFoundError, OSError):
            if attempt < 29:
                time.sleep(2)
            continue
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
    """Make an authenticated call to the ZITADEL API."""
    resp = client.request(
        method,
        f"{ZITADEL_URL}{path}",
        headers={"Authorization": f"Bearer {pat}"},
        json=json,
        timeout=30,
    )
    if allow_conflict and resp.status_code == 409:
        print(f"  {path} -> already exists (409), skipping")
        return None
    if resp.status_code >= 400:
        print(f"ERROR: {method} {path} -> {resp.status_code}: {resp.text}", file=sys.stderr)
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
    project_id = data["id"]
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
            "roles": [
                {"key": role, "displayName": role.capitalize()}
                for role in ROLES
            ]
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
    if existing:
        client_id = existing[0].get("oidcConfig", {}).get("clientId", "")
        print(f"  SPA app already exists, clientId: {client_id}")
        return client_id

    # Build redirect URIs for both localhost and optional Tailscale domain
    redirect_uris = [
        "http://localhost:5173/callback",
        "http://localhost:8000/callback",
    ]
    post_logout_uris = [
        "http://localhost:5173",
        "http://localhost:8000",
    ]
    if ZITADEL_DOMAIN != "localhost":
        redirect_uris.extend([
            f"http://{ZITADEL_DOMAIN}:5173/callback",
            f"https://{ZITADEL_DOMAIN}:5173/callback",
            f"http://{ZITADEL_DOMAIN}:8000/callback",
            f"https://{ZITADEL_DOMAIN}:8000/callback",
        ])
        post_logout_uris.extend([
            f"http://{ZITADEL_DOMAIN}:5173",
            f"https://{ZITADEL_DOMAIN}:5173",
        ])

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
            "devMode": True,
        },
    )
    client_id = data.get("clientId", "")
    print(f"  Created SPA app, clientId: {client_id}")
    return client_id


def create_api_app(
    client: httpx.Client, pat: str, project_id: str
) -> tuple[str, str]:
    """Create an API application for the service account (client_credentials)."""
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
                        "name": "CivicPulse API",
                        "method": "TEXT_QUERY_METHOD_EQUALS",
                    }
                }
            ]
        },
    )
    existing = search.get("result", [])
    if existing:
        api_config = existing[0].get("apiConfig", {})
        client_id = api_config.get("clientId", "")
        print(f"  API app already exists, clientId: {client_id}")
        # Can't retrieve the secret for an existing app — return empty
        # The .env.zitadel file should still have it from initial creation
        return client_id, ""

    data = api_call(
        client,
        "POST",
        f"/management/v1/projects/{project_id}/apps/api",
        pat,
        json={
            "name": "CivicPulse API",
            "authMethodType": "API_AUTH_METHOD_TYPE_BASIC",
        },
    )
    client_id = data.get("clientId", "")
    client_secret = data.get("clientSecret", "")
    print(f"  Created API app, clientId: {client_id}")
    return client_id, client_secret


def write_env_file(
    project_id: str,
    spa_client_id: str,
    api_client_id: str,
    api_client_secret: str,
) -> None:
    """Write .env.zitadel with the generated credentials."""
    content = f"""\
# Auto-generated by bootstrap-zitadel.py — do not edit manually
# Regenerate by removing this file and running: docker compose up zitadel-bootstrap
ZITADEL_ISSUER={EXTERNAL_ISSUER}
ZITADEL_PROJECT_ID={project_id}
ZITADEL_SERVICE_CLIENT_ID={api_client_id}
ZITADEL_SERVICE_CLIENT_SECRET={api_client_secret}
ZITADEL_SPA_CLIENT_ID={spa_client_id}
VITE_ZITADEL_ISSUER={EXTERNAL_ISSUER}
VITE_ZITADEL_CLIENT_ID={spa_client_id}
VITE_ZITADEL_PROJECT_ID={project_id}
"""
    with open(OUTPUT_PATH, "w") as f:
        f.write(content)
    print(f"  Wrote {OUTPUT_PATH}")


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
        with httpx.Client() as client:
            resp = client.post(
                f"{ZITADEL_URL}/oauth/v2/token",
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

    # Check if already bootstrapped
    if validate_existing_env():
        print("Bootstrap already complete, skipping.")
        return

    print("\nStep 1: Reading PAT...")
    pat = read_pat()

    print("\nStep 2: Finding machine user...")
    with httpx.Client() as client:
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

        print("\nStep 7: Creating API application...")
        api_client_id, api_client_secret = create_api_app(client, pat, project_id)

    print("\nStep 8: Writing .env.zitadel...")
    write_env_file(project_id, spa_client_id, api_client_id, api_client_secret)

    print("\n" + "=" * 60)
    print("Bootstrap complete!")
    print(f"  ZITADEL Console: {EXTERNAL_ISSUER}")
    print(f"  Admin login: admin@localhost / Admin1234!")
    print("=" * 60)


if __name__ == "__main__":
    main()
