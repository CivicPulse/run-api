---
phase: quick
plan: 260325-tqb
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/bootstrap-zitadel.py
autonomous: true
requirements: [LOGIN-CRITICAL, LOGIN-LOW]

must_haves:
  truths:
    - "ZITADEL issues JWT access tokens (not opaque) for the CivicPulse SPA app"
    - "API backend successfully validates access tokens after login"
    - "admin@localhost user has an 'owner' project role grant on the CivicPulse project"
  artifacts:
    - path: "scripts/bootstrap-zitadel.py"
      provides: "Updated bootstrap that ensures existing SPA apps use JWT tokens and admin user has proper role grant"
  key_links:
    - from: "scripts/bootstrap-zitadel.py"
      to: "ZITADEL Management API"
      via: "PUT /management/v1/projects/{id}/apps/{appId}/oidc to set accessTokenType"
      pattern: "OIDC_TOKEN_TYPE_JWT"
---

<objective>
Fix two issues identified in LOGIN_TEST_REPORT.md: (1) ZITADEL issues opaque access tokens instead of JWTs, causing all API calls to return 401; (2) admin@localhost user may lack proper org/project membership for CivicPulse API access.

Purpose: Make the login flow fully functional end-to-end so authenticated users can access the API.
Output: Updated bootstrap-zitadel.py that fixes both issues for new AND existing ZITADEL instances.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@scripts/bootstrap-zitadel.py
@app/core/security.py
@login-test-screenshots/LOGIN_TEST_REPORT.md

<interfaces>
<!-- Key context for the executor -->

From scripts/bootstrap-zitadel.py:
- `create_spa_app()` already sets `"accessTokenType": "OIDC_TOKEN_TYPE_JWT"` (line 279) for NEW apps
- But the "already exists" path (lines 234-239) returns early without updating token type
- `api_call()` is the helper for all ZITADEL Management API calls (supports GET, POST, PUT, etc.)
- `grant_user_role()` already grants "owner" role to admin user (line 477) — but only on the project, not org membership

From app/core/security.py:
- `JWKSManager.validate_token()` (line 118-143) calls `jwt.decode(token, key_set)` — this ONLY works with JWT tokens, NOT opaque tokens
- `get_current_user()` (line 286) reads `urn:zitadel:iam:user:resourceowner:id` from JWT claims for org_id
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix bootstrap to update existing SPA app token type to JWT</name>
  <files>scripts/bootstrap-zitadel.py</files>
  <action>
Modify `create_spa_app()` in `scripts/bootstrap-zitadel.py` to handle the "app already exists" case properly:

1. When an existing SPA app is found (lines 234-239), extract the app ID from `existing[0]["id"]` and the current `accessTokenType` from `existing[0].get("oidcConfig", {}).get("accessTokenType", "")`.

2. If `accessTokenType` is NOT `"OIDC_TOKEN_TYPE_JWT"`, call the ZITADEL Management API to update it:
   - Use `PUT /management/v1/projects/{project_id}/apps/{app_id}/oidc` with the full OIDC config including `"accessTokenType": "OIDC_TOKEN_TYPE_JWT"`.
   - The PUT endpoint requires the full OIDC configuration to be sent (not a partial update). Extract the existing config from `existing[0]["oidcConfig"]` and override `accessTokenType`.
   - ZITADEL v2 API field mapping: the PUT body needs `redirectUris`, `responseTypes`, `grantTypes`, `appType`, `authMethodType`, `accessTokenType`, `postLogoutRedirectUris`, `devMode` — all available from the existing `oidcConfig`.
   - Log the update: `print(f"  Updated SPA app token type to JWT (was {current_type})")`

3. Always return the `client_id` whether the app was just created, already had JWT, or was updated.

4. To force re-bootstrap (since `validate_existing_env()` short-circuits if credentials work), also add a step in `main()`: after `validate_existing_env()` returns True, still check the SPA token type. The simplest approach: remove the early return from `validate_existing_env()` and always run the full bootstrap flow — the existing idempotent checks (search-before-create, allow_conflict) already handle this safely. Change the flow so `validate_existing_env()` returning True skips only the secret regeneration step (Step 7) to avoid invalidating working credentials, but still runs all other steps.

IMPORTANT: Look up the ZITADEL Management API v1 docs for the exact PUT endpoint schema for updating an OIDC app. The endpoint is `PUT /management/v1/projects/{projectId}/apps/{appId}/oidc` and accepts the OIDC config body. Use the context7 MCP tool to verify the API contract if possible.
  </action>
  <verify>
    <automated>docker compose exec api python -c "
import httpx, os
# Get credentials from env
issuer = os.environ.get('ZITADEL_ISSUER', 'http://localhost:8080')
client_id = os.environ.get('ZITADEL_SERVICE_CLIENT_ID', '')
client_secret = os.environ.get('ZITADEL_SERVICE_CLIENT_SECRET', '')
# Get a token
resp = httpx.post(f'{issuer}/oauth/v2/token', data={'grant_type': 'client_credentials', 'client_id': client_id, 'client_secret': client_secret, 'scope': 'openid'}, verify=False)
token = resp.json().get('access_token', '')
# JWT tokens have 2 dots (header.payload.signature)
dots = token.count('.')
print(f'Token dots: {dots}')
assert dots == 2, f'Expected JWT (2 dots) but got {dots} dots — still opaque!'
print('SUCCESS: Access token is a JWT')
"</automated>
  </verify>
  <done>
    - Running `docker compose up zitadel-bootstrap` on an existing instance updates the SPA app to issue JWT access tokens
    - The access_token returned from `/oauth/v2/token` is a JWT (contains two `.` separators)
    - The bootstrap remains idempotent — running it multiple times is safe
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify and fix admin user org membership for API access</name>
  <files>scripts/bootstrap-zitadel.py</files>
  <action>
The `admin@localhost` user is in the ZITADEL default org, not a CivicPulse org. The bootstrap script already grants the admin user an "owner" project role (Step 8, line 477), which includes org_id in the role claim structure. However, the `get_current_user()` function in security.py has a fallback (lines 313-324) that extracts org_id from the role claim when `urn:zitadel:iam:user:resourceowner:id` points to the wrong org.

Verify this path works by checking the role grant structure. The existing `grant_user_role()` call should produce a JWT with:
```json
"urn:zitadel:iam:org:project:{projectId}:roles": {
  "owner": {"{orgId}": "{domain}"}
}
```

The org_id fallback in security.py (lines 318-324) already extracts the org_id from this nested structure. So the admin user SHOULD work once the JWT token issue is fixed.

Add a verification step to the bootstrap script after the admin role grant (after current Step 8):
1. After granting the admin user the "owner" role, print a summary of what was configured: `print(f"  Admin user {admin_id} granted 'owner' role on project {project_id}")`
2. Add a comment in the code explaining that the admin user's org_id will be resolved from the role claim structure at runtime (not from urn:zitadel:iam:user:resourceowner:id) since admin@localhost belongs to the ZITADEL default org.

No changes needed to security.py — the org_id fallback already handles this case correctly.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/civicpulse/run-api && uv run ruff check scripts/bootstrap-zitadel.py && uv run ruff format --check scripts/bootstrap-zitadel.py</automated>
  </verify>
  <done>
    - bootstrap-zitadel.py passes ruff lint and format checks
    - Code includes clear comments explaining the admin user org resolution path
    - After running bootstrap + fixing JWT tokens, admin@localhost login produces a JWT whose role claims allow the security.py org_id fallback to resolve correctly
  </done>
</task>

</tasks>

<verification>
Full end-to-end verification after both tasks:
1. `docker compose down && docker compose up -d` — rebuild with updated bootstrap
2. Wait for services to be healthy
3. Verify JWT tokens: `docker compose exec api python -c "import httpx, os; resp = httpx.post(os.environ.get('ZITADEL_ISSUER','http://localhost:8080')+'/oauth/v2/token', data={'grant_type':'client_credentials','client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],'scope':'openid'}, verify=False); token=resp.json()['access_token']; assert token.count('.')==2, 'Not a JWT!'; print('JWT OK')"`
4. `uv run ruff check scripts/bootstrap-zitadel.py` — no lint errors
</verification>

<success_criteria>
- ZITADEL issues JWT access tokens (not opaque) for the CivicPulse SPA application
- The bootstrap script is idempotent — works on fresh AND existing ZITADEL instances
- admin@localhost user has proper project role grant for API access
- All code passes ruff lint/format checks
</success_criteria>

<output>
After completion, create `.planning/quick/260325-tqb-resolve-issues-in-login-test-screenshots/260325-tqb-SUMMARY.md`
</output>
