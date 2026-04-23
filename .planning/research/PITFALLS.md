# Domain Pitfalls — v1.20 Native Auth Rebuild & Invite Onboarding

**Domain:** DIY cookie-session auth on fastapi-users 15.0.5 + Postgres sessions, replacing ZITADEL; invite onboarding; cross-cutting rewrite + continuous verification rollout
**Researched:** 2026-04-23
**Scope:** Pitfalls unique to THIS rewrite. Generic auth-101 excluded. v1.19 ZITADEL-only pitfalls dropped; still-applicable ones carried forward under DIY framing.

Severity: 1 (cosmetic) → 5 (security breach / data loss / production outage)

---

## 1. Cookie + CSRF

### C1. Session-fixation via non-rotated session ID on login
- **Severity:** 5
- **What goes wrong:** An anonymous cookie issued pre-login (e.g., CSRF nonce cookie set on the login page) is kept for the post-login session. An attacker who plants a known pre-login cookie in a victim's browser (e.g., via an HTTP subdomain injection or an XSS on a sibling app) can later observe the victim logging in and inherit their authenticated session.
- **Prevention:** In the fastapi-users `on_after_login` hook, explicitly destroy any pre-existing access-token row bound to the request cookie before minting the new one, and issue a new `Set-Cookie` with a fresh opaque token. Integration test: POST /login twice from the same client session, assert the token row ID changes and the prior row is deleted from `access_token`.
- **Phase:** Native auth endpoints phase

### C2. CSRF exempt-logic forgetting login/password-reset endpoints
- **Severity:** 4
- **What goes wrong:** Double-submit CSRF middleware is written "fail-closed" — every POST/PUT/DELETE requires the `X-CSRF-Token` header matching the csrf cookie. But the user has no session (and thus no csrf cookie) when submitting the login form. Overly aggressive middleware blocks login itself; overly permissive middleware exempts too much and reintroduces CSRF on state-changing endpoints.
- **Prevention:** Explicit allowlist in the middleware by exact path: `{"/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password", "/auth/request-verify-token", "/auth/verify", "/invites/{token}/accept"}`. Mount a pytest that asserts (a) every other POST/PUT/DELETE/PATCH route in `app.routes` requires CSRF (introspect `app.router.routes`), and (b) GET/HEAD/OPTIONS are always exempt. No wildcard exemptions.
- **Phase:** CSRF middleware phase

### C3. CSRF token not bound to session — global token accepted after logout
- **Severity:** 3
- **What goes wrong:** Double-submit uses a random csrf token that isn't rotated on login/logout. A token captured during one session remains valid for subsequent sessions. Weakens CSRF to "attacker must steal the cookie once, ever" instead of "per session."
- **Prevention:** Rotate the csrf cookie in `on_after_login` and on logout. Derive csrf value as `hmac(server_secret, access_token_id)` so it's cryptographically bound to the session row; middleware recomputes and compares.
- **Phase:** CSRF middleware phase

### C4. SameSite=Lax breaks invite-email top-level nav POST
- **Severity:** 3
- **What goes wrong:** Mailgun-delivered invite link `https://run.civpulse.org/invites/<token>` is a top-level GET navigation — SameSite=Lax sends the cookie (good). But if the accept-page uses a form POST to `/invites/<token>/accept` and the user's session cookie was set on a different eTLD+1 (e.g., staging `staging.civpulse.org` vs `run.civpulse.org`), the cookie won't ride. Also: some password-manager autosubmit flows trigger POST from an iframe, where Lax blocks the cookie.
- **Prevention:** Lock invite-accept to GET-only navigation, put the state-changing mutation on a same-page fetch() POST with explicit `credentials: 'include'`. Never rely on cross-subdomain cookies — bind cookie `Domain` to the exact host serving the SPA. Document in ADR.
- **Phase:** Invite-flow phase, cookie-config phase

### C5. `Secure` flag mis-set in dev breaks cookie on HTTP Tailscale URLs
- **Severity:** 3
- **What goes wrong:** We set `secure=True` unconditionally; dev over plain HTTP (e.g., `http://localhost:8000` or a Tailscale MagicDNS name without TLS) silently drops the cookie, producing "logged in but immediately logged out" symptoms that cost hours to diagnose.
- **Prevention:** Drive `secure` from an env var (`COOKIE_SECURE`) set in `.env.example` to `true` for prod, `false` for local dev. Bootstrap-dev.sh already configures TLS-enabled mode; assert `COOKIE_SECURE=true` when `ZITADEL_TLS_MODE=enabled` (well, its successor env); log a WARNING at app startup if `COOKIE_SECURE=false` and the host is not localhost.
- **Phase:** Cookie-config phase

### C6. Cookie `Domain` / `Path` scope too broad
- **Severity:** 4
- **What goes wrong:** Setting `Domain=.civpulse.org` so the cookie is "available everywhere" leaks the session cookie to `marketing.civpulse.org`, `status.civpulse.org`, or any future subdomain — each of which becomes an XSS blast surface into the auth domain.
- **Prevention:** Omit `Domain` entirely (default: exact host). Set `Path=/`. Add a unit test on the cookie builder that asserts the emitted `Set-Cookie` header contains neither `Domain=` nor a path other than `/`.
- **Phase:** Cookie-config phase

### C7. CORS `credentials: include` without `Access-Control-Allow-Credentials` + exact origin
- **Severity:** 4
- **What goes wrong:** Frontend sets `credentials: 'include'`, backend uses wildcard `Access-Control-Allow-Origin: *` (which is invalid in combo with credentials) or echoes back `Origin` without validating, opening credentialed CORS to any origin.
- **Prevention:** In `app/main.py` CORSMiddleware, pass `allow_origins=[<exact-prod-origin>, <exact-dev-origin>]` (never `*`), `allow_credentials=True`, `allow_methods=["GET","POST","PATCH","DELETE","OPTIONS"]`. Integration test: OPTIONS preflight from a disallowed origin returns no `Access-Control-Allow-Credentials` header.
- **Phase:** Cookie-config phase, CORS phase

---

## 2. fastapi-users specific

### F1. `on_after_login` not awaited — session-fixation mitigation silently skipped
- **Severity:** 4
- **What goes wrong:** UserManager subclass overrides `on_after_login` but forgets `async` or forgets to await an inner DB call; the hook returns immediately and the post-login session-rotation (C1) never executes. fastapi-users does not raise — it fires hooks fire-and-forget-ish.
- **Prevention:** Declare `async def on_after_login(self, user, request=None, response=None)`, perform mutations against `self.user_db.session` (the active transaction), and add an integration test that performs login → asserts old token row is deleted from `access_token`. Don't trust the hook fired correctly; assert the side effect.
- **Phase:** Native auth endpoints phase

### F2. `validate_password` must be async; sync version silently bypasses validation
- **Severity:** 4
- **What goes wrong:** `validate_password(self, password, user)` defined as `def` (not `async def`) — fastapi-users 15.x expects a coroutine. Depending on the version it either raises "coroutine expected" OR (worse) skips validation entirely on certain paths.
- **Prevention:** Always `async def validate_password`. Add a pytest that directly calls `UserManager.validate_password("short")` and asserts it raises `InvalidPasswordException`; add a second test posting `/auth/register` with a weak password and asserting 400.
- **Phase:** Native auth endpoints phase, password-policy phase

### F3. `SQLAlchemyUserDatabase` and our own `async_sessionmaker` share transaction boundaries
- **Severity:** 4
- **What goes wrong:** fastapi-users dependency chain builds its own DB session via `get_user_db`, which by default opens a fresh `AsyncSession`. That session is NOT the same session used by `get_campaign_db` (our RLS-scoped dep). Mutating `user.is_verified` inside an auth hook commits on the auth-session while a co-running request on the campaign-session sees stale data for the duration of its tx.
- **Prevention:** Route the fastapi-users DB dep through the same `async_sessionmaker` as the rest of the app, and in request handlers that need both, ensure the auth operation commits before the handler starts its RLS-scoped work. Never mix the two in one transaction. Integration test: register-then-login in a single request fixture; assert `users.is_active=true` is visible to a subsequent request.
- **Prevention (addendum):** When writing auth hooks that touch non-auth tables (e.g., creating a `campaign_members` row at invite-accept), do it **after** the fastapi-users commit in the same request handler, not inside `on_after_register` — hooks run inside the auth tx and our RLS-scoped dependencies won't be initialized.
- **Phase:** Native auth endpoints phase, invite-flow phase

### F4. `verify_and_update_password` auto-rehash triggers on every login
- **Severity:** 2
- **What goes wrong:** fastapi-users rehashes on login when argon2 parameters change (e.g., after a passlib upgrade bumps cost). If the write path isn't correctly wired, every login becomes a write — introducing a thundering-herd write pattern and potentially violating read-replica assumptions.
- **Prevention:** Accept the rehash-on-login design, but ensure it's gated by an actual params-changed check (fastapi-users does this by default — verify by reading `passlib.hash.argon2.needs_update`). Add a pytest that logs in twice with the same password and asserts only the first login writes (compare `hashed_password` byte-for-byte between requests).
- **Phase:** Native auth endpoints phase

### F5. UserManager.on_after_register fires for invite-accept path too
- **Severity:** 3
- **What goes wrong:** If we hijack `/auth/register` for the invite-accept ceremony (vs. a distinct `/invites/{token}/accept` route), `on_after_register` fires and sends the stock "verify your email" email from fastapi-users — duplicating / conflicting with our invite email and the already-verified state of invited users.
- **Prevention:** Keep invite-accept on a **separate route** (`/invites/{token}/accept`) that calls `UserManager.create()` with `safe=False` internally, passing a `request` context flag we inspect in `on_after_register` to skip the default verify email. Do not reuse `/auth/register` for invite flow.
- **Phase:** Invite-flow phase

---

## 3. User-table migration

### M1. Dropping ZITADEL columns before reading FK references
- **Severity:** 5
- **What goes wrong:** Alembic migration drops `zitadel_user_id`, `zitadel_sub` without first checking that no FK or view references them. `users.id` (UUID) is referenced by 10+ tables (campaign_members, voter_interactions, invites, shifts, volunteer_applications, email_delivery_audit, etc.). Even if FKs only ride on `users.id` (not `zitadel_user_id`), the drop can fail if a view joins on `zitadel_sub`.
- **Prevention:** Audit step as a first migration commit — run `\d+ users` equivalent via SQLAlchemy reflection, enumerate all tables/views referencing `users`. Record in migration docstring. Drop columns in a **second migration** after first migration is verified green on staging. Order: (1) add fastapi-users columns as nullable, (2) backfill from ZITADEL shadow data where possible / set `hashed_password = NULL` (force-reset), (3) deploy code that no longer reads ZITADEL columns, (4) drop columns in a final migration.
- **Phase:** User-table migration phase (multi-step)

### M2. Active ZITADEL-issued JWT sessions during deploy window
- **Severity:** 4
- **What goes wrong:** Users logged in via ZITADEL at deploy time T0 have a JWT in their browser. At T0+1min the new build lands and the JWT verifier is gone; every in-flight request 401s with no graceful "please sign in again" UX. Worst case: canvassers mid-shift lose queued door-knock state.
- **Prevention:** (a) Coordinate deploy outside active canvass shift windows (admin dashboard query: active shifts RIGHT NOW). (b) Frontend on 401 from any endpoint: flush TanStack-Query, offer to save offline queue to localStorage, redirect to /login with `?reason=session_expired&return_to=<path>`. (c) Rely on v1.18's hardened offline queue to absorb the brief outage. (d) Pre-deploy banner (24h) in app announcing "you will need to set a new password; click the email we send."
- **Phase:** Deployment phase, frontend session phase

### M3. Password-reset required for every existing user but no mass-email plan
- **Severity:** 4
- **What goes wrong:** Migration sets `hashed_password=NULL` or a sentinel; fastapi-users rejects login with `LoginBadCredentials`; users have no idea why and no prompt to reset. Support inbox floods.
- **Prevention:** Generate a one-shot per-user password-reset token at migration time for every active user, queue Mailgun "set your new password" emails through Procrastinate at ≤40 msgs/sec, and short-circuit `/auth/login` for users with `hashed_password IS NULL` to return a specific 403 `{"detail":"password_reset_required"}` that the frontend maps to "check your email."
- **Phase:** User-table migration phase, deployment phase

### M4. Failed-mid-migration leaves mixed schema state
- **Severity:** 5
- **What goes wrong:** Alembic migration runs 3 DDL + 1 data-backfill + 2 DDL. The backfill fails halfway through on a malformed row; Alembic's transactional-ddl-per-migration saves SOME of the DDL but not all. On retry the migration says "already applied" or re-runs and conflicts.
- **Prevention:** Split into **multiple Alembic migrations**, each with a single transactional concern: (a) add columns nullable, (b) data-only migration (explicit BEGIN/COMMIT, idempotent re-run — skip rows already having fastapi-users shape), (c) add NOT NULL/indexes, (d) drop ZITADEL columns. Each migration independently runnable. Test by intentionally killing Postgres mid-backfill in a staging run.
- **Phase:** User-table migration phase

### M5. RLS policies reference ZITADEL user columns
- **Severity:** 4
- **What goes wrong:** Row-level security policies or database functions (e.g., `current_user_id()` in policies) that look up the session user by `zitadel_sub` will silently stop matching after the column is dropped, returning empty result sets for all queries — including admin queries, which may look like "data is gone" until the policy is fixed.
- **Prevention:** Grep `\bzitadel\b` across `alembic/versions/` and active schema policies before writing the migration. If any RLS policy references ZITADEL columns, rewrite the policy in the same migration that drops the column, not as a follow-up. Integration test: post-migration, query as a seeded user and assert row counts match pre-migration counts.
- **Phase:** User-table migration phase

### M6. FK to `users.id` assumes UUID — fastapi-users default is UUID but configurable
- **Severity:** 3
- **What goes wrong:** fastapi-users 15.x supports UUID and integer PKs. Dev copies a tutorial using `int` PK model; migration changes users.id type; every FK breaks.
- **Prevention:** Subclass `SQLAlchemyBaseUserTableUUID` (not the int variant) explicitly; add a schema assertion at import time: `assert User.__table__.c.id.type.python_type is UUID`. Document the choice in `app/models/user.py` docstring.
- **Phase:** User-model phase

---

## 4. Password reset / email verify tokens

### T1. One-time-use under concurrent click (double-click, email-preview bots)
- **Severity:** 4
- **What goes wrong:** Reset/verify email link clicked twice within 500ms (mobile double-tap, Outlook Safe Links pre-fetch, Gmail image proxy) — two concurrent requests both pass "token not yet used" check, both apply state change, one succeeds and one 500s.
- **Prevention:** Inside the accept transaction, `SELECT ... WHERE token=$1 AND used_at IS NULL FOR UPDATE` then `UPDATE SET used_at=now()`. Any concurrent request blocks on the row lock, then sees `used_at IS NOT NULL` and returns 410 Gone with a user-friendly "link already used, request a new one" page. Integration test: fire two concurrent accept requests via `asyncio.gather`; assert exactly one succeeds.
- **Phase:** Password-reset phase, email-verify phase

### T2. Email enumeration on forgot-password endpoint
- **Severity:** 3
- **What goes wrong:** `/auth/forgot-password` returns 200 for known emails, 404 for unknown — attacker enumerates the user base. fastapi-users' default handler does the right thing, but custom overrides often regress.
- **Prevention:** Always return 202 Accepted with a neutral body regardless of whether the email exists. `on_after_forgot_password` hook only fires for real users; the endpoint response is constant. Integration test: POST known + unknown email, assert response bodies are byte-identical.
- **Phase:** Password-reset phase

### T3. Token entropy / HMAC secret rotation
- **Severity:** 4
- **What goes wrong:** fastapi-users uses `SECRET` for reset/verify tokens (JWT-style signed payloads). If we reuse the same secret for session strategy AND reset-token signing AND CSRF HMAC, rotating it logs everyone out AND invalidates all in-flight reset/verify links simultaneously.
- **Prevention:** Use **separate secrets** for each concern: `AUTH_SESSION_SECRET`, `AUTH_RESET_TOKEN_SECRET`, `AUTH_VERIFY_TOKEN_SECRET`, `CSRF_HMAC_SECRET`. Load from env, reject app startup if any is missing or shorter than 32 bytes.
- **Phase:** Native auth endpoints phase, config phase

### T4. Token leak via HTTP Referer header
- **Severity:** 4
- **What goes wrong:** Reset link `https://run.civpulse.org/auth/reset-password?token=<SECRET>` is followed. The reset page loads third-party resources (CDN, analytics, a Google Font). Each outbound request sends `Referer: https://run.civpulse.org/auth/reset-password?token=<SECRET>` leaking the token to CDN logs.
- **Prevention:** Reset-page response sets `Referrer-Policy: no-referrer`. Verify via integration test that `GET /auth/reset-password` response carries the header. Additionally: move the token from the URL to the POST body as soon as page loads (JS reads it from location, replaces history with clean URL, carries token in a hidden form field).
- **Phase:** Password-reset phase, frontend phase

### T5. Timing-attack on hashed password comparison
- **Severity:** 2 (mostly theoretical at our scale but trivial to fix)
- **What goes wrong:** A custom password-verify path (should not exist — use fastapi-users') that uses `==` instead of `hmac.compare_digest` leaks the password hash via timing.
- **Prevention:** Never write custom password-compare code. All comparisons go through `passlib`. Add a ruff custom rule (or grep-based pre-commit check) banning `hashed_password ==` in `app/`.
- **Phase:** Native auth endpoints phase

### T6. Rate-limit bypass via distributed IPs on forgot-password
- **Severity:** 3
- **What goes wrong:** Our existing rate-limiter keys on `CF-Connecting-IP`. An attacker fires 1 forgot-password per IP across 10k IPs (cheap via residential-proxy services), triggering 10k password-reset emails in a minute — abuse, Mailgun rep damage, user confusion.
- **Prevention:** Add an additional rate-limit dimension: per-**email** (5/hour) in Redis (or Postgres counter table). Return the same neutral 202 regardless of limit (don't leak limit state). When limit tripped, enqueue a single "we detected multiple reset requests, if you didn't do this..." email, not N emails.
- **Phase:** Password-reset phase, rate-limit phase

---

## 5. Frontend rewire

### FE1. `credentials: 'include'` missed on one of N fetch call sites
- **Severity:** 5
- **What goes wrong:** `web/src/api/client.ts` (ky instance) gets the flag, but a handful of bespoke `fetch()` call sites (e.g., a file-upload progress hook, a raw EventSource, a Twilio Voice SDK token fetch) don't. They silently 401 OR worse, work in dev (same-origin) and break in prod (cross-origin).
- **Prevention:** Grep audit — `rg '\bfetch\('` and `rg 'new EventSource|new WebSocket'` across `web/src/`. Every result must either go through the ky client OR set `credentials: 'include'` / pass `withCredentials: true`. Add a Playwright integration test that hits every unique API base path from the built app and asserts the cookie was sent (via backend logging).
- **Phase:** Frontend auth rewire phase

### FE2. CORS preflight fails silently on `Content-Type: application/json`
- **Severity:** 3
- **What goes wrong:** The dev server (different origin than API in some setups) triggers preflight for JSON POST. Preflight must allow `Content-Type`, `X-CSRF-Token`. Missing one silently kills the request with a CORS error that only shows in console.
- **Prevention:** CORSMiddleware `allow_headers=["Content-Type","X-CSRF-Token","Authorization"]` (Authorization retained for OpenAPI UI only, never for SPA). Playwright test: intercept and log console.error; any CORS error fails the test.
- **Phase:** Frontend auth rewire phase, CORS phase

### FE3. CSRF token not refreshed after login
- **Severity:** 4
- **What goes wrong:** SPA reads CSRF cookie on boot, caches it in Zustand. User logs in (session rotates per C1/C3), csrf cookie rotates, but SPA still sends the old token in `X-CSRF-Token`. Middleware rejects with 403 on first authenticated POST. User sees "something went wrong."
- **Prevention:** After a successful login, SPA re-reads `document.cookie` for the new csrf value and invalidates all TanStack-Query caches. Export a `useCSRFToken()` hook that always reads from cookie, never from state. Playwright test: login → POST something → assert 2xx.
- **Phase:** Frontend auth rewire phase

### FE4. Logout doesn't clear the cookie from browser
- **Severity:** 3
- **What goes wrong:** `/auth/logout` deletes the `access_token` row server-side but the browser still has the cookie; next request 401s, frontend shows "session expired" instead of a clean logged-out state. Worse: if the token row is deleted but another user later gets the same token (collision — unlikely with UUID but possible with bad entropy), the stale cookie authenticates as the new user.
- **Prevention:** Logout response MUST set `Set-Cookie: session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` to overwrite the cookie. SPA on logout explicitly calls `queryClient.clear()` and navigates to `/login`. Playwright: login → logout → assert `document.cookie` doesn't contain session name.
- **Phase:** Native auth endpoints phase, frontend auth rewire phase

### FE5. SPA route guards checking stale cached auth state
- **Severity:** 3
- **What goes wrong:** `useAuth()` hook returns `{user}` from TanStack-Query cache. Token expires server-side; next API call 401s; but the guard hook still reports `user` for up to `staleTime` before refetching, letting the user see a "protected" page that flashes then 401s.
- **Prevention:** Global fetch interceptor on 401 → `queryClient.setQueryData(['currentUser'], null)` → router redirect to `/login`. Don't trust cache as source of auth truth; treat 401 as the canonical signal.
- **Phase:** Frontend auth rewire phase

### FE6. Stale oidc-client-ts artifacts left in `web/src/`
- **Severity:** 2
- **What goes wrong:** oidc-client-ts removed from package.json but `web/src/auth/oidc-provider.tsx` still exists, imported by nothing, and ships dead code. Worse: half-removed imports (`AuthProvider` still wraps the app but is a shim) produce runtime errors in prod build where tree-shaking disagrees.
- **Prevention:** `rg -l 'oidc-client-ts\|UserManager\|AuthProvider'` after rewire; delete every file. `npx tsc --noEmit` must pass. `npm run build` must produce no warnings about unused modules.
- **Phase:** Frontend auth rewire phase

---

## 6. Invite flow

### INV1. Token leak via email-client Referer or URL shortener preview
- **Severity:** 4
- **What goes wrong:** Invite link hits Outlook Safe Links or a Mailgun click-tracking redirect — the token flows through third-party servers that may log it. Worse: Slack/Teams unfurl the link and pre-fetch the target with their bot, consuming the one-time-use token before the human clicks.
- **Prevention:** Invite landing page is GET-only, idempotent, and **does not mark the invite accepted on GET**. Acceptance requires an explicit POST from the page (CSRF-protected). Mailgun click-tracking disabled for invite emails (config in `invite_email.py`). Add `X-Robots-Tag: noindex` on invite pages.
- **Phase:** Invite-flow phase

### INV2. Email-mismatch between invite target and account used to accept
- **Severity:** 5 (carried forward from v1.19 S3 under DIY framing)
- **What goes wrong:** Invite sent to `alice@org.com`. Recipient is already logged in as `alice.personal@gmail.com` (existing CivicPulse user from another campaign). They click the invite; the accept-handler binds the existing session to the new campaign without checking. Attacker who gains access to any CivicPulse account who receives forwarded invites now escalates.
- **Prevention:** Invite-accept handler compares `invite.email` against `request.user.email`. If mismatch: render "This invite is for X, you are signed in as Y" page with three actions — logout & accept as X, contact inviter, cancel. Never silently bind. Integration test: seed user `alice.personal`, send invite to `alice@org`, accept while logged in as alice.personal, assert 403 with mismatch page.
- **Phase:** Invite-flow phase

### INV3. Token reuse / double-accept race
- **Severity:** 4 (carried forward from v1.19 S4)
- **What goes wrong:** Invite link forwarded or mobile double-tap. Two concurrent accepts both (a) set user password, (b) create membership row, (c) mint session. Results in duplicate `campaign_members` rows (violates unique-together constraint, raises 500) or — if the constraint is missing — a valid duplicate membership that violates role assumptions.
- **Prevention:** `SELECT FOR UPDATE` on the invite row inside the accept transaction; check `accepted_at IS NULL`; set `accepted_at=now()` before creating membership. Unique constraint `(campaign_id, user_id)` on `campaign_members`. Integration test: `asyncio.gather` two acceptors; assert exactly one membership row, exactly one session.
- **Phase:** Invite-flow phase

### INV4. Invite-token entropy after moving off ZITADEL
- **Severity:** 4
- **What goes wrong:** In the rewire, developer reaches for `secrets.token_hex(16)` (128 bits, fine) or `uuid.uuid4().hex` (122 bits, fine) OR `random.randint` or `uuid1` (predictable, both bad).
- **Prevention:** Use `secrets.token_urlsafe(32)` (256 bits). Document in model: `token: Mapped[str] = mapped_column(String(44), unique=True, index=True, default=lambda: secrets.token_urlsafe(32))`. Ban `random` and `uuid.uuid1` for security tokens via ruff `S311` / custom check in pre-commit.
- **Phase:** Invite-flow phase

### INV5. Orphaned ZITADEL shadow rows left in users table
- **Severity:** 3
- **What goes wrong:** v1.19 research/Phase 111 may have left `users` rows with populated `zitadel_user_id` but no `hashed_password`. At v1.20 deploy, these users exist but can't log in and don't have a reset email queued (M3 misses them because it filters on "active").
- **Prevention:** Migration inventory query (as a pre-migration report): `SELECT id, email, zitadel_user_id IS NOT NULL AS had_zitadel, hashed_password IS NULL AS needs_reset FROM users`. Review output; for every `had_zitadel=true AND needs_reset=true` row, queue a reset email via M3's mechanism. Document the count in the migration PR.
- **Phase:** User-table migration phase

### INV6. Re-invite idempotency (carry-forward from v1.19 U5 + O8)
- **Severity:** 3
- **What goes wrong:** Admin clicks "re-send invite" twice; two tokens issued; the first one the user clicks works, the second comes in and is stale but isn't clearly marked so. Worse: admin edits the email (typo fix) but old invite is still live.
- **Prevention:** Re-send = generate new token + set `voided_at=now()` on prior row with `void_reason='resent'`. Re-send UI shows the last-sent timestamp and a "this will invalidate the previous link" confirmation. Integration test: issue → resend → try old token → 410 Gone.
- **Phase:** Invite-management phase

---

## 7. Test infrastructure during cross-cutting rewrite

### TI1. Playwright `storageState` captured under ZITADEL auth is still committed
- **Severity:** 4
- **What goes wrong:** `web/e2e/.auth/storageState.json` contains ZITADEL access tokens that are meaningless under the new stack. E2E suite either errors early (no cookie for the new backend) or — worse — the storageState happens to match a leftover cookie name and tests run authenticated-but-wrong, masking real failures.
- **Prevention:** Delete `web/e2e/.auth/*` as the first commit of the auth rewire. Rewrite `auth-flow.ts` to perform a real login against the new backend and store the resulting session cookie fresh on every CI run. Add a pre-test assertion that `storageState` is <1 day old; fail loudly otherwise.
- **Phase:** Test harness rewire phase

### TI2. `scripts/seed.py` references dropped User columns
- **Severity:** 3
- **What goes wrong:** Seed script sets `User.zitadel_user_id="..."` explicitly; migration drops the column; seed fails with opaque SQLAlchemy error on `docker compose up` bootstrap for everyone.
- **Prevention:** In the same PR that adds the User-table migration, rewrite `scripts/seed.py` to use the new fastapi-users shape. Lint: `rg -l 'zitadel' scripts/` post-merge must return zero.
- **Phase:** Test harness rewire phase

### TI3. `scripts/create-e2e-users.py` races the new login endpoint during bootstrap
- **Severity:** 3
- **What goes wrong:** Script calls `POST /auth/register` before the API is fully ready (docker healthcheck is too lenient); returns 503 or connection-refused; Playwright suite runs with no E2E users; tests fail in unhelpful ways.
- **Prevention:** Script loops with `healthcheck` → `POST /auth/register` → `GET /users/me` (validates both creation and login) with explicit retry (max 30s). The script must be idempotent: if user exists, log and continue, don't error. Integration test on the script itself in CI.
- **Phase:** Test harness rewire phase

### TI4. Mock backend in vitest tests diverges from real auth surface
- **Severity:** 3
- **What goes wrong:** Existing vitest tests mock `useAuth()` to return a fake user synchronously. New real auth is cookie-based and async. Mocks still return the old shape; tests pass but don't reflect real runtime behavior; drift accumulates.
- **Prevention:** Write a **single canonical test helper** `web/src/test/mockAuth.ts` exporting `mockAuthenticatedUser()` / `mockAnonymousUser()` that matches the new `useAuth()` shape. Migrate all tests to use it (grep `jest.mock.*useAuth|vi.mock.*useAuth` and rewire each). Fail CI if a test mocks `useAuth` inline instead of via the helper (ESLint custom rule).
- **Phase:** Test harness rewire phase

### TI5. Continuous verification (SEED-002) started AFTER the rewrite instead of before
- **Severity:** 4
- **What goes wrong:** The cross-cutting rewrite is exactly the scenario SEED-002 was seeded to prevent. If pre-commit / CI-on-push / scheduled runs aren't in place *first*, the rewrite accumulates drift faster than any prior phase, guaranteeing another 200-failure cleanup phase.
- **Prevention:** SEED-002 infrastructure (pre-commit hooks, push-trigger CI, scheduled nightly, env-drift healthcheck) lands as **Phase 112 (first phase of v1.20)**, before the auth rewire begins in Phase 113+. Roadmap MUST enforce this ordering; ROADMAP.md gates auth-rewire phases on a "SEED-002 green" checkbox.
- **Phase:** Phase 112 (first phase of v1.20, prerequisite for all subsequent)

---

## 8. Rollback

### R1. User-table migration has no tested `downgrade()`
- **Severity:** 5
- **What goes wrong:** Rollback attempt post-deploy fails because `downgrade()` wasn't tested — or can't work because data is gone (ZITADEL columns dropped, no source to re-populate from). Operations team is stuck fixing forward under pressure.
- **Prevention:** Every migration in the chain has a tested `downgrade()` for the schema DDL. Data-destructive steps (dropping ZITADEL columns) happen in the **final** migration of the chain — rollback stops at the schema-add step, data intact. Add a CI job that runs `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` on a test DB and asserts it succeeds.
- **Phase:** User-table migration phase

### R2. Cookie-auth users hitting a rolled-back JWT-auth build
- **Severity:** 4
- **What goes wrong:** Deploy v1.20 → users get cookies. Regression found → rollback to v1.19 → old build expects `Authorization: Bearer` and doesn't know what to do with the cookie. All v1.20-era users are logged out with no graceful message. May 401-loop.
- **Prevention:** Accept that session migration is not cleanly reversible and document it as such. Rollback plan explicitly flushes the `access_token` table in Postgres and the cookies in browsers (a one-time global logout) as part of the rollback runbook. Ship v1.20 behind a feature flag if possible; but full-stack auth doesn't flag cleanly, so mitigate by aggressive pre-deploy staging validation.
- **Phase:** Deployment phase

### R3. Partial rollback where backend reverts but frontend doesn't
- **Severity:** 3
- **What goes wrong:** SPA is served from CDN (or embedded in the API container — current state). Rollback of the API container doesn't re-serve old SPA code; users have new SPA talking to old backend. Every request fails.
- **Prevention:** Keep SPA embedded in API container for v1.20 (don't introduce CDN split during a major rewrite). Rollback rolls both atomically. If SPA splits off in a later milestone, rollback plan must version SPA and API together.
- **Phase:** Deployment phase

---

## 9. Continuous verification (SEED-002)

### CV1. Flaky tests cause alerting fatigue; team mutes Slack channel
- **Severity:** 4
- **What goes wrong:** Nightly run fires Slack alerts on red; intermittent flakes (timing-sensitive E2E, Playwright retries not enabled) produce false positives; team auto-mutes or sets filter rules; the next real regression sails through unnoticed.
- **Prevention:** Quarantine lane for known-flaky tests in CI config with a hard cap (max 5 quarantined specs) and a 7-day TTL — a flake quarantined for >7 days either gets fixed or deleted. Alert only when the stable-lane regresses, not on quarantine-lane flakes. Expose the quarantine list in the README so PRs don't pile into it silently.
- **Phase:** SEED-002 Phase 112

### CV2. Scheduled runs mask deployment regressions by being "old data"
- **Severity:** 3
- **What goes wrong:** Nightly runs against `main` at 02:00. A bad merge at 14:00 doesn't surface until 24h later; meanwhile a canvass shift went out under broken code. Worse: the nightly flakes and gets retried in the morning and passes — regression never alerted.
- **Prevention:** Scheduled run is ONE of three signals (the others: push-trigger CI, pre-commit hooks). Pre-commit catches at dev time; push CI catches within 10 minutes of merge; scheduled catches env drift overnight. No single layer is relied on for the same class of bug.
- **Phase:** SEED-002 Phase 112

### CV3. Pre-commit hooks are too slow → devs install `--no-verify` muscle memory
- **Severity:** 4
- **What goes wrong:** Pre-commit runs full pytest and takes 90 seconds. Developers reflexively `git commit --no-verify` "just this once," which becomes every time. Safety layer is gone.
- **Prevention:** Pre-commit MUST be <5 seconds on a typical change: only `ruff format/check`, `vitest related` on staged frontend files, `pytest --lf -x` on staged Python files (last-failed, fail-fast; runs ~2-5 tests typically). Full suites live in push CI. Measure commit-to-commit-complete latency and alert if >10s.
- **Phase:** SEED-002 Phase 112

### CV4. CI reports to a channel nobody watches
- **Severity:** 3
- **What goes wrong:** Slack channel `#ci-alerts` gets created; on-call isn't subscribed; fires are missed. Classic "monitoring exists but nobody's watching" pattern.
- **Prevention:** CI regression alerts DM the PR author (via GitHub Actions `actions/github-script` resolving commit author to handle). Secondary: post to `#engineering` main channel (not a dedicated ci channel) so it's in the feed people actually read. Nightly scheduled-run regressions open a GitHub issue with auto-assignment to the last committer.
- **Phase:** SEED-002 Phase 112

### CV5. Quarantining as drift mitigation instead of fixing root cause
- **Severity:** 4
- **What goes wrong:** A test starts flaking; quarantine lane welcomes it; lane grows; continuous verification becomes continuous allow-list-growing. Phase 106 already produced 43 deferred specs — that's the precursor.
- **Prevention:** Hard cap (≤5 quarantined) + 7-day TTL. On TTL expiry: either fix or delete. Weekly bot comment on open quarantine issues reminding owners. If cap exceeded, CI goes red on all PRs until below cap — forcing triage.
- **Phase:** SEED-002 Phase 112

---

## 10. Cross-cutting rewrite hygiene

### X1. Scope creep: "while we're in here" refactors
- **Severity:** 3
- **What goes wrong:** Auth rewire exposes ugliness in the dependency chain; dev refactors the whole dep tree to "make it clean" while they're there; PR balloons from 2k lines to 10k lines; review becomes impossible; bugs ride in.
- **Prevention:** ROADMAP.md phase descriptions enumerate exact in-scope files. Anything touching files outside the list requires a separate PR on its own branch. Enforced via code review checklist.
- **Phase:** All v1.20 phases

### X2. Incomplete ZITADEL removal — half-removed code paths
- **Severity:** 4
- **What goes wrong:** Main login flow migrated but a leftover utility (`app/services/zitadel.py::get_user_metadata`) is still called by an admin endpoint. Production half-works; admin page 500s and nobody notices because admin surface is low-traffic.
- **Prevention:** Final rewrite commit: `rg -l '\bzitadel\b' --type=py --type=ts` must return zero files (excepting archived .planning/ artifacts). CI check enforces this invariant. All references in docs/comments marked as historical or deleted.
- **Phase:** Final cleanup phase of v1.20

### X3. Stale `.env` / docker-compose / K8s references to ZITADEL
- **Severity:** 3
- **What goes wrong:** `.env.example` still has `ZITADEL_DOMAIN`; `docker-compose.yml` still has a zitadel service (orphan container on next `up`); K8s manifests still reference ZITADEL secrets.
- **Prevention:** Audit commit touches: `.env.example`, `docker-compose.yml`, `k8s/**/*.yaml`, `scripts/bootstrap-*.sh`, `web/.env.local.example`. `rg -l zitadel` across infra configs must return zero. Bootstrap-dev.sh rewritten to not configure ZITADEL anything.
- **Phase:** Final cleanup phase of v1.20

### X4. Naive datetime regression reintroduced (carried forward from v1.19 O6)
- **Severity:** 4
- **What goes wrong:** New auth code paths compute `session.expires_at = datetime.utcnow() + timedelta(...)` (naive); Postgres stores as TIMESTAMPTZ but coerces as UTC of local time; comparisons later silently drift by whatever the container tz is.
- **Prevention:** Ruff custom rule (or grep-based pre-commit) banning `datetime.utcnow()` and `datetime.now()` without `tz=`. Use `datetime.now(UTC)`. All new DateTime columns use `DateTime(timezone=True)`. Unit test reflecting schema asserts this invariant for `access_token`, `users`, invite token tables.
- **Phase:** Every phase; enforced via pre-commit

### X5. Documentation (CLAUDE.md, READMEs, onboarding docs) still describes ZITADEL
- **Severity:** 2
- **What goes wrong:** New contributor reads `CLAUDE.md`, tries to bootstrap ZITADEL, can't, wastes hours.
- **Prevention:** Final cleanup phase updates CLAUDE.md, root README, `scripts/bootstrap-dev.sh` comments, and any onboarding markdown. CI check: `rg 'ZITADEL\|zitadel' *.md scripts/*.sh docs/` allowed-list contains only files explicitly marked historical (e.g., `.planning/notes/decision-drop-zitadel-diy-auth.md`).
- **Phase:** Final cleanup phase of v1.20

### X6. Email-delivery pitfalls from v1.16/v1.19 (S1-series) still apply under DIY
- **Severity:** Varies (3-4)
- **Carried forward from v1.19:** O2 (Procrastinate retry storm — now hits our own `/auth/forgot-password` and invite mailers), O3 (Mailgun webhook reordering — still applies to invite/reset delivery), O7 (provider-message-id bracket normalization — still needed for Mailgun message IDs).
- **Prevention:** The v1.16 patterns (idempotent-by-key mailer tasks, monotonic state transitions on webhooks, `normalize_external_id` helper) are unchanged and remain mandatory. Test coverage for each invariant stays as-is. DIY framing: reset/verify/invite emails all flow through the same Procrastinate queue and webhook state machine — no new delivery primitive.
- **Phase:** Email-delivery phase, webhook-handling phase

### X7. ZITADEL-specific pitfalls explicitly DROPPED from v1.19 list
- **Explanation (not a pitfall — a dropped list):**
  - **S1 (ZITADEL #10319, `initialPassword` bypasses email verification):** OBSOLETE — we fully control `is_verified` under DIY. Verification model becomes Q-AUTH-01.
  - **S6, Z3 (ZITADEL service-account privilege escalation):** OBSOLETE — no ZITADEL PAT exists.
  - **U2 (ZITADEL 72h init-code TTL, not configurable):** OBSOLETE — we choose our own invite TTL (14 days recommended).
  - **U6 (ZITADEL Hosted Login UI disabled):** OBSOLETE — no hosted login.
  - **O1 (ZITADEL 50 req/s Management API rate limit):** OBSOLETE — no external rate ceiling on invite creation (still rate-limit our own endpoints, but that's ours to tune).
  - **Z1, Z2, Z4, Z5, Z6 (all ZITADEL-specific):** OBSOLETE.
  - **M1 (pre-created ZITADEL user logs in before accepting invite):** OBSOLETE — we control when the User row's `hashed_password` is set; no user can authenticate before invite-accept under DIY.

---

## Phase-specific Warnings Table

| Phase | Pitfalls to address |
|-------|--------------------|
| Phase 112: SEED-002 continuous verification | TI5, CV1-CV5 (PREREQUISITE for all subsequent phases) |
| User-table migration | M1, M2, M3, M4, M5, M6, INV5, R1 |
| Cookie config / CORS | C4, C5, C6, C7, FE2 |
| CSRF middleware | C2, C3 |
| Native auth endpoints (fastapi-users) | C1, F1, F2, F3, F4, T2, T3, T5, FE4 |
| Password-reset / email-verify | T1, T2, T3, T4, T6 |
| Frontend auth rewire | FE1, FE2, FE3, FE4, FE5, FE6 |
| Invite-flow re-implementation | F5, INV1, INV2, INV3, INV4, INV6 |
| Email delivery / webhooks | X6 (carries v1.19 O2/O3/O7) |
| Test harness rewire | TI1, TI2, TI3, TI4 |
| Deployment | M2, M3, R1, R2, R3 |
| Final cleanup | X2, X3, X5 |
| Every code-touching phase | X1 (scope-creep), X4 (naive datetime) |

---

## Severity Summary

- **Severity 5 (security breach / data loss):** C1, M1, M4, FE1, INV2, R1 — 6 pitfalls
- **Severity 4 (major functional or security):** C2, C6, C7, F1, F2, F3, M2, M3, M5, T1, T3, T4, T6, FE3, INV1, INV3, INV4, TI5, R2, CV1, CV3, CV5, X2, X4 — 24 pitfalls
- **Severity 3 (user-impacting, requires attention):** C3, C4, C5, F5, M6, T2, FE2, FE5, INV6, TI2, TI3, TI4, R3, CV2, CV4, X1, X3 — 17 pitfalls
- **Severity 2 (minor / hygiene):** F4, T5, U3-equivalent (not listed separately — rolled into FE6), FE6, X5 — 4 pitfalls

Total: 51 in-scope pitfalls for v1.20. Six at severity 5 — all demand named tests before the phase that introduces them is considered complete.

---

## Sources

- `.planning/notes/decision-drop-zitadel-diy-auth.md` — authoritative decision record
- `.planning/research/v1.19/PITFALLS.md` — prior-milestone pitfalls (filtered for DIY applicability)
- `.planning/research/questions.md` — Q-AUTH-01/02/03 design questions
- `.planning/seeds/SEED-002-test-hygiene-continuous-verification.md` — continuous verification scope
- fastapi-users 15.0.5 docs (Context7 `/frankie567/fastapi-users` — referenced for hook lifecycle, CookieTransport, DatabaseStrategy behavior)
- OWASP ASVS v4.0.3 §3 (Session Management), §4 (Access Control), §7 (Error Handling & Logging) — industry-standard session-security checklist
- NIST SP 800-63B §5.1.1.2 (memorized secrets, length-only guidance) — referenced for Q-AUTH-02
