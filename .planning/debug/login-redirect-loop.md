---
status: awaiting_human_verify
trigger: "Can't login using known creds to the local dev instance hosted by docker compose. Redirect loop / stuck during login."
created: 2026-03-31T00:00:00Z
updated: 2026-03-31T22:32:00Z
---

## Current Focus

hypothesis: CONFIRMED - Two ZITADEL configuration issues caused login failure
test: Run all 5 E2E auth setup tests
expecting: All pass
next_action: Await user verification of manual login

## Symptoms

expected: Login via ZITADEL OIDC completes successfully and user lands in the app dashboard
actual: Redirect loop / stuck during login - page redirects endlessly or hangs without completing login
errors: No explicit error messages reported - redirect loop
reproduction: Web UI login in browser - click login, get redirected to ZITADEL, then redirect loop occurs
started: Worked recently, broke suddenly after create-e2e-users.py was updated (commit 74de109)

## Eliminated

- hypothesis: OIDC configuration mismatch (wrong redirect URIs, client IDs)
  evidence: ZITADEL app config, /api/v1/config/public, and .env.zitadel all consistent. Redirect URIs include http://localhost:5173/callback.
  timestamp: 2026-03-31T22:18:00Z

- hypothesis: ZITADEL service down or unhealthy
  evidence: All docker compose services running. ZITADEL OIDC discovery endpoint returns valid config. Token endpoint works.
  timestamp: 2026-03-31T22:18:00Z

- hypothesis: Frontend auth code (authStore, callback, login routes) broken
  evidence: Code review shows correct OIDC flow. Config loads from /api/v1/config/public correctly. Issue is on ZITADEL side.
  timestamp: 2026-03-31T22:20:00Z

## Evidence

- timestamp: 2026-03-31T22:18:00Z
  checked: ZITADEL well-known endpoint and SPA app config
  found: Configuration correct - client ID 366542080375324677, redirect URIs include http://localhost:5173/callback
  implication: OIDC config is not the problem

- timestamp: 2026-03-31T22:20:00Z
  checked: E2E auth test and Playwright login flow tracing
  found: After entering password and submitting, ZITADEL returns 200 on /ui/login/password (reloads same page). No error shown. No ZITADEL server logs for password verification.
  implication: Password check is failing silently or not being processed

- timestamp: 2026-03-31T22:22:00Z
  checked: ZITADEL org login policy vs instance default policy
  found: Org policy has passwordCheckLifetime="0s" (all lifetime fields at 0). Default instance policy has passwordCheckLifetime="864000s" (10 days). The org policy was set by create-e2e-users.py commit 74de109 which added NO_MFA_LOGIN_POLICY without lifetime fields.
  implication: ROOT CAUSE 1 - Zero passwordCheckLifetime makes password checks expire instantly, creating infinite loop

- timestamp: 2026-03-31T22:25:00Z
  checked: Login after fixing policy lifetimes to 864000s
  found: Login now progresses past password step but ZITADEL shows "Change Password" screen
  implication: Password accepted but user has passwordChangeRequired flag set

- timestamp: 2026-03-31T22:26:00Z
  checked: ZITADEL v2 user API for admin1@localhost
  found: passwordChangeRequired=true despite create-e2e-users.py using changeRequired=false in management v1 SetHumanPassword
  implication: ROOT CAUSE 2 - Management v1 SetHumanPassword ignores changeRequired:false. V2 API works correctly.

- timestamp: 2026-03-31T22:28:00Z
  checked: Login after resetting password via v2 API (changeRequired:false)
  found: Login completes successfully, user lands on app dashboard
  implication: Both root causes confirmed and fix verified

- timestamp: 2026-03-31T22:31:00Z
  checked: All 5 E2E auth setup tests (admin, owner, manager, volunteer, viewer)
  found: All 5 pass in 4.5s
  implication: Fix works for all user roles

## Resolution

root_cause: |
  Two issues in create-e2e-users.py (introduced in commit 74de109) broke ZITADEL login:

  1. **Org login policy missing lifetime fields**: NO_MFA_LOGIN_POLICY dict omitted
     passwordCheckLifetime and other lifetime fields. ZITADEL defaults these to "0s",
     making password checks expire instantly after success -> infinite login loop.

  2. **Management v1 SetHumanPassword ignores changeRequired:false**: The ensure_user_password
     function used /management/v1/users/{id}/password which sets passwordChangeRequired=true
     regardless of the changeRequired field. Users get stuck on "Change Password" screen.

fix: |
  In scripts/create-e2e-users.py:
  1. Added explicit lifetime fields to NO_MFA_LOGIN_POLICY (passwordCheckLifetime="864000s", etc.)
  2. Added passwordCheckLifetime != "0s" check to _is_compliant_no_mfa_policy()
  3. Switched ensure_user_password() from management v1 to v2 API (/v2/users/{id}/password)
     which correctly respects changeRequired:false

  Also manually fixed the existing ZITADEL org login policy and reset all user passwords via v2 API.

verification: |
  - Manual Playwright login test: admin1@localhost logs in successfully, lands on dashboard
  - All 5 E2E auth setup tests pass (admin, owner, manager, volunteer, viewer) in 4.5s
  - ZITADEL org login policy verified: passwordCheckLifetime="864000s"
  - admin1@localhost verified: passwordChangeRequired is absent (false)

files_changed:
  - scripts/create-e2e-users.py
