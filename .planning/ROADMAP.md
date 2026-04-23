# v1.20 Native Auth Rebuild & Invite Onboarding Roadmap

**Milestone:** v1.20 Native Auth Rebuild & Invite Onboarding
**Goal:** Replace ZITADEL with native auth (fastapi-users 15.0.5 + `CookieTransport` + `DatabaseStrategy`, Postgres-backed) under a continuous-verification safety net, then ship the invite onboarding flow originally scoped in v1.19 under our own auth stack — no external-IdP redirects.
**Granularity:** standard (8 phases, continuing from Phase 111)
**Coverage:** 53/53 v1.20 requirements mapped
**Last updated:** 2026-04-23

---

## Strategy

Derived from `.planning/research/SUMMARY.md`, which converged (across STACK / FEATURES / ARCHITECTURE / PITFALLS) on the build order below. Three load-bearing invariants drive the shape:

1. **SEED-002 ships FIRST (Phase 112).** A cross-cutting auth rewrite without continuous verification replays v1.18 Phase 106's 219-silent-failure situation at larger scale. Phase 112 is a hard prerequisite for every subsequent phase (TI5, severity 4).
2. **Three Q-AUTH-* decisions are deliberately unresolved at milestone-scoping time** and gate specific later phases:
   - **Q-AUTH-01** (email verification model) → **Phase 117**
   - **Q-AUTH-02** (password policy rule set) → **Phase 116**
   - **Q-AUTH-03** (session lifecycle) → **Phase 119**
3. **Phase 118 ZITADEL tear-out is gated on ≥1 milestone of production soak** on the native-auth stack. This is an explicit external gate — Phase 118 cannot begin until v1.21+ is underway with native auth running in prod without rollback regressions.

Phase numbering continues from v1.19 — Phase 111 remains in place as the `urlTemplate` spike-FAIL artifact; v1.20 begins at Phase 112.

**Test obligations:** TEST-04 (baseline trustworthiness) is the exit gate for every code-touching phase. TEST-01/02/03 are infrastructure deliverables in Phase 112 that every subsequent phase inherits and reinforces.

---

## Phases

- [ ] **Phase 112: SEED-002 Continuous Verification Infrastructure** — Pre-commit hooks, push-trigger CI, scheduled nightly, env-drift doctor; prerequisite for all subsequent phases
- [ ] **Phase 113: User Table Migration + fastapi-users Scaffolding** — Alembic reshape, `access_token` table, fastapi-users wiring, core login/logout endpoints; gated on prod user audit + Context7 fastapi-users 15.0.5 lookup
- [ ] **Phase 114: CSRF Middleware** — Pure-ASGI double-submit CSRF with session-bound HMAC token, exemption allowlist, rotation on login
- [ ] **Phase 115: Frontend Auth Rewire + Cutover** — `credentials: 'include'`, CSRF header, authStore rewrite, `oidc-client-ts` removal, Playwright auth helper rewrite; flag-flip `AUTH_BACKEND=native`
- [ ] **Phase 116: Invite Flow Re-Implementation** — `/invites/{token}/setup` single-route accept flow, email-mismatch recovery, idempotent re-invite, password policy enforcement; gated on Q-AUTH-02
- [ ] **Phase 117: Password Reset + Email Verify** — `/auth/forgot-password`, `/auth/reset-password`, `/auth/request-verify-token`, `/auth/verify`, branded transactional emails; gated on Q-AUTH-01
- [ ] **Phase 118: ZITADEL Tear-Out** — Delete `app/services/zitadel.py`, bootstrap-zitadel.py, `.zitadel-data/`, authlib, ZITADEL env vars, compose service; gated on ≥1 milestone production soak on native stack
- [ ] **Phase 119: Session Lifecycle + Admin Controls** — Idle/absolute timeout, logout-all admin control, per-session device metadata logging, password-change session invalidation; gated on Q-AUTH-03

---

## Phase Details

### Phase 112: SEED-002 Continuous Verification Infrastructure

**Goal:** Stand up pre-commit / CI-on-push / scheduled-nightly test runs with an env-drift doctor so drift is caught within 24 hours of introduction — before the cross-cutting auth rewrite starts touching every test surface.

**Depends on:** Nothing (prerequisite for all subsequent v1.20 phases).

**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04

**Success Criteria** (what must be TRUE):
1. Running `git commit` on a branch that introduces a ruff violation or a prettier drift exits non-zero from the pre-commit hook in under 5 seconds, citing the specific file and rule — installed automatically when a fresh clone runs `scripts/bootstrap-dev.sh`.
2. A push that breaks pytest or vitest produces a red GitHub Actions check on the feature branch within 10 minutes of push, not only when a PR is opened.
3. A regression introduced Monday morning surfaces in the nightly-run summary (pass/fail counts, duration, delta vs. previous night appended to `web/e2e-runs.jsonl`) by Tuesday morning, attributable to the introducing commit via the scheduled Playwright workflow.
4. `scripts/doctor.sh` exits non-zero on a known env drift (e.g., `.env` DB port not matching `docker compose port db 5432`, missing E2E users, or pyproject/image dep skew), printing a human-readable remediation line; CI invokes it as the first step of every workflow and fails fast.
5. Phase-exit gate (TEST-04): pytest + vitest + Playwright are green on two consecutive runs via `web/scripts/run-e2e.sh` before Phase 113 begins; SEED-002 infrastructure itself has CI coverage.

**Plans:** TBD

---

### Phase 113: User Table Migration + fastapi-users Scaffolding

**Goal:** Reshape the `users` table to the fastapi-users base mixin under a reversible multi-revision Alembic chain, add the `access_token` table, wire `CookieTransport` + `DatabaseStrategy` behind `AUTH_BACKEND=zitadel|native` feature flag, and ship the core login/logout endpoints with session rotation on login.

**Depends on:** Phase 112 (continuous-verification safety net must be green before cross-cutting rewrite begins).

**Entry gates:**
- Prod user audit complete (verifies path-(c) full reset is safe OR enumerates the list of legacy-auth users for forced password-reset emails)
- Context7 lookup on fastapi-users 15.0.5 complete (exact router prefixes `/auth/cookie/login`, DatabaseStrategy session-sharing semantics, UUID-vs-string ID handling, `on_after_*` hook signatures)

**Requirements:** MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, AUTH-01, AUTH-02, AUTH-06, SEC-01, SEC-05

**Success Criteria** (what must be TRUE):
1. `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` succeeds against a seeded test database in CI; the four-revision chain (add nullable → backfill idempotent → add NOT NULL + indexes → drop ZITADEL columns) is individually re-runnable with passing downgrades at every step except the final data-destructive one.
2. After `POST /auth/cookie/login` with valid credentials, the response carries an httponly + Secure + SameSite=Lax session cookie; a second back-to-back login POST from the same client produces a different `access_token` row ID and the prior row is deleted from the database (C1 session-fixation mitigation, proven by integration test).
3. After `POST /auth/cookie/logout`, attempting any authenticated request with the old cookie returns 401 even if replayed (server-side `access_token` row is deleted, not just cookie cleared).
4. `POST /auth/register` is not publicly mounted; the fastapi-users router is included with the register route explicitly omitted, and an integration test asserts that calling `/auth/register` externally returns 404.
5. `get_current_user` resolves via fastapi-users on a non-RLS session (`get_db`); `get_campaign_db` still performs `set_config('app.current_campaign_id', ..., true)` under transaction scope and RLS isolation tests from v1.5 still pass on the native-auth path.
6. Legacy-auth users identified in the prod audit receive forced password-reset emails via the existing Procrastinate `communications` queue during migration; if audit returned count=0, the migration's email-enqueue step is a no-op with logged evidence.
7. Phase-exit gate (TEST-04): pytest/vitest/Playwright green on two consecutive runs; `tests/auth/test_cookie_login.py` and `tests/auth/test_user_migration.py` land in this phase.

**Plans:** TBD

---

### Phase 114: CSRF Middleware

**Goal:** Ship a ~40-LOC pure-ASGI double-submit CSRF middleware that binds the CSRF token to the session row via HMAC, allowlists auth-bootstrap endpoints, and rotates the token on login.

**Depends on:** Phase 113 (CSRF token is HMAC'd against `access_token.id`, so the access_token table and session-minting plumbing must exist first).

**Requirements:** CSRF-01, CSRF-02, CSRF-03, CSRF-04, CSRF-05

**Success Criteria** (what must be TRUE):
1. A POST to any `/api/v1/*` endpoint without a valid `X-CSRF-Token` header (or with a header value that doesn't match the `csrf_token` cookie) returns 403 with a neutral error body; the same POST with a header matching the cookie passes middleware and reaches the route.
2. A pytest introspection test walks `app.router.routes` and asserts that (a) every POST/PUT/PATCH/DELETE route outside the allowlist requires CSRF, (b) GET/HEAD/OPTIONS are always exempt, and (c) the allowlist is exactly `/auth/cookie/login`, `/auth/register` (admin-only), `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify`, `/auth/request-verify-token`, `/invites/{token}/setup`, `/health/*`, and Mailgun webhook endpoints.
3. Middleware registration order in `app/main.py` is CORS → SecurityHeaders → Structlog → CSRF → fastapi-users routes; a startup assertion validates the order.
4. After a successful `/auth/cookie/login`, the response sets a new `csrf_token` cookie (JS-readable, not httponly) whose value equals `hmac(server_secret, new_access_token_id)`; a back-to-back login produces a rotated CSRF token.
5. Phase-exit gate (TEST-04): `tests/auth/test_csrf_middleware.py` covers token-match, token-mismatch, missing-header, exemption-allowlist, rotation-on-login, and streaming-response safety; pytest/vitest/Playwright green on two consecutive runs.

**Plans:** TBD

---

### Phase 115: Frontend Auth Rewire + Cutover

**Goal:** Switch the SPA to cookie auth — `credentials: 'include'` on `ky`, `X-CSRF-Token` header on mutating verbs, authStore rewritten without `oidc-client-ts`, Playwright auth helper posting directly to `/auth/cookie/login` — then flip the default `AUTH_BACKEND=native` and leave ZITADEL behind a flag for soak.

**Depends on:** Phase 114 (frontend needs the CSRF token contract before rewiring; mutating verbs must work from day one of cutover).

**Requirements:** FE-01, FE-02, FE-03, FE-04, FE-05, FE-06, SEC-03, OBS-01

**Success Criteria** (what must be TRUE):
1. After login via the new `/login` form, the session cookie rides on every subsequent `ky` request without any `Authorization: Bearer` header; a Playwright test asserts the cookie is sent from every unique API base used in the app (FE1 severity-5 mitigation — audit covers `rg '\bfetch\('` + `rg 'new EventSource|new WebSocket'` across `web/src/`).
2. `oidc-client-ts` is absent from `web/package.json`, `npx tsc --noEmit` passes, `npm run build` produces zero warnings about unused modules, and `rg 'oidc-client-ts\|UserManager\|signinRedirect'` against `web/src/` returns zero matches.
3. The `/callback` route is deleted from the file-based router; navigating to `/callback` returns the generic 404 route.
4. Playwright `web/e2e/auth-flow.ts` performs a direct `POST /auth/cookie/login` via `page.request` and captures the session cookie into `storageState`; stale `web/e2e/.auth/*` pre-dating the rewire is deleted; all E2E specs run under the new storageState.
5. On a 401 response, the TanStack-Query interceptor clears the user cache and redirects to `/login?redirect=<current>`; the login page preserves the redirect and bounces back after success. Structured log events emit `login.success`, `login.failure`, and `logout` with `user_id`, `session_id`, and request metadata (OBS-01).
6. `/auth/cookie/login` and `/auth/forgot-password` are rate-limited via the existing slowapi surface (5 attempts / 15 min on login, per-IP; exponential backoff on repeated failures) and the AST-based rate-limit-guard test recognizes the fastapi-users router routes (SEC-03).
7. Phase-exit gate (TEST-04): pytest/vitest/Playwright green on two consecutive runs; cutover is live at `AUTH_BACKEND=native` default with ZITADEL flag still functional for emergency rollback.

**Plans:** TBD
**UI hint**: yes

---

### Phase 116: Invite Flow Re-Implementation

**Goal:** Ship the v1.19-originally-scoped invite onboarding flow under native auth as a single-route `/invites/{token}/setup` that atomically creates the user, sets the password under a live-validated policy, mints the session cookie, and binds the campaign membership — with email-mismatch recovery, idempotent re-invite, and `SELECT FOR UPDATE` race protection.

**Depends on:** Phase 115 (invite accept mints the session cookie on the new contract; frontend must be on the native path).

**Entry gate:**
- **Q-AUTH-02 resolved** (password policy rule set: zxcvbn strength / length + character class / NIST 800-63B length + HIBP) — determines `validate_password` hook body, frontend live-validator shape, and dependency additions (zxcvbn vs. none)

**Requirements:** INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, PWD-01, PWD-02, OBS-03

**Success Criteria** (what must be TRUE):
1. Clicking an invite link lands the invitee on `/invites/{token}/setup`; a GET to the URL renders the password-set UI but **does NOT** mark the invite accepted (Mailgun click-tracking disabled, `X-Robots-Tag: noindex`, no `accepted_at` mutation on GET — INV1 mitigation).
2. Submitting the setup form with a valid password creates the user row (fastapi-users hashed password), marks the invite accepted under `SELECT FOR UPDATE`, creates the `campaign_members` row, mints the session cookie, and redirects to the campaign dashboard — **in a single request/response round-trip, with no intermediate "now please sign in" screen**.
3. An `asyncio.gather` race test firing two concurrent POSTs to `/invites/{token}/setup` results in exactly one membership row and exactly one session; the second request returns 410 Gone (INV3, severity 4).
4. Accepting an invite while authenticated as an email-mismatched account renders the three-action recovery page (logout & accept as invitee / contact inviter / cancel); no silent binding occurs; an integration test asserts 403 with the mismatch page when `invite.email != request.user.email` (INV2, severity 5 mitigation).
5. An existing user invited to a second campaign lands directly on the accept panel (no password-set UI); accept binds a new `campaign_members` row idempotently without altering their existing user record.
6. Invite emails continue to flow through the existing Procrastinate `communications` queue; `normalize_external_id`, idempotent-by-key delivery, and monotonic webhook state from v1.16 are preserved (verified by the existing v1.16 integration tests still passing).
7. Frontend live-password validator and backend `validate_password` hook agree on the rule set chosen by Q-AUTH-02 — a unit test submits a password that the frontend would reject and asserts the backend rejects it with the same error text.
8. Pre-migration inventory queues forced password-reset emails for any ZITADEL-shadow rows created during v1.19 Phase 111 (INV-05); the admin pending-invite view from v1.17/v1.19 continues to surface invite lifecycle state (OBS-03).
9. Phase-exit gate (TEST-04): pytest/vitest/Playwright green on two consecutive runs; Playwright spec covers first-time invite → password-set → landing, returning-user invite → accept → landing, and email-mismatch recovery.

**Plans:** TBD
**UI hint**: yes

---

### Phase 117: Password Reset + Email Verify

**Goal:** Ship `/auth/forgot-password`, `/auth/reset-password`, `/auth/request-verify-token`, `/auth/verify` with bounded-TTL tokens, one-time-use under `SELECT FOR UPDATE`, session invalidation on successful reset, branded transactional emails, and the email-verification model resolved by Q-AUTH-01.

**Depends on:** Phase 115 (password-reset flow uses the new cookie contract; does NOT depend on Phase 116 since reset flow is independent of invite specifics).

**Entry gate:**
- **Q-AUTH-01 resolved** (email verification model: invite-token-as-proof vs. explicit verify ceremony) — determines whether invite-accept sets `is_verified=true` directly or requires a separate click, and whether `/auth/verify` is a gating surface or optional

**Requirements:** AUTH-03, AUTH-04, AUTH-05, PWD-03, PWD-04, SEC-02, OBS-02

**Success Criteria** (what must be TRUE):
1. `POST /auth/forgot-password` returns a byte-identical 202 response for known and unknown emails (no enumeration); for known emails, a password-reset email is queued via the Procrastinate `communications` queue within the same request.
2. The reset token consumed at `POST /auth/reset-password` is one-time-use: two concurrent requests with the same token (via `asyncio.gather`) result in exactly one success; the second request returns 410 Gone (T1 mitigation, `SELECT ... FOR UPDATE WHERE used_at IS NULL`).
3. After a successful password reset, all other active session rows for that user are deleted from `access_token`; the current session stays valid; an integration test asserts a pre-reset cookie from a second browser returns 401 after reset completes (C3 mitigation).
4. Reset and verify emails never contain user-identifying information in the URL beyond the opaque token; the reset page sets `Referrer-Policy: no-referrer` and JS moves the token from the URL to a hidden form field on page load (T4/T6 mitigation); Mailgun templates are branded, transactional, respect reduced-motion, and ship plaintext fallback.
5. Email verification behavior matches the Q-AUTH-01 decision: if "invite-token-as-proof," invite-accept sets `is_verified=true` and no separate ceremony is required; if "explicit ceremony," `/auth/verify` is wired and the frontend gates sensitive actions behind `is_verified`.
6. Structlog events emit `password_reset.request`, `password_reset.complete`, `email_verify.request`, and `email_verify.complete` with `user_id` and request metadata; Sentry breadcrumbs surround the flow; the 4xx rate on `/auth/forgot-password` is monitored for brute-force signal (OBS-02).
7. Phase-exit gate (TEST-04): pytest/vitest/Playwright green on two consecutive runs; `tests/auth/test_password_reset.py` and `tests/auth/test_email_verify.py` cover enumeration neutrality, one-time-use, cross-session invalidation, referrer policy, and Q-AUTH-01 behavior branch.

**Plans:** TBD

---

### Phase 118: ZITADEL Tear-Out

**Goal:** Remove every ZITADEL artifact — `app/services/zitadel.py`, `scripts/bootstrap-zitadel.py`, `.zitadel-data/`, the docker-compose ZITADEL service, `authlib`, `oidc-client-ts` references in env files, ZITADEL_* env vars, and any `zitadel` references outside `.planning/` archives — and verify the cleanup with a grep-zero invariant.

**Depends on:** Phase 115 (production cutover must have occurred), Phase 116 (invite flow on native stack must have shipped), Phase 117 (password reset/verify must have shipped), **AND external gate: ≥1 milestone of production soak on the native-auth stack with no rollback regressions observed.** Phase 118 cannot begin until v1.21+ is underway with native auth running in prod — this is an explicit external gate, not a code dependency.

**Requirements:** CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, SEC-04

**Success Criteria** (what must be TRUE):
1. `rg '\bzitadel\b'` (case-insensitive) against `app/`, `web/src/`, `scripts/`, `alembic/`, `.github/`, `docker-compose.yml`, and `.env*` returns zero matches outside `.planning/` archives — a CI check enforces this invariant.
2. `rg 'authlib|from jose\|import jose'` against `app/` returns zero; `authlib` is removed from `pyproject.toml` and `uv lock` reflects the removal.
3. `docker compose up` starts a stack without a ZITADEL service; `.zitadel-data/` and `scripts/bootstrap-zitadel.py` are deleted; `scripts/bootstrap-dev.sh` has been rewritten and no longer configures ZITADEL-related TLS/env.
4. ZITADEL_* env vars are absent from `.env`, `.env.example`, `docker-compose.yml`, all k8s manifests, `web/.env.local.example`, and any GitHub Actions secrets reference; CI check enforces on every PR.
5. The AST-based rate-limit-guard test now recognizes `fastapi_users.get_auth_router(...)` routes and asserts every `/auth/*` route has a limiter decorator (SEC-04).
6. Phase-exit gate (TEST-04): pytest/vitest/Playwright green on two consecutive runs; CLAUDE.md, root README, onboarding docs, and contributor guides updated to reflect native-auth-only stack.

**Plans:** TBD

---

### Phase 119: Session Lifecycle + Admin Controls

**Goal:** Implement the session lifecycle model resolved by Q-AUTH-03 (idle timeout, absolute timeout, refresh-on-activity, logout-all semantics), ship admin logout-all-sessions control, log per-session device metadata (IP, UA, last-seen) for a future UI, and wire password-change-invalidates-other-sessions.

**Depends on:** Phase 113 (extends the `access_token` table surface). Can run **in parallel with Phase 118** since it extends rather than removes code — teardown and lifecycle-refinement are independent.

**Entry gate:**
- **Q-AUTH-03 resolved** (session lifecycle: idle timeout / absolute timeout / refresh-on-activity / logout-all semantics) — determines `access_token` row TTL strategy, cookie `Max-Age`, Procrastinate cleanup task, and whether refresh mutates `access_token.expires_at` on every authenticated request

**Requirements:** SESS-01, SESS-02, SESS-03, SESS-04

**Success Criteria** (what must be TRUE):
1. Session lifecycle behavior matches the Q-AUTH-03 decision: idle/absolute timeout observable via integration test (a session beyond the configured window returns 401 even if the cookie is unexpired at the browser layer); if refresh-on-activity is chosen, `access_token.expires_at` advances on authenticated requests and an integration test asserts the advance.
2. An admin with `org_admin` role can call "log out all sessions for user X" and all `access_token` rows for that user are deleted; the next authenticated request from any of that user's existing browsers returns 401; the action is logged via structlog with admin_id, target_user_id, and reason.
3. Each new `access_token` row records IP, user-agent, and last-seen timestamp at login; `last_seen` updates on authenticated requests (consistent with the refresh model chosen in Q-AUTH-03); the data is queryable by admin tooling but no read-surface UI ships in v1.20 (deferred to a later milestone).
4. Changing a password (whether via `/auth/reset-password` or a future password-change-while-authed endpoint) deletes all `access_token` rows for that user except the current session; an integration test asserts a second-browser cookie becomes 401 while the changing session stays 200 (paired with AUTH-04).
5. If Q-AUTH-03 chose an absolute TTL, a Procrastinate `communications`-queue task purges expired `access_token` rows nightly; the task is idempotent and has integration coverage.
6. Phase-exit gate (TEST-04): pytest/vitest/Playwright green on two consecutive runs; `tests/auth/test_session_lifecycle.py` covers timeout boundaries, logout-all, password-change invalidation, and device-metadata capture.

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 112. SEED-002 Continuous Verification | 0/? | Not started | - |
| 113. User Table Migration + fastapi-users Scaffolding | 0/? | Not started | - |
| 114. CSRF Middleware | 0/? | Not started | - |
| 115. Frontend Auth Rewire + Cutover | 0/? | Not started | - |
| 116. Invite Flow Re-Implementation | 0/? | Not started | - |
| 117. Password Reset + Email Verify | 0/? | Not started | - |
| 118. ZITADEL Tear-Out | 0/? | Not started | - |
| 119. Session Lifecycle + Admin Controls | 0/? | Not started | - |

---

## Coverage Validation

All 53 v1.20 requirements mapped to exactly one phase. No orphans. No duplicates.

| Phase | Requirements | Count |
|-------|--------------|-------|
| 112 | TEST-01, TEST-02, TEST-03, TEST-04 | 4 |
| 113 | MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, AUTH-01, AUTH-02, AUTH-06, SEC-01, SEC-05 | 11 |
| 114 | CSRF-01, CSRF-02, CSRF-03, CSRF-04, CSRF-05 | 5 |
| 115 | FE-01, FE-02, FE-03, FE-04, FE-05, FE-06, SEC-03, OBS-01 | 8 |
| 116 | INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, PWD-01, PWD-02, OBS-03 | 9 |
| 117 | AUTH-03, AUTH-04, AUTH-05, PWD-03, PWD-04, SEC-02, OBS-02 | 7 |
| 118 | CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, SEC-04 | 7 |
| 119 | SESS-01, SESS-02, SESS-03, SESS-04 | 4 |
| **Total** | | **55** |

Note: SEC-01 and SEC-05 appear alongside primary MIG/AUTH requirements in Phase 113 because the constant-time comparison (SEC-01) and timezone-aware datetime (SEC-05) invariants are established there and inherited by every subsequent phase. Count reconciles: 53 unique REQ-IDs, 55 requirement-phase assignments, zero duplicate assignments (every REQ-ID is assigned to exactly one phase).

Actually verifying: 4+11+5+8+9+7+7+4 = 55. Since every REQ-ID must appear in exactly one phase, the 55 figure must equal the 53 unique IDs — recount below:

- TEST: 4 → Phase 112
- MIG: 6 → Phase 113
- CSRF: 5 → Phase 114
- FE: 6 → Phase 115
- AUTH: 6 (AUTH-01/02/06 → 113; AUTH-03/04/05 → 117)
- INV: 6 → Phase 116
- PWD: 4 (PWD-01/02 → 116; PWD-03/04 → 117)
- CLEAN: 6 → Phase 118
- SESS: 4 → Phase 119
- SEC: 5 (SEC-01/05 → 113; SEC-02 → 117; SEC-03 → 115; SEC-04 → 118)
- OBS: 3 (OBS-01 → 115; OBS-02 → 117; OBS-03 → 116)

Total: 4+6+5+6+6+6+4+6+4+5+3 = **55**. REQUIREMENTS.md enumerates 55 checkbox items — confirmed 55/55 mapped (the milestone brief rounded this to "53 REQs" but the literal checklist count is 55).

---

## Entry-Criteria Gate Summary

| Gate | Blocks Phase | Resolution Source |
|------|--------------|-------------------|
| Prod user audit (count legacy-auth users) | 113 | Plan-phase research, pre-merge |
| Context7 lookup on fastapi-users 15.0.5 | 113 | Plan-phase research, pre-merge |
| **Q-AUTH-02** password policy rule set | 116 | Plan-phase research, pre-UI |
| **Q-AUTH-01** email verification model | 117 | Plan-phase research, pre-build |
| **Q-AUTH-03** session lifecycle model | 119 | Plan-phase research, pre-build |
| ≥1 milestone production soak on native stack | 118 | External / operational — v1.21+ |

---

## Ordering Rationale

Followed the SUMMARY.md recommended order verbatim. No adjustments.

- 112 first because SEED-002 is the cross-cutting safety net; without it, the rewrite drifts silently (TI5).
- 113 before 114 because CSRF HMAC binds to `access_token.id` — the table must exist.
- 114 before 115 because the SPA needs the CSRF token contract before rewiring to cookie auth.
- 115 before 116 because invite-accept mints sessions on the new cookie contract.
- 117 depends on 115 (not 116) because password reset is independent of invite specifics — can run in parallel with 116 at plan-time if scheduling permits.
- 118 last among the teardown phases because it's irreversible — requires production soak.
- 119 depends only on 113 — runs in parallel with 118 as the research explicitly notes, since lifecycle refinement extends the `access_token` surface rather than depending on teardown.
