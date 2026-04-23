# v1.20 Native Auth Rebuild & Invite Onboarding — Research Summary

**Milestone:** v1.20 Native Auth Rebuild & Invite Onboarding
**Date:** 2026-04-23
**Inputs:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, questions.md
**Decision record:** [`.planning/notes/decision-drop-zitadel-diy-auth.md`](../notes/decision-drop-zitadel-diy-auth.md)

---

## Executive Summary

- **v1.19 closed 2026-04-23 as research+pivot.** Phase 111 urlTemplate spike FAILed on ZITADEL v4.10.1 bundling (the v2 TypeScript login app ships as a separate Next.js deployment, not bundled with the server binary). Sizing analysis found DIY auth ≈ Option C non-ROPC (~2–3 weeks each). At cost parity, surface ownership wins.
- **Chosen stack:** `fastapi-users[sqlalchemy]>=15.0.5,<16` with `CookieTransport` + `DatabaseStrategy` (Postgres-backed `access_token` table — no Redis). The dep pulls `pwdlib[argon2,bcrypt]==0.3.0` and `fastapi-users-db-sqlalchemy>=7.0.0` transitively — do NOT add passlib/argon2-cffi/pyjwt explicitly. CSRF is our own ~40 LOC pure-ASGI middleware (double-submit cookie + `X-CSRF-Token`). Optional `zxcvbn>=4.5.0` / `@zxcvbn-ts/core ^3.0.4` pending Q-AUTH-02. SEED-002 toolchain: `pre-commit>=4.6.0`, `husky ^9.1.7`, `lint-staged ^16.4.0`, `prettier ^3.8.3`. REMOVE `authlib` (backend) and `oidc-client-ts` (frontend).
- **Load-bearing ordering constraint — SEED-002 ships FIRST.** Surfaced independently in FEATURES (MVP priority #1), ARCHITECTURE (Phase 112 blocks all subsequent phases), and PITFALLS (TI5 severity 4: "shipping SEED-002 after the rewrite replays Phase 106's 219-failure drift at larger scale"). The roadmap must gate all auth-rewire phases on "SEED-002 green" as an explicit checkbox.
- **Three deferred design questions** (DO NOT pre-answer in requirements):
  - Q-AUTH-01 email verification model → gates Phase 117
  - Q-AUTH-02 password policy rule set → gates Phase 116 UI
  - Q-AUTH-03 session lifecycle → gates Phase 119
- **51 pitfalls catalogued**, 6 at severity 5. Each S5 requires a named integration test landed in or before its introducing phase.

---

## Convergent Findings (cross-file agreement)

1. **SEED-002-first ordering** — FEATURES + ARCHITECTURE + PITFALLS independently arrive at "continuous verification before cross-cutting auth rewrite." No dissent.
2. **User-table migration is multi-step.** ARCHITECTURE Q2 prefers path (c) *full reset* contingent on prod user audit returning count ≈ 0; PITFALLS M1/M4/R1 independently demand multi-revision Alembic split: (1) add nullable → (2) backfill idempotent → (3) add NOT NULL + indexes → (4) drop ZITADEL columns. INV5 requires pre-migration inventory of ZITADEL-shadow rows so password-reset emails can be queued correctly.
3. **CSRF roll-our-own (~40 LOC) is the honest path.** STACK §3 rejects all three libraries (starlette-csrf stale 2023; fastapi-csrf-protect couples to JWT-signed state — wrong shape; asgi-csrf single-token-per-session). ARCHITECTURE Q3 places it as pure ASGI middleware after Structlog, before routes, with `hmac(server_secret, access_token_id)` binding (C3 mitigation).
4. **Session-rotation on login is non-negotiable.** FEATURES TS-A2/A3 + PITFALLS C1 (S5) + C3 + F1 (S4: `on_after_login` must be async or rotation silently skips). Integration test: two back-to-back logins must produce different `access_token` IDs; old row is deleted.
5. **Invite-accept is GET-idempotent + POST-committing on a single route.** ARCHITECTURE Q5 specifies `/invites/{token}/setup` as one URL; `auth_backend.login(strategy, user)` mints session in the same response as invite-accept (no second round-trip). PITFALLS INV1 (GET never marks accepted; Mailgun click-tracking OFF; `X-Robots-Tag: noindex`) + INV3 (`SELECT FOR UPDATE` + `(campaign_id, user_id)` unique constraint + `asyncio.gather` race test).
6. **Procrastinate `communications` queue for auth emails.** ARCHITECTURE Q6 places a new `app/tasks/auth_tasks.py` on the existing `communications` queue, mirroring v1.16's invite pipeline commit/durability seam. PITFALLS X6 preserves v1.19 O2/O3/O7 invariants (idempotent-by-key, monotonic webhook state, `normalize_external_id`).

## Divergent Findings / Trade-offs

Minimal — agents shared strong context.

**Only notable trade-off:** Q-AUTH-02 (password policy) framing.
- STACK treats it as "add zxcvbn conditionally."
- ARCHITECTURE treats it as blocking Phase 113 UI work.
- FEATURES leaves it entirely deferred.

**Reconciliation:** Q-AUTH-02 must be resolved before **Phase 116** (password-set UI), not Phase 113 (scaffolding-only). This is captured in the build order below.

---

## Recommended Build Order

| Phase | Name | Gates | Pitfalls Addressed |
|---|---|---|---|
| **112** | SEED-002 Continuous Verification | prerequisite; blocks all subsequent | TI5, CV1–CV5 |
| **113** | User Table Migration + fastapi-users scaffolding | prod user audit; Context7 lookup on fastapi-users 15.0.5 | M1, M2, M3, M4, M5, M6, INV5, R1, F2, F3 |
| **114** | CSRF middleware | — | C2, C3, C4, C5, C6, C7 |
| **115** | Frontend auth rewire + cutover (flag-flip `AUTH_BACKEND=native`) | — | FE1 (S5), FE2, FE3, FE4, FE5, FE6 |
| **116** | Invite flow re-implementation | **Q-AUTH-02 resolved** | INV1, INV2 (S5), INV3, INV4, INV6, F5 |
| **117** | Password reset + email verify | **Q-AUTH-01 resolved** | T1, T2, T3, T4, T6, X6 |
| **118** | ZITADEL tear-out | Phase 115 soak complete (≥1 milestone in prod) | X2, X3, X5, R2 |
| **119** | Session lifecycle + admin controls | **Q-AUTH-03 resolved** | (continues C1/C3 hygiene) |

**Ordering rationale:**
- SEED-002 hard prereq (cross-cutting rewrite needs daily drift signal)
- User model before auth endpoints (fastapi-users couples to the ORM model)
- CSRF before frontend (SPA needs the token contract before rewiring)
- Frontend cutover before invite flow (invite flow mints session on the new cookie contract)
- Tear-out last (irreversible — requires soak period)
- Session lifecycle last (ship conservative default in 113, refine here after real usage data)

---

## Gated Decisions (flag for plan-phase)

| Question | Decision | Gates Phase | Plan-phase research needed |
|---|---|---|---|
| **Q-AUTH-01** | Email verification model: invite-token-as-proof vs explicit ceremony | 117 | Threat-model review; compliance posture check |
| **Q-AUTH-02** | Password policy: zxcvbn strength / traditional rules / NIST 800-63B length + HIBP | 116 | UX review with low-tech volunteer audience in mind |
| **Q-AUTH-03** | Session lifecycle: idle timeout / absolute timeout / refresh behavior / logout-all | 119 | Field-ops context — volunteers mid-shift vs admin surfaces |

**Also Phase 113 plan-time:**
- Prod user audit (before migration merges) — verifies path-(c) full-reset is safe
- Context7 lookup on fastapi-users 15.0.5 — exact router prefixes (`/auth/cookie/login` vs `/auth/login`), DatabaseStrategy session-sharing semantics, UUID-vs-string ID, `on_after_*` hook signatures

---

## Critical Non-Decisions (NOT v1.20 scope)

- **SSO / SAML / per-org federation** — SEED-003 return tripwires
- **MFA / TOTP / passkeys (WebAuthn)** — SEED-003 tripwire; FEATURES anti-features flags FORCED MFA specifically
- **Self-serve public registration** — FEATURES explicit anti-feature; do NOT mount `/auth/register` publicly; invite-only by design
- **Magic-link login, email-change flow** — complexity outweighs v1.20 value
- **Active-sessions UI** — ship device-metadata *logging* in Phase 119; defer UI as a differentiator
- **Test-cleanup-as-strategy** — FEATURES anti-feature; SEED-002 is structural prevention, not curative
- **Redis session store** — decided out; Postgres indexed token lookup sufficient at our scale

---

## Stack Bill of Materials

### Backend

| Action | Package | Version | Notes |
|---|---|---|---|
| ADD | `fastapi-users[sqlalchemy]` | `>=15.0.5,<16` | Pulls pwdlib, fastapi-users-db-sqlalchemy, pyjwt, makefun, email-validator, python-multipart transitively |
| ADD (conditional Q-AUTH-02) | `zxcvbn` | `>=4.5.0,<5` | 2025-02-19 release; legacy `zxcvbn-python` is superseded |
| ADD (dev) | `pre-commit` | `>=4.6.0,<5` | SEED-002 toolchain |
| REMOVE | `authlib` | `>=1.6.9` | ZITADEL-only JWKS validation path |
| DO NOT ADD | `passlib`, `bcrypt`, `argon2-cffi`, `pyjwt` | — | Transitive via fastapi-users; explicit add creates version conflicts |
| DO NOT ADD | `pyhibp` | — | Stale since 2021; use direct `httpx` k-anonymity call if HIBP chosen |
| DO NOT ADD | `starlette-csrf`, `fastapi-csrf-protect`, `asgi-csrf` | — | All evaluated; stale, wrong shape, or feature-limited |

### Frontend

| Action | Package | Version | Notes |
|---|---|---|---|
| ADD (deps, conditional Q-AUTH-02) | `@zxcvbn-ts/core` + `language-common` + `language-en` | `^3.0.4` | Maintained fork; legacy `zxcvbn` npm unmaintained since 2017 |
| ADD (devDeps) | `husky` | `^9.1.7` | Pre-commit hook runner |
| ADD (devDeps) | `lint-staged` | `^16.4.0` | Staged-file runner |
| ADD (devDeps) | `prettier` | `^3.8.3` | Consistent formatting |
| REMOVE | `oidc-client-ts` | `^3.1.0` | Frontend OIDC client |

---

## Severity-5 Must-Mitigate Pitfalls

1. **C1 Session-fixation via non-rotated session ID on login** (Phase 113) — `on_after_login` destroys the pre-existing access-token row and issues a fresh opaque token; integration test asserts token ID changes across two back-to-back POSTs.
2. **M1 Dropping ZITADEL columns before reading FK references** (Phase 113) — multi-migration split; audit views and RLS policies via `rg '\bzitadel\b' alembic/` before any drop; drop only in the final migration.
3. **M4 Failed-mid-migration mixed schema state** (Phase 113) — split into multiple Alembic revisions with one transactional concern each; idempotent re-runnable; staging test kills Postgres mid-backfill and verifies recovery.
4. **FE1 `credentials:'include'` missed on a fetch call site** (Phase 115) — grep audit `rg '\bfetch\(' web/src/` + `rg 'new EventSource|new WebSocket'`; Playwright test verifies cookie is sent from every unique API base.
5. **INV2 Email-mismatch between invite target and accepting account** (Phase 116) — accept-handler compares `invite.email` vs `request.user.email`; on mismatch render a three-action page (logout & accept as X, contact inviter, cancel); never silently bind.
6. **R1 User-table migration has no tested `downgrade()`** (Phase 113) — every schema-DDL migration has a tested downgrade; data-destructive steps only in the final migration (rollback stops at schema-add, data intact); CI runs `alembic upgrade head && downgrade -1 && upgrade head` against a test DB.

---

## Confidence

| Area | Confidence | Basis |
|---|---|---|
| Stack | HIGH | PyPI + npm verified 2026-04-23; transitive deps validated |
| Features | MEDIUM-HIGH | 2026 multi-source consensus (Slack, Google Workspace, Linear, Notion, Vercel, Auth0, WorkOS, Postmark, Clerk); thresholds tuneable |
| Architecture | HIGH | Verified against existing code; preserves v1.5 RLS discipline + v1.16 Procrastinate commit seam |
| Pitfalls | HIGH | 51 items each with severity, phase, actionable prevention |

**Overall:** MEDIUM-HIGH. Honest gaps — the prod user audit, the Context7 lookup at Phase 113 plan-time, and the three Q-AUTH-* resolutions. Everything else is decision-ready.

---

## Outstanding Gaps to Address in Plan-Phases

- **Phase 113 (pre-merge):** Prod user audit (count real users on the legacy auth path); Context7 lookup on fastapi-users 15.0.5 for exact router prefixes, DatabaseStrategy session-sharing semantics, and `on_after_*` hook signatures
- **Phase 116 (pre-UI):** Resolve **Q-AUTH-02** (password policy rule set)
- **Phase 117 (pre-build):** Resolve **Q-AUTH-01** (email verification model) against threat model
- **Phase 118 (pre-cleanup):** `rg '\bzitadel\b'` audit — zero references outside `.planning/` archives
- **Phase 119:** Resolve **Q-AUTH-03** (session lifecycle) with field-ops usage data from Phases 115–118 soak
- **Cross-cutting:** Verify the AST-based rate-limit-guard test sees `fastapi_users.get_auth_router(...)` routes correctly
