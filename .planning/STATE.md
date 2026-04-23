---
gsd_state_version: 1.0
milestone: between-milestones
milestone_name: v1.20-archived-awaiting-v1.21-scoping
status: Between milestones
stopped_at: ""
last_updated: "2026-04-23T22:00:00.000Z"
last_activity: 2026-04-23
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** Between milestones — v1.18/v1.19/v1.20 archived; v1.21 scoping pending via `/gsd-new-milestone`.

## Current Position

Phase: —
Plan: —
Status: Between milestones
Last activity: 2026-04-23 — Archived v1.18 (shipped), v1.19 (abandoned/pivoted), v1.20 (shipped out-of-flow: native auth via PR #32 + SEED-002 partial). ROADMAP.md and REQUIREMENTS.md deleted; fresh ones will be created by `/gsd-new-milestone`.

## Deferred Items

Items acknowledged and deferred during v1.20 milestone close on 2026-04-23:

| Category | Item | Status |
|----------|------|--------|
| phase | 114 CSRF middleware | deferred — scoped in v1.20 ROADMAP but not shipped |
| phase | 118 ZITADEL tear-out | blocked-by-soak — eligible after ≥1 milestone production soak on native stack |
| phase | 119 Session lifecycle + admin controls | deferred — Q-AUTH-03 unresolved |
| plan | 112-02 CI push+nightly workflows | deferred — SEED-002 remainder |
| plan | 112-05 seed002-gate-check.sh | deferred — SEED-002 remainder |
| plan | 112-06 self-coverage smokes | deferred — SEED-002 remainder |
| design-question | Q-AUTH-01 email verification model | deferred — invite-token-as-proof currently; explicit ceremony TBD |
| design-question | Q-AUTH-02 password policy rule set | deferred — shipped with permissive default |
| design-question | Q-AUTH-03 session lifecycle | deferred — shipped with fastapi-users default 7d sliding |
| ops | Campaign creation 500 in production | open — was ZITADEL-related; verify post-v1.20 native-auth |
| ops | HSTS header | open — Cloudflare edge config, outside code scope |

## Accumulated Context

### Decisions (preserved from v1.18/v1.19/v1.20 for continuity)

- v1.18: Test Baseline Trustworthiness (TEST-04) is its own first phase (106) so subsequent phases can trust pytest/vitest/Playwright signal before adding new tests.
- v1.18: TEST-01/02/03 are coverage obligations on every code-changing phase, not a separate end phase. Pattern continues into later milestones.
- [Phase 110]: Unified `submitDoorKnock` and `ConnectivityPill` on `navigator.onLine` so the UI and offline queue can no longer disagree about online state.
- [Phase 111-01]: urlTemplate deep-link spike FAILED on ZITADEL v4.10.1 — v2 TypeScript login app honoring `urlTemplate` is a separate undeployed Next.js app. API surface works; failure strictly at post-password-set redirect. Forced v1.19 replan.
- [v1.19 → v1.20 pivot 2026-04-23]: Chose DIY auth (fastapi-users 15.0.5 + CookieTransport + DatabaseStrategy, Postgres-backed) over Option C non-ROPC after sizing analysis showed equivalent engineering effort with surface ownership as the tie-breaker. Pivot tactical in motivation; cookie-based SPA auth leans permanent. Full decision record: `.planning/notes/decision-drop-zitadel-diy-auth.md`. Tripwires: `.planning/seeds/SEED-003-revisit-zitadel-when-sso-needed.md`.
- v1.20 shipped out-of-flow: the 8-phase roadmap (112-119) scoped upfront was not executed sequentially through the GSD phase/plan flow; core auth rewrite landed as a single merged PR branch (PR #32) to speed delivery. Phase 112 SEED-002 partially delivered; 114/118/119 + SEED-002 remainder carried as tech debt.
- v1.20: User model kept `SQLAlchemyBaseUserTable[str]` with String(255) PK so existing ZITADEL `sub` claim values remain valid identifiers — avoided a data migration.
- v1.20: Auth hardening — NULL hashed_password must be rejected in `authenticate()` AND `forgot_password` must seed a placeholder hash for NULL-hash users, otherwise the enumeration-neutral 202 response leaks signal via timing/downstream behavior.

## Pending Todos

- Scope v1.21 via `/gsd-new-milestone` — top candidates: complete native-auth hardening (CSRF, session lifecycle, Q-AUTH-01/02/03 resolution), finish SEED-002, ZITADEL tear-out (after ≥1 milestone production soak confirmed clean)
- Run prod user audit before ZITADEL tear-out merges (count legacy-auth users needing forced reset)

## Blockers/Concerns

- **Campaign creation 500 in production** — was ZITADEL-related; should be verified post-v1.20 native-auth cutover but pre-tear-out. Not blocking.
- **HSTS header** — requires Cloudflare edge configuration outside this code scope.

## Session Continuity

Last session: 2026-04-23
Stopped at: v1.18/v1.19/v1.20 archived — ready for `/gsd-new-milestone` to scope v1.21
Resume file: None
