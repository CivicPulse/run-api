# DIY Auth Plan — Replace ZITADEL with fastapi-users

**Created:** 2026-04-23
**Branch:** `feat/native-auth-step-1-fastapi-users` (Step 1)
**Decision record:** `.planning/notes/decision-drop-zitadel-diy-auth.md`

## Locked decisions

- **Stack:** `fastapi-users` 15.0.5 + `CookieTransport` (httpOnly, SameSite=Lax) + `DatabaseStrategy` (Postgres-backed tokens — no Redis)
- **Email verification:** Mandatory. Unverified users cannot log in. Invited users are auto-verified on invite acceptance (accepting the invite proves email ownership).
- **Session lifetime:** 7-day sliding (token `created_at` refreshed on each authenticated request)
- **Password policy:** min 12 chars + zxcvbn score ≥ 3 (blocks common passwords)
- **User PK strategy:** Keep `User.id` as `String(255)`. `SQLAlchemyBaseUserTable[str]`. New native users get a UUID-string id; existing ZITADEL users keep their `sub` claim as id. No PK migration.

## Why an agent team was rejected

Six sequential steps with hard dependencies between them. Parallel agents on linear work create merge conflicts faster than they save time. Parallelism is only used within Step 5 (chunking frontend page rewrites) and Step 3 (CSRF + password-reset flows touch disjoint files).

## Steps

### Step 1 — Backend: add fastapi-users alongside ZITADEL
- `uv add fastapi-users[sqlalchemy]`
- Alembic migration: add `hashed_password`, `email_verified`, `is_active` columns to `users` (nullable)
- Update `User` model to inherit `SQLAlchemyBaseUserTable[str]`
- New `app/auth/` module: `UserManager`, `CookieTransport`, `DatabaseStrategy`, access-token table
- Register `/auth/login`, `/auth/logout`, `/auth/register` routes on the main app
- Keep existing ZITADEL `current_user` dependency untouched
- Add `current_user_native` dependency for cookie-based sessions
- **Exit criteria:** both auth stacks work. `POST /auth/login` returns a session cookie. Nothing consumes it yet. All existing tests still pass.

### Step 2 — CSRF middleware
- `app/core/middleware/csrf.py`
- Double-submit-cookie OR origin/referer check on state-changing methods (POST/PUT/PATCH/DELETE)
- Skip for `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` (these carry their own tokens or are entry points)
- **Exit criteria:** CSRF header required for mutating calls on cookie-authenticated sessions; bearer-token (ZITADEL) requests bypass as before.

### Step 3 — Password reset + mandatory email verification
- `POST /auth/forgot-password` → email a time-limited reset token
- `POST /auth/reset-password` → consume token, set new password
- `POST /auth/request-verify` → resend verification email
- `POST /auth/verify` → consume verify token, set `email_verified=true`
- Login denies unverified users with 403 "verify your email" + resend action
- Password policy enforced in `UserManager.validate_password`: ≥12 chars, zxcvbn score ≥3
- **Exit criteria:** end-to-end register → receive verify email → click → log in works in dev.

### Step 4 — User backfill + seed script
- One-time script: for each existing ZITADEL user without `hashed_password`, issue password-reset token, email with "we're upgrading login — click here to set password"
- Update `scripts/seed.py` to create users with `hashed_password` + `email_verified=true` directly (no ZITADEL bootstrap)
- Invite flow (`POST /invites/{token}/accept`) sets a password and `email_verified=true` in one step (replaces ZITADEL `CreateInviteCode` call in `app/services/zitadel.py`)
- Grace period: `current_user` continues to accept both ZITADEL JWT and native cookie during cutover
- **Exit criteria:** seed runs, creates users that can log in natively. Invite acceptance works natively.

### Step 5 — Frontend cutover
Can be chunked across 2-3 agents working different routes:
- **Agent A — login:** rewrite `web/src/routes/login.tsx` as email+password form → `POST /auth/login`; drop redirect to ZITADEL
- **Agent B — callbacks + store:** delete `callback.tsx`, `callback-state.ts`, `oidc-client-ts` dep; rewrite `authStore.ts` to fetch user from `GET /auth/me`
- **Agent C — new routes:** `/register`, `/forgot-password`, `/reset-password`, `/verify-email`
- `web/src/api/client.ts`: add `credentials: 'include'`, drop bearer token injection
- `web/src/lib/auth-claims.ts`: claims come from `/auth/me` response, not JWT decode
- **Exit criteria:** full login → action → logout round trip via cookies. No OIDC code path hit. Playwright E2E suite green.

### Step 6 — ZITADEL tear-out (gated on prod soak ≥1 week)
- Delete `app/services/zitadel.py`, `scripts/bootstrap-zitadel.py`, ZITADEL bits of `scripts/create-e2e-users.py`
- Remove ZITADEL container from `docker-compose.yml`
- Remove env vars: `ZITADEL_*`
- `uv remove` any ZITADEL-only deps; `npm uninstall oidc-client-ts`
- Drop dual-auth branch in `current_user` — native cookie only
- Drop `zitadel_org_id` columns from `Organization`/`Campaign` (separate migration, optional if we want clean schema)
- **Exit criteria:** `rg -i zitadel` returns zero hits in app code. Stack runs without ZITADEL container.

## Risk notes

- **Mid-migration state** (Step 4): users exist in both ZITADEL and local table. Grace-period dual-auth in `current_user` is the mitigation. Do not skip.
- **Session fixation:** fastapi-users rotates tokens on login by default via DatabaseStrategy — verify this, don't assume.
- **Cookie scope:** `SameSite=Lax` + `Secure` in prod + `HttpOnly` always. `Domain` attribute left unset unless cross-subdomain is needed.
- **CSRF before frontend flip** (Step 2 before Step 5): flipping the frontend to cookies before CSRF is in place is the classic way to ship a CSRF hole.
- **Email deliverability:** registration/verification hard-depends on the email service. If `email_provider=disabled` in dev, provide a dev-only "show link in logs" path — do not bypass verification.

## Known ZITADEL touchpoints (grep snapshot, 2026-04-23)

Backend (20 files):
- `app/services/zitadel.py` (532 lines — bulk of removal)
- `app/api/deps.py` (`ensure_user_synced` — JWT claim parsing)
- `app/core/security.py` (560 lines — JWKS + token validation)
- `app/core/config.py` (ZITADEL settings)
- `app/main.py` (lifespan: JWKSManager + ZitadelService init)
- `app/api/v1/`: campaigns, voters, invites, join, volunteer_applications, members, users, org, org_numbers, config
- `app/services/`: org, campaign, invite, join, volunteer_application
- `app/models/`: user, organization, campaign, campaign_member
- `app/schemas/`: org, campaign, join

Frontend (11 files):
- `web/src/config.ts`, `web/src/api/client.ts`
- `web/src/routes/login.tsx`, `web/src/routes/callback.tsx`, `web/src/routes/callback-state.ts`, `web/src/routes/__root.tsx`
- `web/src/routes/org/settings.tsx` (+ `.test.tsx`)
- `web/src/lib/auth-claims.ts` (+ `.test.ts`)
- `web/src/stores/authStore.ts` (+ `.test.ts`)
- `web/src/components/org/OrgSwitcher.tsx`
- `web/src/hooks/usePermissions.ts`, `useOrgPermissions.ts` (+ tests)

## Open clarifications

None currently blocking Step 1. Re-read before Step 3:
- Email provider for verification delivery in dev — reuse existing `email_provider` config from `app/core/config.py`
- Reset token TTL — default to 1 hour unless user specifies otherwise

## Progress log

### Step 1 — fastapi-users backend alongside ZITADEL (committed as e189a88b)
- Files: `app/auth/{__init__,backend,db,manager,models,router,schemas}.py`, `alembic/versions/042_native_auth_columns.py`, `app/db/base.py`, `app/main.py`, `app/models/user.py`, `pyproject.toml`, `uv.lock`
- Deviations: `UUIDIDMixin` not inherited (override-only approach); `DatabaseStrategy` return annotation left unparameterized (fastapi-users 15.x uses 3-type generic); placeholder `CHANGE_ME_STEP_3` secrets for reset/verify routers (not mounted yet).
- Notes: `get_current_native_user` requires `verified=True` — no user from `/register` can authenticate against it until Step 3 verify lands. `email_verified` ↔ `is_verified` sync will be added in `UserManager.on_after_verify` in Step 3.

### Step 2 — CSRF middleware (committed as c15d613c)
- Files:
  - `app/core/middleware/csrf.py` (new) — pure-ASGI `CSRFMiddleware` + `issue_csrf_cookie` helper.
  - `app/auth/router.py` — added `GET /api/v1/auth/csrf` endpoint.
  - `app/auth/manager.py` — `on_after_login` now sets `cp_csrf` cookie on the login response (fastapi-users 15 passes `response`, confirmed via `inspect.signature`).
  - `app/main.py` — wired `CSRFMiddleware` between `SecurityHeadersMiddleware` and `StructlogMiddleware` with the exempt-paths / exempt-prefixes lists from the Step 2 spec.
  - `tests/unit/test_csrf_middleware.py` (new) — 9 tests covering safe methods, bearer bypass, unauth bypass, missing/mismatched/matching tokens, exempt path bypass, missing cookie reject.
- Deviations:
  - Implemented as pure ASGI (matching `security_headers.py` / `request_logging.py`) instead of inheriting from `BaseHTTPMiddleware` as the spec suggested — the two descriptions in the spec were contradictory ("pure ASGI" vs `BaseHTTPMiddleware`) and pure ASGI matches the existing package style.
  - Skipped `httponly=False` cookie emission from `get_csrf_token` being re-serialized; used Starlette's `Response` param injection instead for a clean dict return.
- Notes for Step 3:
  - The `cp_csrf` cookie is issued on successful login AND on the standalone `GET /api/v1/auth/csrf` endpoint, so the SPA has two options.
  - Password-reset / verify-email endpoints are already in the middleware exempt list; Step 3 can land them without touching middleware config.
  - Forbidden-response body is hard-coded JSON (`{"detail":"CSRF token missing or invalid"}`); if Step 3 introduces a global problem-details exception model, revisit this.

### Step 3 — Password reset + mandatory email verification (committed as <PENDING>)
- Files:
  - `app/auth/manager.py` — real reset/verify secrets pulled from `settings`; `validate_password` enforces min-12 + zxcvbn score ≥ 3 with `user_inputs=[email, display_name]`; `on_after_register` auto-fires `request_verify`; `on_after_forgot_password` + `on_after_request_verify` dispatch via `app.services.auth_email`; `on_after_verify` syncs `email_verified`; `on_after_reset_password` DELETEs all `auth_access_tokens` rows for the user.
  - `app/auth/router.py` — mounts `get_reset_password_router()`, `get_verify_router(UserRead)`; passes `requires_verification=True` to `get_auth_router` so unverified logins return 400 `LOGIN_USER_NOT_VERIFIED`.
  - `app/core/config.py` — adds `auth_reset_password_token_secret`, `auth_verification_token_secret` (SecretStr), `auth_reset_password_token_lifetime_seconds` (3600), `auth_verification_token_lifetime_seconds` (86400).
  - `app/main.py` — lifespan fail-fast for empty secrets in non-dev; dev auto-generates ephemeral `secrets.token_urlsafe(32)` with a warning log.
  - `app/services/auth_email.py` (new) — `send_verify_email` + `send_password_reset_email` helpers; reuse `get_transactional_email_provider`; when provider is `disabled`, log `[DEV-EMAIL] ... url=...` at INFO; never raise.
  - `tests/unit/test_auth_native_flows.py` (new) — 11 tests: password policy (short/weak/user-input/strong), secrets wiring, verify-token roundtrip, forgot+reset updates hash, weak-new-password rejected, bogus verify-token, registration auto-fires verify.
  - `pyproject.toml`, `uv.lock` — `zxcvbn==4.5.0`.
- Deviations:
  - No dedicated auth template in `TransactionalTemplateKey` yet — `auth_email.py` uses inline text/html bodies and passes `CAMPAIGN_MEMBER_INVITE` as the (unused) template tag. Add real enum members + `email_templates.py` rendering in Step 4 alongside the invite rewrite.
  - Tests are unit-level using a `_FakeUserDatabase` + `_NoopSession` monkeypatch rather than integration against the compose Postgres — lets `pytest tests/unit/test_auth_native_flows.py` run without docker. HTTP-level end-to-end (register→verify→login) is left for Step 4/5 integration coverage.
  - `_resolve_reset_secret` / `_resolve_verify_secret` helpers fall back to static strings if settings are empty at import time (happens in unit tests that bypass lifespan). The lifespan remains the authoritative gate for runtime.
- Notes for Step 4:
  - Seed script + invite-accept flow should create users with `hashed_password`, `is_active=True`, `is_verified=True`, `email_verified=True` in one transaction — the invite link is proof of email ownership, so skip the verify round-trip.
  - Consider adding `VERIFY_EMAIL` and `PASSWORD_RESET` members to `TransactionalTemplateKey` and migrating `auth_email.py` to `email_templates.render_template` — parity with invite rendering + centralizes template governance.
  - `on_after_reset_password` does a best-effort session invalidation via a raw `DELETE FROM auth_access_tokens`. If Step 4 introduces a session-store abstraction (e.g. per-device metadata), move this into that service.
  - The end-to-end `register → verify → login` loop is exercised under pytest but NOT smoke-tested against the live stack yet — that happens in Step 4 when seed + invite flows land.

### Step 4 — Native backfill/seed/invite (committed as <PENDING>)
- Files:
  - `app/core/security.py` — added `get_current_user_dual` (+ `current_user_dual` alias) and `_authenticated_user_from_db` helper. Native-cookie path reads `auth_access_tokens` + `users`, requires `is_active=True` AND `is_verified=True`, then rebuilds the legacy `AuthenticatedUser` shape from `OrganizationMember` rows (mapped via `ORG_ROLE_CAMPAIGN_EQUIVALENT` for the role upper-bound; `resolve_campaign_role` still does per-campaign resolution downstream). Any failure falls through to the existing `get_current_user` JWT path.
  - `app/services/invite.py` — new `accept_invite_native(db, token, password, display_name, user_manager)` alongside the legacy `accept_invite`. Creates the `User` row with UUID id, hashed password, `email_verified=True`, `is_verified=True`, `is_active=True`. Reuses an existing `User` row when one already exists for the invite email (rewrites its password + flips verified). Creates `CampaignMember` and (for `owner`/`admin` invites) `OrganizationMember`. Preserves the volunteers back-fill UPDATE.
  - `app/api/v1/invites.py` — replaced the `accept_invite` endpoint. No longer requires auth; body is `{password, display_name}`. On success we run `auth_backend.login(strategy, user)` and copy the resulting `Set-Cookie` header onto the response, then call `issue_csrf_cookie`. Returns existing `InviteAcceptResponse` + two cookies.
  - `scripts/seed.py` — user ids are now real UUIDs, every `User` row carries a hashed dev password (`SEED_DEV_PASSWORD = "seeddev-password-123"`) with `is_active/is_verified/email_verified=True`. Final banner prints the dev credentials. No ZITADEL calls (there never were any in seed, but the user-id shape and flags matter for Step 5 login).
  - `scripts/backfill_zitadel_users_to_native.py` (new) — idempotent, `--dry-run` flag. Walks every `users` row with `hashed_password IS NULL` and calls `UserManager.forgot_password`, reusing the production reset-email hook chain.
  - `tests/unit/test_dual_auth.py` (new) — 4 tests: valid cookie builds DB-backed `AuthenticatedUser`, inactive user falls through, missing cookie uses JWT fallback, unknown cookie token falls back to JWT.
  - `tests/unit/test_invite_native_flow.py` (new) — 4 tests: happy path creates verified user + CampaignMember, weak password rejected, invalid token raises ValueError, existing user rows are reused + refreshed.
  - `tests/unit/test_api_invites.py` — replaced legacy ZITADEL-mocking `TestAcceptInviteEndpoint` with 422-validation tests against the new payload shape.
- Deviations:
  - `accept_invite_native` is additive; the legacy `InviteService.accept_invite(db, token, user, zitadel)` stays so existing `test_invite_service.py` tests keep passing without touching ZITADEL behavior. Step 6 removes the old method wholesale.
  - Dual-auth "role upper bound" is a seed that `require_role` / `resolve_campaign_role` will narrow against the DB anyway — I did not try to mirror every JWT `_extract_role` edge case. The per-campaign resolution path is untouched and still authoritative.
  - `_authenticated_user_from_db` sets `org_id` to the first `zitadel_org_id` in the sorted `org_ids` list. This mimics JWT `resourceowner:id` just well enough that `require_org_role`'s fallback lookup (`in_(org_ids)`) still works; callers that hard-code `org_id` do not.
  - `DISABLE_TLS=true` etc. are untouched. Per-environment ZITADEL settings still populate `AuthenticatedUser` when the JWT branch runs.
- Notes for Step 5:
  - **`/auth/me` shape for cookie users:** Step 5's Agent B needs this. `app/auth/router.py` already mounts `fastapi_users.get_users_router(UserRead, UserUpdate)`? It does *not* — only auth + register + reset + verify are mounted today. Agent B must either (a) add `fastapi_users.get_users_router(...)` (gives `/users/me` with `UserRead` shape: `{id, email, is_active, is_superuser, is_verified, display_name}`) or (b) add a custom `GET /auth/me` endpoint that returns the richer `AuthenticatedUser` struct (`{id, email, display_name, org_id, org_ids, role}`). The SPA already expects role/org information, so **(b) is the smaller frontend delta** — just return `_authenticated_user_from_db(...)` projected through a pydantic model.
  - The new accept-invite endpoint already sets `cp_session` *and* `cp_csrf` cookies, so the SPA can land post-invite without a separate `GET /auth/csrf` call. The session is created via `auth_backend.login` so it's indistinguishable from a fresh `POST /auth/login`.
  - Dual-auth means endpoints can migrate piecemeal: change `get_current_user` → `current_user_dual` in the signature and that route accepts both auth modes. Prioritize migrating `/auth/me` and anything the SPA hits on boot (me, csrf, dashboard).
  - Dev seed now logs `seeddev-password-123` as the universal password; use `dana.whitfield@example.com` / that password against the native `POST /auth/login` for a smoke test.
  - Backfill script is **not** auto-run by lifespan — prod release runbook must call it explicitly between Step 4 deploy and Step 5 flip.
