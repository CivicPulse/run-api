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
