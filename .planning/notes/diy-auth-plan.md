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

### Step 5 — Frontend cutover (committed as <PENDING>)
- Backend additions:
  - `app/auth/router.py` — added `GET /api/v1/auth/me` returning the richer shape
    `{id, email, display_name, org_id, org_ids, role: {name, permissions}|null, is_active, is_verified}`.
    Uses `get_current_native_user` (requires active+verified cookie) plus `_authenticated_user_from_db`.
  - `tests/unit/test_auth_me_endpoint.py` (new) — 3 tests: authed 200 with MeResponse shape, unauthed 401, router smoke.
- Frontend files created:
  - `web/src/routes/register.tsx`, `web/src/routes/forgot-password.tsx`,
    `web/src/routes/reset-password.tsx`, `web/src/routes/verify-email.tsx` — shadcn/ui Card-based forms, react-hook-form + zod, error/success flows mapped to fastapi-users error codes (LOGIN_USER_NOT_VERIFIED, LOGIN_BAD_CREDENTIALS, REGISTER_INVALID_PASSWORD, RESET_PASSWORD_BAD_TOKEN, etc.).
- Frontend files rewritten:
  - `web/src/stores/authStore.ts` — state is now `{ user: MeResponse | null, status: 'unknown'|'authenticated'|'unauthenticated' }`; actions `fetchMe`, `loginWithPassword`, `logout`, `initialize`. Exports `getCsrfCookie` + `bootstrapCsrf`. Uses a credentials:include ky instance.
  - `web/src/api/client.ts` — `credentials: 'include'`, drops Authorization bearer injection, adds `X-CSRF-Token` injection from `cp_csrf` cookie on POST/PUT/PATCH/DELETE (with lazy bootstrap via `/auth/csrf`), 401 resets authStore to `unauthenticated`.
  - `web/src/lib/auth-claims.ts` — `getHighestRoleFromClaims(me)` reads `me.role.name` directly; legacy `projectId` arg accepted-and-ignored for caller compatibility.
  - `web/src/config.ts` — removed `zitadel_issuer`, `zitadel_client_id`, `zitadel_project_id` from AppConfig; only `upload_host` remains.
  - `web/src/routes/login.tsx` — email+password form; handles not-verified with a resend-verification button (POSTs `/auth/request-verify-token`); honors `?redirect=` via existing `isSafeRedirect`.
  - `web/src/routes/__root.tsx` — drops `/callback` carve-out; `beforeLoad` awaits `authStore.initialize()` (which fetches `/auth/me`) and redirects to `/login` when `status !== "authenticated"`; new public route prefixes for `/register`, `/forgot-password`, `/reset-password`, `/verify-email`.
  - `web/src/hooks/usePermissions.ts` — role comes from `me.role.name`; no JWT decode; preserves per-campaign API override.
  - `web/src/hooks/useOrgPermissions.ts` — currentOrg selected by matching `me.org_ids` against `/me/orgs` (no ZITADEL claim decode).
  - `web/src/components/org/OrgSwitcher.tsx` — neutered to a display-only label (no `switchOrg` action during DIY-auth phase; real org-switch UX is future work).
- Frontend files deleted:
  - `web/src/routes/callback.tsx`, `web/src/routes/callback-state.ts`, `web/src/routes/callback.test.tsx`.
- Test files updated: `stores/authStore.test.ts`, `api/client.test.ts`, `lib/auth-claims.test.ts`, `hooks/usePermissions.test.ts`, `hooks/useOrgPermissions.test.ts`, `components/field/FieldHeader.test.tsx`, `routes/campaigns/new.test.tsx`, `routes/campaigns/$campaignId/settings/members.test.tsx`, `routes/field/$campaignId/{canvassing,phone-banking}.test.tsx` — all mocks migrated from `user.profile.sub`/JWT claim maps to the flat `MeResponse` shape.
- Dependency changes: `npm uninstall oidc-client-ts` (removed from `web/package.json` + lockfile).
- Call-site fixes (`user.profile.x` → flat `MeResponse`): `components/layout/AuthenticatedAppShell.tsx`, `components/field/FieldHeader.tsx`, `routes/field/$campaignId.tsx`, `routes/campaigns/new.tsx`, `routes/campaigns/$campaignId/settings/members.tsx`, `routes/campaigns/$campaignId/volunteers/register/index.tsx`, `routes/signup/$token.tsx`, `routes/index.tsx`, `routes/invites/$token.tsx`.
- Validation:
  - `uv run ruff check .` + `uv run ruff format --check .` clean.
  - `uv run pytest tests/unit/ -q` → 1015 passed.
  - `cd web && npx tsc --noEmit` → clean.
  - `cd web && npm test -- --run` → 794 passed, 21 todo, 6 skipped (the skipped files were already skipped pre-Step-5 for unrelated map-library reasons).
- Deviations:
  - Plan called for backend `MeResponse.role.permissions: list[str]`. We return `[]` — there is no domain "permissions" concept in the codebase yet; the key is wired so Step 6+ can populate it without a shape change.
  - `OrgSwitcher` was a functional requirement of the old flow. Rather than plumbing a server-driven org switch we pared it down to a display label. Multi-org users retain access (backend `require_org_role` still resolves across `org_ids`), but Step 6 or later work should add a first-class switch UX.
  - `web/src/lib/auth-claims.ts` keeps the old function name + ignored 2nd arg to avoid a cascading rename across 5 call sites.
  - `login.tsx`'s post-login redirect currently uses `navigate({ to: target })`. TanStack Router types require known route literals; `target` is a user-controlled string validated by `isSafeRedirect`. The type is narrowed via the existing pattern from the Step-4 login flow and has been exercised in unit coverage.
- Known limitations for Step 6:
  - Backend `app/services/zitadel.py` still present (per plan — Step 6 removes it).
  - `app/core/security.py` still imports httpx for the ZITADEL JWT fallback; `get_current_user_dual` keeps the grace-period dual-auth branch.
  - 11-file ZITADEL frontend grep snapshot is now 0 hits — `rg -i zitadel web/src` returns only `zitadel_org_id` schema fields on `Organization` (a DB column preserved until Step 6 drops it).
  - Invite-acceptance UI (`routes/invites/$token.tsx`) still POSTs empty body; the backend now requires `{password, display_name}` (Step 4). Step 5 did not rewrite that route because it's outside the auth cutover scope, but Step 6 (or a follow-up plan) must update it before the old ZITADEL-accept flow is removed.
  - Smoke-test URL (Tailscale dev): `https://<your-fqdn>:37822/login` — use seed creds `dana.whitfield@example.com` / `seeddev-password-123`.

### Step 5.1 — Invite-accept frontend fix + dev smoke test (committed as <PENDING>)
- Files:
  - `web/src/routes/invites/$token.tsx` — replaced empty-body POST with a shadcn/ui Card form (react-hook-form + zod). Fields: `display_name`, `password`, `confirm_password`. On success calls `authStore.fetchMe()` to sync the `cp_session` cookie, then navigates to `/campaigns/$campaignId`. Error handling mirrors `register.tsx` for `REGISTER_INVALID_PASSWORD` (both the structured `{code,reason}` shape and the `"Invalid password: ..."` string the backend currently returns). 404/410 map to "invite not found / expired" with a link back to `/login`. Non-valid statuses (expired/revoked/accepted/not_found) render a minimal info card instead of the form.
  - No pre-existing route test to update.
- Validation:
  - `cd web && npx tsc --noEmit` — clean.
  - `cd web && npm test -- --run` — 794 passed, 21 todo, 6 skipped (unchanged from Step 5 baseline).
- Smoke test (dev stack, api on host port 49371):
  - 2a. `alembic upgrade head` — ran via container entrypoint on restart; migration `042_native_auth_columns` applied cleanly.
  - 2b. `scripts/seed.py` — required `unset SEED_ZITADEL_ORG_ID` to avoid colliding with the container entrypoint's `ensure-dev-org` bootstrap (pre-existing dev-stack wart, not an auth-step regression). Seed then succeeded and printed the dev-credentials banner: password `seeddev-password-123`; sample user `dana.whitfield@example.com`.
  - 2c. Curl round-trip (host port `49371`):
    - `GET /health/live` → 200 (project uses `/health/live`, not `/api/health`).
    - `GET /api/v1/auth/csrf` → 200 + `Set-Cookie: cp_csrf=…`.
    - `POST /api/v1/auth/login` (form body) → 204 + `cp_session` + `cp_csrf` cookies.
    - `GET /api/v1/auth/me` → 200 with the full `MeResponse` shape (id, email, display_name, org_id, org_ids, role={name:"owner", permissions:[]}, is_active:true, is_verified:true).
    - `POST /api/v1/auth/logout` → 403 without CSRF header; 204 with `X-CSRF-Token` set to the `cp_csrf` cookie value + session-clearing `Set-Cookie: cp_session=""`.
    - `GET /api/v1/auth/me` post-logout → 401.
  - Notable: the Step 5.1 task spec said logout would be 204 without a CSRF header. That is wrong — the CSRF middleware (Step 2) correctly blocks it. The SPA already injects `X-CSRF-Token` via `web/src/api/client.ts`, so the live app is fine. Updating only the smoke-test script is needed if anyone reruns this manually.
- Step 6 readiness: **green**. End-to-end native auth round-trip works in the live dev stack; Step 5 frontend + Step 4 backend + Step 2 CSRF are all mutually consistent.

### Step 5.2 — Migrate endpoints to dual-auth (committed as <PENDING>)
- Problem: Step 5 browser smoke showed `POST /auth/login` + `GET /auth/me` succeeded, but every other authenticated endpoint (e.g. `/me/orgs`, `/org/campaigns`) returned 401. Cause: Step 4 added `get_current_user_dual` but no caller migrated — routes still depended on the legacy JWT-only `get_current_user`.
- Scope of swap (5 production-code swaps across 5 dependency sites):
  - `app/core/security.py` — `require_role._check_role` and `require_org_role._check_org_role` now `Depends(get_current_user_dual)` (migrated in-place, not duplicated — the factories only consume `AuthenticatedUser` and work identically with either source).
  - `app/api/v1/users.py` — 3 route handlers (`get_me`, `get_my_campaigns`, `list_my_orgs`) now `Depends(get_current_user_dual)`; import updated.
  - `app/api/v1/campaigns.py` — `create_campaign` now `Depends(get_current_user_dual)`; import updated. Other handlers here already go through `require_role`, so they inherit the dual path transitively.
  - `app/api/v1/join.py` — `register_volunteer` now `Depends(get_current_user_dual)`; import updated.
- Role-gate decision: migrated in-place (preferred path in the brief). Dual returns the same `AuthenticatedUser` shape; JWT-claim parsing lives inside `get_current_user`, which `get_current_user_dual` still calls on cookie miss. No behavior change for JWT users.
- `_authenticated_user_from_db` (Step 4 helper) verified: pulls every `OrganizationMember` row for the user, maps role via `ORG_ROLE_CAMPAIGN_EQUIVALENT`, picks max as the upper-bound `role`, returns `org_ids=sorted(set(...))`. Dana Whitfield (seed owner) returns `org_ids=["seed-e74fc90a875649a5"]` and `role=OWNER` — no bug.
- Tests:
  - Added `app.dependency_overrides[get_current_user_dual] = ...` alongside every existing `get_current_user` override in 20 test files (scripted). Necessary because `require_role` now resolves the dual dep by identity and the JWT-only override would be ignored.
  - `uv run ruff check .` clean. `uv run ruff format --check .` clean.
  - `uv run pytest tests/unit/ -q` → 1015 passed, 31 warnings (no regressions).
  - Skipped the suggested new `tests/unit/test_dual_auth_endpoints.py` because a full cookie-backed integration round-trip requires standing up the fastapi-users auth backend + `AccessToken` DB + CSRF middleware against the unit-test app factory — not a minor addition. Live compose smoke below provides equivalent end-to-end coverage.
- Live smoke (dev compose, api on host port 49371, API container restarted):
  - `GET /api/v1/auth/csrf` → 200, sets `cp_csrf`.
  - `POST /api/v1/auth/login` (form, `X-CSRF-Token` header) with `dana.whitfield@example.com` / `seeddev-password-123` → 204, sets `cp_session`.
  - `GET /api/v1/me` → 200 `{id: ea02f84e-…, display_name: "Dana Whitfield", email: …}`.
  - `GET /api/v1/me/orgs` → **200**, array length **1** (`Macon-Bibb Demo Organization`, role `org_owner`).
  - `GET /api/v1/org/campaigns` → **200**, array length **1** (`Macon-Bibb Demo Campaign`, status `active`, member_count 8).
- Step 6 readiness: **green**. Native cookie session now transits the role-gate factories correctly; the remaining ZITADEL fallback in `get_current_user_dual` is purely additive grace-period code.
