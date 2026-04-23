# Feature Landscape — v1.20 Native Auth Rebuild & Invite Onboarding

**Domain:** DIY cookie-session auth + invite onboarding for a multi-tenant field-ops SaaS; plus continuous test verification infrastructure (SEED-002).
**Researched:** 2026-04-23
**Scope:** Auth surfaces that ZITADEL used to provide (login/logout/password reset/email verification/session mgmt), the invite-under-native-auth UX, auth endpoint protection, and the SEED-002 continuous-test deliverables. Existing invite-creation, signup-link intake, and the `/invites/<token>` landing page are PRESERVED — only the credential-setting surface is new.
**Overall confidence:** MEDIUM-HIGH. Auth-UX patterns are well-documented 2026 industry consensus; fastapi-users specific behaviors verified against library + discussion board. Three design knobs (verification model, password policy, session lifecycle) are deliberately left open for plan-phase resolution per Q-AUTH-01/02/03.

---

## Context Recap — What We Already Have

**Existing surfaces v1.20 preserves:**
- `/invites/<token>` public landing page (same-origin, campaign/role context rendered, email-match enforcement, expired/not-found/accepted states)
- Invite token model: DB-owned, 7-day expiry (`INVITE_EXPIRY_DAYS`), one-time-use via `accepted_at`, email-match required
- Mailgun delivery via `invite_email.py` + Procrastinate `invite_tasks.py`
- Volunteer signup links (v1.17) — separate public intake path with admin review queue
- Admin pending-invite table with delivery status (v1.16 AUD-04)
- Role binding at invite-accept time (`campaign_members` row written at accept)
- Rate limiting on all public endpoints (v1.5, per-user JWT or CF-Connecting-IP)
- Email tenant context (`EmailTenantContext`) with org/campaign/inviter metadata

**Existing v1.19 research artifact to lean on:** The invite-UX observations in `.planning/research/v1.19/FEATURES.md` are ZITADEL-framed but ~80% transfer directly — accessible password patterns, subject-line patterns, expired-link recovery, re-invite UX, anti-features. Not re-deriving those here.

**What's NEW in v1.20 relative to v1.19's framing:**
- We own the password-set surface entirely (no hosted IdP UI question).
- We own email verification entirely (Q-AUTH-01).
- We own password policy entirely (Q-AUTH-02).
- We own session lifecycle entirely (Q-AUTH-03).
- A `/login` page becomes a first-class app surface, not a redirect shim.
- Logout, password reset, password change, and session management all become features we ship.

---

## Table Stakes

Features without which the v1.20 auth surface is incomplete, unsafe, or visibly worse than what users expect from any 2026 SaaS.

### A. Login / Logout / Core Session

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-A1 | **Email + password login page** (`/login`) with error surfacing, "enter" submits, loading state | Core. Current `/login` is a 4-line redirect shim — needs to become a real page. | Low | fastapi-users login route; shadcn/ui form stack already in project |
| TS-A2 | **Cookie session set on successful login** (`httponly`, `samesite=lax`, `secure` in prod) | OWASP baseline for SPA cookie auth; required by `CookieTransport` | Low (library default) | `CookieTransport` + `DatabaseStrategy` |
| TS-A3 | **Logout endpoint that destroys server-side session row** (not just clears cookie) | Eager revocation is the whole point of choosing `DatabaseStrategy` over JWT-in-cookie. Clearing cookie alone leaves an active token in DB — security-meaningful. | Low | access_token table |
| TS-A4 | **Logout button reachable from every authed page** | OWASP session mgmt guidance — "visible and easily accessible from every resource." Already present in our sidebar; just needs rewire to native logout. | Trivial | existing layout |
| TS-A5 | **"Remember me" toggle affecting cookie Max-Age** (or deliberate omission, e.g. always session-length) | User expectation in 2026 SaaS. If omitted, document the session lifecycle in login-page copy so volunteers aren't surprised by re-auth frequency. | Low | Q-AUTH-03 decision |
| TS-A6 | **Redirect-after-login preservation** — bounced unauth users land back where they started after login | Existing `POST_LOGIN_REDIRECT_KEY` sessionStorage pattern. Critical for the invite flow specifically (`?redirect=/invites/<token>`). | Low | existing pattern |
| TS-A7 | **Login failure messages that don't leak account existence** | "Invalid email or password" — not "user not found" or "wrong password." Standard since ~2015; inexcusable to miss in 2026. | Trivial | route copy |

### B. Password Reset

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-B1 | **"Forgot password?" link on the login page** | Universally expected. Missing = support tickets and account lockout. | Trivial | — |
| TS-B2 | **Request-reset endpoint returns 202 regardless of whether email exists** | Prevents account-existence enumeration. fastapi-users built-in behavior. | None (library default) | fastapi-users |
| TS-B3 | **Reset email with short-lived token link** — industry default is 15–60 min, NIST-aligned guidance says ≤1 hour | Well-established 2026 industry baseline (Postmark, SuperTokens, OWASP Forgot Password cheat sheet). | Low | fastapi-users; Mailgun |
| TS-B4 | **One-time-use token** — once consumed, subsequent attempts rejected | Standard. fastapi-users handles via hashed token + invalidation hook. | None (library default) | fastapi-users |
| TS-B5 | **Rate-limit on resend** (per-email + per-IP) | Prevents mailbox flooding and enumeration-by-timing. OWASP baseline. | Low | existing rate-limiter, new keyed rule |
| TS-B6 | **Reset email that looks like a real password-reset** — subject "Reset your CivicPulse Run password," plaintext fallback, clear expiry notice, single CTA, no marketing | 2026 email content consensus (Postmark guide). | Low | existing email template infra (v1.16) |
| TS-B7 | **Reset-complete side effect: invalidate all other active sessions for that user** | OWASP + WorkOS + Auth0 consensus. Password change = session compromise assumption. | Low-Med | `access_token` bulk delete in the `on_after_reset_password` fastapi-users hook |
| TS-B8 | **Reset-complete side effect: auto-login the user** (or explicit "you can now sign in" screen — pick one) | Both are valid; don't leave the user on a dead confirmation page with no next action. | Low | route wiring |

### C. Email Verification

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-C1 | **`is_verified` flag on User model that gates access to sensitive actions** (or to login outright — policy TBD in Q-AUTH-01) | fastapi-users ships this; the decision is what to *enforce* based on it | Low | fastapi-users base model |
| TS-C2 | **Verify-by-email ceremony IF explicit ceremony chosen over token-as-proof** (Q-AUTH-01 gate) | If the answer is "token-as-proof suffices for invites," then this is only needed for future self-serve signup (currently out of scope). If the answer is "always verify," this ships in v1.20. | Med | Q-AUTH-01 |
| TS-C3 | **Resend verification email** (rate-limited, returns 202 blindly) | If ceremony chosen. fastapi-users built-in. | Low | fastapi-users |
| TS-C4 | **Verify-while-authed edge case: show "already verified" gracefully** | If a user clicks an old verification link after the flag was already set by a later invite-accept. No surprise modal, no 500. | Low | route copy |

### D. Session Management UX

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-D1 | **"Log out everywhere" button in account settings** | Enterprise-grade 2026 SaaS baseline (Slack, Google Workspace). Volunteers lose phones; admins leave campaigns. | Low-Med | `access_token` bulk delete keyed by user_id (excluding current) |
| TS-D2 | **Password change triggers logout-all-other-sessions automatically** | OWASP + Auth0 consensus. User changes password → all other sessions die, current one keeps going. | Low | `on_after_update_user`/`on_after_reset_password` fastapi-users hooks |
| TS-D3 | **Session expiry (absolute OR idle, per Q-AUTH-03)** | Required — unlimited sessions are the anti-pattern. Exact model is the open question. | Low (once answered) | Q-AUTH-03 |
| TS-D4 | **Graceful 401-on-expired — frontend redirects to `/login?redirect=<current>` instead of erroring** | TanStack Query interceptor pattern. We already have `client.ts`; extend its 401 handling. | Low | `web/src/api/client.ts` |

### E. Password Policy (gated by Q-AUTH-02)

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-E1 | **Live-validation on the password-set form** (rules display + green-checks as met) | 2026 accessibility + UX standard. Users discover rules as they type, not as post-submit errors. WCAG-AA pattern from v1.19 research applies. | Low-Med | shadcn/ui + RHF + Zod |
| TS-E2 | **Backend `validate_password` hook that matches frontend rules exactly** | fastapi-users provides the hook. Mismatched rules = "it said it was OK but the server rejected it" bug class. | Low | fastapi-users |
| TS-E3 | **Single password field + show-password toggle** (NO confirm-password) | 2026 WAI / Atomic A11y guidance. v1.19 research established this as a hard preference. | Low | — |

### F. Invite-Under-Native-Auth (the v1.19 goal, rewired)

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-F1 | **Invite-token URL → `/invites/<token>/setup` password-set page (for new users) or `/invites/<token>` accept page (for existing users)** | The two-branch pattern is how Linear, Notion, Vercel, Slack all do it: same URL shape, backend decides which surface to render based on whether an account exists. | Med | user lookup by email at render time |
| TS-F2 | **Single-click accept for returning users** — sign in (if needed) → one button → in the campaign | Same UX we had planned for v1.19 Option B/C; now cleaner because no external redirect hop | Low | existing `/invites/<token>` page + auth interceptor |
| TS-F3 | **Set-password + accept-invite in one atomic-feeling UX** — user sets password, user is logged in, invite is accepted, user lands on campaign. No "OK now click this other button." | Critical for activation. First-time volunteer attention span is ~90 seconds. | Med | route orchestration: create_user → set_password → login → accept_invite in sequence |
| TS-F4 | **Token-as-proof of email ownership** (if Q-AUTH-01 resolves that way) — `is_verified=true` at invite-accept without a separate verify ceremony | Preserves the v1.19 activation-quality goal. The invite token IS the email-possession proof. | Low | custom `on_after_register` or invite-accept hook |
| TS-F5 | **Idempotent re-invite to a second campaign for existing users** — skips setup entirely | v1.19 Table Stakes #3, preserved verbatim. Look up user by email; if exists, skip the setup branch. | Low | existing invite-service + user lookup |
| TS-F6 | **First-time vs returning email content differs** — "Set up your CivicPulse account" vs "Sara invited you to Mayor Smith for City Council" | Two template variants keyed off user-exists signal at enqueue time. v1.19 Table Stakes #14. | Low | existing Mailgun templating |
| TS-F7 | **Expired-link recovery: "request a fresh invite" button** | v1.19 Table Stakes #8, preserved. Same endpoint; notifies inviter. | Low-Med | new public endpoint |
| TS-F8 | **Post-set-password → auto-login → auto-accept-invite flow never strands the user** | If any step fails, land the user on a page that tells them what happened and what to do. Not a generic 500. | Med | error-state orchestration |

### G. Rate Limiting / Endpoint Protection

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-G1 | **Per-IP + per-email rate limit on `/auth/login`** — 2026 industry default: ~5 attempts / 15 min before soft-throttle or CAPTCHA | OWASP; every auth library guide recommends. | Low | existing rate-limiter (slowapi) |
| TS-G2 | **Per-IP rate limit on `/auth/forgot-password`, `/auth/request-verify-token`, `/auth/register`** (register is N/A currently but covered for future) | Prevent mailbox flooding + enumeration | Low | existing rate-limiter |
| TS-G3 | **Exponential backoff on repeated login failures per email** — 1s, 2s, 4s, 8s, up to a cap | Defense in depth beyond fixed-rate. Makes brute-force impractical without hard-locking accounts (which creates DoS risk). | Med | new middleware or slowapi custom-rule |
| TS-G4 | **Account lockout is SOFT** — temporary delay, not permanent lock | Hard lockout is itself a DoS vector (attacker flood-locks a real user). Temporary rate-based backoff is the 2026 consensus. | Low | tied to G3 |
| TS-G5 | **Generic failure messages on all auth endpoints** — "Invalid credentials," never "user not found" | Enumeration protection | None (fastapi-users default) | — |

### H. CSRF Protection (explicitly table stakes, not differentiator)

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-H1 | **Double-submit-cookie CSRF** — X-CSRF-Token header required on all state-changing requests | Decision already made in `decision-drop-zitadel-diy-auth.md`; ~40 LOC middleware. Non-negotiable for cookie-based SPA auth. | Low-Med | new middleware |
| TS-H2 | **CSRF token refreshed on login/logout** | Token bound to session, rotates on auth state change | Low | middleware wiring |

### I. Continuous Test Verification (SEED-002)

| # | Feature | Why expected | Complexity | Depends on |
|---|---------|--------------|------------|------------|
| TS-I1 | **Pre-commit hook runs `uv run ruff check --fix && uv run ruff format` on staged Python + `vitest related --run` on staged TS** | CLAUDE.md already mandates ruff; hook enforces it. Caught-before-push is the 2026 baseline. | Low | `.pre-commit-config.yaml` |
| TS-I2 | **Pre-commit hook runs `pytest --lf -x` on staged Python against already-up compose stack** | Last-failed fast mode. MUST fail fast with "run docker compose up -d first" if stack isn't up (hard constraint from SEED-002). | Low-Med | hook script, compose health check |
| TS-I3 | **CI on push to feature branches** (not only PRs) — lightweight unit suite at minimum | Current `pr.yml` only runs on PR trigger. Branches without PRs accumulate drift silently. | Low | `.github/workflows/push.yml` |
| TS-I4 | **Scheduled nightly full suite on main** (pytest + vitest + Playwright) via `schedule:` cron | The daily drift detector. Caught within 24h, not at milestone end. | Med | new workflow file, compose-up-in-CI pattern |
| TS-I5 | **Nightly regression alert: diff vs previous night; auto-open GH issue on net-new failures** | Turns the logging archaeology into actionable signal. SEED-002 item 5. | Med | workflow + `gh issue create` scripting |
| TS-I6 | **Env-drift healthcheck (`scripts/doctor.sh`)** — validates `.env` DB port matches compose, E2E users exist, API image deps match pyproject, web/.env.local synced | Phase 106 proved 488/565 silent failures were env drift. This is the single-highest-leverage SEED-002 deliverable. | Med | new script + compose port introspection |
| TS-I7 | **Healthcheck runs as first step of every CI workflow** | Fail fast on drift BEFORE burning 30min of test time. | Low | workflow wiring |
| TS-I8 | **`run-e2e.sh` regression alerter** — parses `web/e2e-runs.jsonl`, compares tail-20 vs tail-100, emits notification on deterioration | User-requested ("the highest-leverage single fix" per SEED-002). | Low-Med | new script, Slack/Discord webhook or GH issue |

---

## Differentiators

Nice to have. Each shortens activation or reduces support load but skipping any one does not make v1.20 feel incomplete.

### Auth surface

| # | Feature | Value | Complexity |
|---|---------|-------|------------|
| D-1 | **"Active sessions" UI showing device/browser/last-seen/IP for each active session with per-row revoke** | Field volunteers lose phones; admins want forensic visibility after a suspected breach. Matches Slack/Google Workspace. | Med (new UI + endpoint iterating `access_token` rows per user + device-metadata capture at login) |
| D-2 | **Device metadata captured at login** — UA, approximate location (from IP), last-seen timestamp, friendly device label ("Chrome on Mac") | Required to make D-1 useful. Alone it's logging, which is fine to ship. | Low |
| D-3 | **"New sign-in from unrecognized device" notification email** | Modern phishing/credential-stuffing defense; Google/GitHub-style. | Med (new device fingerprint state, new email template) |
| D-4 | **HIBP breached-password check on set-password / change-password** (client-side k-anonymity API) | NIST 800-63B aligned. Cheap if done client-side (no server round-trip, no privacy concerns). | Low |
| D-5 | **Password change (from settings, while authed) as a distinct flow from password reset** | Standard. Requires current password + new password. Less scary than a password-reset email for a user who just wants to rotate. | Low |
| D-6 | **"Sign in with a magic link" as an alternative to password on the login page** | Reduces password-reset support tickets. fastapi-users doesn't ship this; would need a custom flow. | High — defer beyond v1.20 |
| D-7 | **Email-change flow with verification on both old and new addresses** | Enterprise-grade; needed once we have org admins managing their own emails | Med — defer beyond v1.20 |
| D-8 | **Passkey (WebAuthn) enrollment** | 2026 modern default for new accounts. fastapi-users doesn't ship. | High — defer; flag for SEED-003 trigger alongside SSO |

### Invite UX

| # | Feature | Value | Complexity |
|---|---------|-------|------------|
| D-9 | **Inviter's first name + optional personal note rendered in the invite email** | v1.19 Differentiator #5; warm, converts better. | Low-Med |
| D-10 | **Pre-fill invitee's name on setup form from invite metadata** | v1.19 Differentiator #6; tiny, warm. | Low |
| D-11 | **"You're already a member of this campaign" branch on accept** | v1.19 Differentiator #8; prevents confusion on duplicate invites. | Low |
| D-12 | **Resend-invite button in admin pending-invites table** | v1.19 Differentiator #9; closes the loop for admins without re-creating invites manually. | Low-Med |
| D-13 | **Honest "check your spam folder" prompt on not-found state of `/invites/<token>`** | v1.19 Differentiator #10; tiny copy change, big empathy. | Trivial |
| D-14 | **Post-login dashboard lists other pending invites for the user's email** | v1.19 Differentiator #7; multi-campaign onboarding feels coherent. | Med — defer to later milestone |

### SEED-002 surface

| # | Feature | Value | Complexity |
|---|---------|-------|------------|
| D-15 | **Test health dashboard** — GH Pages or similar showing pass rate / flake rate / nightly trend from `e2e-runs.jsonl` and CI history | Actionable trend data vs archaeology. Makes test health a visible team metric. | Med |
| D-16 | **Per-spec quarantine mechanism** — `@pytest.mark.quarantine` and equivalent for vitest/Playwright; quarantined tests run in a separate non-blocking job | Known-flake ≠ real-failure; separates them so the main signal stays green and trustworthy. | Low-Med |
| D-17 | **Coverage floor enforcement in CI** — fail the build if coverage drops below a ratcheted baseline | Prevents per-phase erosion. TEST-01/02/03 obligations become enforceable. | Med |
| D-18 | **Slack/Discord integration for nightly regressions** | Pushes signal where the team actually looks. Email gets ignored. | Low — but requires Slack app, deferrable |

### Rate limiting / protection

| # | Feature | Value | Complexity |
|---|---------|-------|------------|
| D-19 | **Geo-velocity anomaly detection** — "sign-in from two continents 5 min apart" flag | Detects credential stuffing without false-positive storms | High — defer |
| D-20 | **Optional TOTP/passkey MFA opt-in in account settings** (never forced) | Security-conscious users can harden. v1.19 research explicitly anti-features FORCED MFA, not optional. | High — defer; flag SEED-003 trigger |

---

## Anti-Features (explicitly DO NOT build)

| Anti-feature | Why avoid | Do instead |
|--------------|-----------|------------|
| **Self-serve public registration at `/auth/register`** | CivicPulse is invite-only-by-design. A public register endpoint becomes an abuse magnet (fake accounts, spam pipelines). fastapi-users ships `/register` by default — we must explicitly NOT mount it, or gate it behind an invite-token check. | Keep registration invite-scoped only. Invite-accept flow calls `UserManager.create()` server-side. |
| **CAPTCHA on the invite-accept or password-set page** | Invite token is the gate. CAPTCHA is friction with no incremental security benefit and harms WCAG compliance. (v1.19 anti-feature, preserved.) | Existing rate limiting + per-token attempt counter if abuse appears. |
| **CAPTCHA on login** | Same reasoning. Rate limit + backoff is the 2026 consensus; CAPTCHA is an escalation only if automated attack patterns actually appear. | Ship G1-G4 first; add CAPTCHA only if attack data warrants it. |
| **Hard account lockout after N failed attempts** | Creates a DoS vector — attacker flood-locks a real user. | Soft lockout via exponential backoff (TS-G3/G4). |
| **Forced MFA at first login** | Tanks volunteer activation. (v1.19 anti-feature.) | Make MFA opt-in for users who want it; opt-in per-role for admins who want to require it. |
| **Required confirm-password field** | v1.19 research established: single field + show-password is 2026 best practice. | TS-E3. |
| **Email verification step ON TOP of invite flow (unless Q-AUTH-01 resolves that way)** | Redundant — invite token proves email ownership. (v1.19 anti-feature.) | Token-as-proof unless Q-AUTH-01 says otherwise. |
| **Conflating expired invite with forgotten password** | Two different states, two different recovery paths. (v1.19 anti-feature.) | Expired invite → "request new invite"; forgotten password → `/auth/forgot-password`. |
| **JWT in Authorization header for the SPA** | Decision already made: cookie sessions. The decision note calls this out explicitly. | Stick to `credentials: 'include'` + cookie. |
| **Redis as the session store** | Not in the stack; decision note rejected it explicitly. Postgres + indexed token column is fast enough at our scale. | Postgres-backed `access_token` table via `SQLAlchemyAccessTokenDatabase`. |
| **SSO/SAML/MFA scaffolding built "for the future"** | Tactical-pivot framing. Building for hypothetical future = dead code. SEED-003 tracks return conditions. | Defer cleanly. Do not build `OAuth2Provider` abstractions or SAML seams. |
| **Auto-login on email verification click** (if ceremony chosen) | Token possession is not password knowledge. Verification completes → show "Email verified, please sign in" screen. | Separate verify from authenticate. |
| **Password expiry / forced rotation policy** | NIST 800-63B explicitly deprecates forced rotation as of 2017+; it produces weaker passwords and support load. | Rotate only on compromise signal. |
| **"Security questions" as a reset alternative** | 1990s pattern; verifiably weaker than email reset. | Email reset only. |
| **Running dev services outside `docker compose`** (for tests, for CI, for anything) | Load-bearing project invariant. SEED-002 `Hard Constraints` section explicitly forbids this. Violation = accelerates drift while pretending to solve it. | Compose-up-first in every hook, every workflow, every script. |
| **Test cleanup phase as the v1.20 test-health strategy** | Phase 106 proved this is 10x the cost of continuous verification, and SEED-002 exists specifically to prevent it. Cleanup phase #2 = root cause never addressed. | SEED-002 continuous verification as a first-class milestone deliverable. |

---

## Feature Dependencies

```
fastapi-users core setup
  ├─ Login/logout (TS-A1..A7)
  ├─ Password reset (TS-B1..B8)
  ├─ Email verification (TS-C1..C4, gated by Q-AUTH-01)
  ├─ Session management (TS-D1..D4, shaped by Q-AUTH-03)
  └─ Password policy (TS-E1..E3, shaped by Q-AUTH-02)
    └─ User model Alembic migration (prereq for all auth)

CSRF middleware (TS-H1..H2) — independent, can be built in parallel

Invite rewire (TS-F1..F8)
  ├─ depends on: login/logout, password policy, email verification decision
  └─ preserves: existing /invites/<token>, existing invite service, Mailgun

Rate limiting (TS-G1..G5)
  └─ extends existing slowapi infrastructure — independent of auth lib

SEED-002 (TS-I1..I8)
  ├─ Independent of auth work — can ship before, during, or after
  └─ SEED-002 TS-I6 (doctor.sh healthcheck) SHOULD ship first so the auth
     rewrite gets the drift safety net from day one

Differentiators build on Table Stakes — none are prerequisites for each other
```

**Critical ordering signal for roadmap:** SEED-002 TS-I1 (pre-commit) + TS-I6 (doctor.sh healthcheck) + TS-I4 (nightly) should ship as a Phase before the cross-cutting auth rewrite starts, per SEED-002's own trigger note ("v1.18 Phase 106 discovered 219+ silent failures"). The auth rewrite touches ~every test surface; doing it without continuous verification repeats the v1.18 mistake.

---

## MVP Recommendation for v1.20

Prioritize, in order:

1. **SEED-002 foundation first** — TS-I1 (pre-commit), TS-I6 (doctor.sh), TS-I4 (nightly) + TS-I7 (healthcheck-in-CI). Ship before auth work starts.
2. **User model migration** — one-shot Alembic reshape to fastapi-users base mixin.
3. **Core auth endpoints via fastapi-users** — login, logout, password reset (TS-A, TS-B, TS-G1/G2/G5).
4. **CSRF middleware** (TS-H1/H2).
5. **Password policy** (TS-E) once Q-AUTH-02 is resolved in plan-phase.
6. **Session lifecycle + logout-all** (TS-D) once Q-AUTH-03 is resolved.
7. **Email verification model** (TS-C) once Q-AUTH-01 is resolved.
8. **Invite rewire** (TS-F) — the v1.19 goal, now on native auth.
9. **Frontend rewire** — drop `oidc-client-ts`, switch `client.ts` to cookies, 401-handler, login/logout UI polish.
10. **Rate-limit hardening** (TS-G3/G4) — exponential backoff on login.
11. **Test harness rewire** — `scripts/seed.py`, `create-e2e-users.py`, Playwright auth helpers.

Defer to later milestones:

- Active-sessions UI (D-1..D-3) — ship device metadata logging (D-2) in v1.20 so we have data when we build the UI.
- HIBP check (D-4) — cheap enough to pull in if Q-AUTH-02 lands on "length-only + HIBP"; otherwise defer.
- Password-change-while-authed (D-5) — likely in v1.20 because it's trivial once the other pieces exist; demote to differentiator only because it's not strictly needed for ZITADEL parity.
- Passkeys / MFA / SSO — defer; tripwires in SEED-003.
- Test health dashboard (D-15) — after SEED-002 Table Stakes prove out; first nightly alerts are higher leverage.

---

## Quality Gate Self-Check

- **Categories clear:** TS / D / AF split enforced per section. ✓
- **Grounded in real products:** References Slack / Google Workspace / Linear / Notion / Vercel / Auth0 / WorkOS / Postmark / Clerk patterns — not theoretical. ✓
- **Complexity noted:** Low / Low-Med / Med / High on every row. ✓
- **Dependencies on existing features identified:** Existing invite model, Mailgun, rate limiter, `/invites/<token>` page, `client.ts`, compose stack all mapped. ✓
- **Does NOT pre-answer Q-AUTH-01/02/03:** Email verification model (C2/F4 gated), password policy (E1/E2 gated), session lifecycle (D3/A5 gated) all deferred to plan-phase. ✓

---

## Sources

- [WorkOS — How to revoke sessions and sign users out everywhere](https://workos.com/blog/workos-sessions-api-session-revocation-sign-out-everywhere) — active-sessions UI, force-logout-on-password-change consensus (HIGH)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — cookie attributes, logout visibility, session binding (HIGH)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — reset token best practices (HIGH)
- [Auth0 — Application Session Management Best Practices](https://auth0.com/blog/application-session-management-best-practices/) — logout-on-password-change pattern (HIGH)
- [Postmark — Password reset email best practices](https://postmarkapp.com/guides/password-reset-email-best-practices) — email content and expiry patterns (HIGH)
- [Postmark — User invitation email best practices](https://postmarkapp.com/guides/user-invitation-email-best-practices) — invite subject/body patterns (HIGH)
- [Visakh Vijayan — Secure password reset tokens and expiry](https://vjnvisakh.medium.com/secure-password-reset-tokens-expiry-and-system-design-best-practices-337c6161af5a) — 15-60 min token window industry default (MEDIUM)
- [SuperTokens — Forgot Password flow implementation guide](https://supertokens.com/blog/implementing-a-forgot-password-flow) — one-time-use + rate limit (HIGH)
- [fastapi-users Email Verification Routes (DeepWiki)](https://deepwiki.com/fastapi-users/fastapi-users/6.3-email-verification-routes) — 202-always response for enum protection (HIGH)
- [fastapi-users Flow documentation](https://fastapi-users.github.io/fastapi-users/latest/usage/flow/) — library default behaviors (HIGH)
- [WorkOS — Top authentication solutions for FastAPI (2026)](https://workos.com/blog/top-authentication-solutions-fastapi-2026) — fastapi-users positioning (MEDIUM)
- [vibeship — Missing rate limiting and brute-force defense](https://vibeship.co/kb/security/vulnerabilities/missing-rate-limiting) — 5/15min login baseline, exp backoff (MEDIUM)
- [Laranepal — Exponential backoff login rate limiting](https://laranepal.com/blog/rate-limiting-with-exponential-backoff-in-laravel) — 1/2/4/8s pattern (MEDIUM)
- [Firefly — Continuous drift detection in CI/CD with GitHub Actions](https://www.firefly.ai/academy/implementing-continuous-drift-detection-in-ci-cd-pipelines-with-github-actions-workflow) — scheduled CI patterns (MEDIUM)
- [OneUptime — Session management implementation](https://oneuptime.com/blog/post/2026-01-30-session-management/view) — session lifecycle patterns (MEDIUM)
- [v1.19 FEATURES.md — invite UX research](.planning/research/v1.19/FEATURES.md) — preserved invite patterns (HIGH, internal)
- [SEED-002](.planning/seeds/SEED-002-test-hygiene-continuous-verification.md) — continuous verification scope and hard constraints (HIGH, internal)
- [decision-drop-zitadel-diy-auth.md](.planning/notes/decision-drop-zitadel-diy-auth.md) — library/session-model decisions already made (HIGH, internal)
- [questions.md](.planning/research/questions.md) — Q-AUTH-01/02/03 open design questions (HIGH, internal)

**Confidence summary:**
- HIGH on core auth UX patterns (login, logout, reset, session management) — multi-source 2026 consensus.
- HIGH on anti-features — clear industry/regulatory guidance (NIST on rotation/composition, OWASP on CAPTCHA/MFA-forcing).
- HIGH on SEED-002 scope — internal document, concrete from Phase 106 evidence.
- MEDIUM on exact rate-limit thresholds (5/15min, 1/2/4/8s backoff) — convention not standard; tuneable in plan-phase.
- LOW (by design) on Q-AUTH-01/02/03 specifics — deliberately deferred; surfaced as decision surfaces without pre-answering.
