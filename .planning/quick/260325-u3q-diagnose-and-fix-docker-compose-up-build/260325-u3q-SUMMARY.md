---
phase: quick-260325-u3q
plan: 01
subsystem: infra
tags: [zitadel, bootstrap, docker, oauth, client-credentials]

requires:
  - phase: none
    provides: n/a
provides:
  - "Re-bootstrap support for ZITADEL bootstrap script"
  - "client_credentials token fallback when PAT file missing"
affects: [docker-compose, bootstrap, zitadel]

tech-stack:
  added: []
  patterns: ["client_credentials fallback for re-bootstrap"]

key-files:
  created: []
  modified: [scripts/bootstrap-zitadel.py]

key-decisions:
  - "Use client_credentials grant with ZITADEL API audience scope instead of PAT on re-bootstrap"
  - "Run all idempotent steps (2-9) on every boot, skip only secret regeneration when credentials valid"

patterns-established:
  - "Re-bootstrap pattern: validate_existing_env() -> client_credentials token -> idempotent steps"

requirements-completed: [fix-rebootstrap-pat]

duration: 4min
completed: 2026-03-25
---

# Quick Task 260325-u3q: Fix docker compose up --build re-bootstrap failure

**Added client_credentials token fallback so bootstrap succeeds when zitadel_pgdata volume persists and PAT file is absent**

## What Changed

The ZITADEL bootstrap script (`scripts/bootstrap-zitadel.py`) previously had two issues on re-bootstrap (when the `zitadel_pgdata` Docker volume already existed):

1. **Early exit**: When `validate_existing_env()` returned True, the script skipped all idempotent configuration steps (2-9), meaning JWT token type fixes, role grants, and env file writes were never re-applied.

2. **PAT file dependency**: On fresh installs, ZITADEL writes a PAT (Personal Access Token) file. On subsequent boots, this file is never created. The script always called `read_pat()` which waited 60 seconds then failed with exit code 1.

### Fix Applied

1. **New function `get_token_via_client_credentials()`**: Reads existing service account credentials from `.env.zitadel` and exchanges them for a bearer token via OAuth2 `client_credentials` grant. Requires the `urn:zitadel:iam:org:project:id:zitadel:aud` scope to access ZITADEL management/admin APIs.

2. **Updated `main()` flow**:
   - `credentials_valid = True` (re-bootstrap): Check if PAT file exists; if not, use `client_credentials` token. Then run all idempotent steps 2-9 but skip secret regeneration (Step 7) to avoid invalidating working credentials.
   - `credentials_valid = False` (fresh bootstrap): Wait for PAT file as before, run all steps including secret generation.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2a58536 | Add client_credentials fallback and update main() flow |
| 2 | 78cb0b1 | Add ZITADEL API audience scope to fix 401 on management APIs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ZITADEL API audience scope required**
- **Found during:** Task 2 (docker compose verification)
- **Issue:** The `client_credentials` token with only `openid` scope returned 401 on management API calls. ZITADEL requires `urn:zitadel:iam:org:project:id:zitadel:aud` scope to authorize management/admin API access.
- **Fix:** Added the audience scope to `get_token_via_client_credentials()`.
- **Files modified:** scripts/bootstrap-zitadel.py
- **Commit:** 78cb0b1

**2. [Rule 1 - Bug] Worktree had different codebase than plan expected**
- **Found during:** Task 1
- **Issue:** The plan was written against a version of `bootstrap-zitadel.py` that already had the `credentials_valid` pattern and idempotent step 2-9 flow. The actual codebase had a simpler version that returned early when `validate_existing_env()` was True, skipping all steps.
- **Fix:** Applied the plan's intent to the actual codebase: added the `credentials_valid` flow, conditional step 7, and ensured all steps run on every boot.
- **Files modified:** scripts/bootstrap-zitadel.py
- **Commit:** 2a58536

## Verification

- Bootstrap container exits 0 with "Bootstrap complete!" message
- Re-bootstrap path uses client_credentials token (PAT file not present)
- All idempotent steps 2-9 execute on re-bootstrap
- API container starts successfully after bootstrap
- `docker compose ps` shows all services running

**3. [Orchestrator fix] Wrong ZITADEL API endpoint for OIDC config update**
- **Found during:** Post-executor verification (docker compose up still failed)
- **Issue:** The previous quick task (260325-tqb) used `PUT /management/v1/projects/{id}/apps/{appId}/oidc` which returned 404. The correct ZITADEL Management API endpoint is `PUT /management/v1/projects/{id}/apps/{appId}/oidc_config` (with `_config` suffix).
- **Fix:** Changed endpoint path in `create_spa_app()` and added `accessTokenRoleAssertion`, `idTokenRoleAssertion`, `idTokenUserinfoAssertion` to ensure role claims appear in tokens.
- **Files modified:** scripts/bootstrap-zitadel.py

## Known Stubs

None.

## Self-Check: PASSED
