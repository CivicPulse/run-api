---
gsd_state_version: 1.0
milestone: v1.20
milestone_name: native-auth-rebuild-and-invite-onboarding
status: Roadmap defined
stopped_at: ""
last_updated: "2026-04-23T20:00:00.000Z"
last_activity: 2026-04-23
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** Milestone v1.20 — roadmap complete, ready for Phase 112 planning

## Current Position

Phase: Not started (roadmap defined, Phase 112 is next)
Plan: —
Status: Roadmap defined
Last activity: 2026-04-23 — Roadmap finalized with 8 phases (112-119); 55/55 requirements mapped

## Roadmap Summary

8 phases (112-119), continuing from v1.19's Phase 111 (preserved as the `urlTemplate` spike-FAIL artifact).

| Phase | Name | Gates | Depends On |
|-------|------|-------|------------|
| 112 | SEED-002 Continuous Verification | — (prerequisite) | nothing |
| 113 | User Table Migration + fastapi-users Scaffolding | Prod user audit; Context7 fastapi-users 15.0.5 lookup | 112 |
| 114 | CSRF Middleware | — | 113 |
| 115 | Frontend Auth Rewire + Cutover | — | 114 |
| 116 | Invite Flow Re-Implementation | **Q-AUTH-02** (password policy) | 115 |
| 117 | Password Reset + Email Verify | **Q-AUTH-01** (email verification model) | 115 |
| 118 | ZITADEL Tear-Out | **≥1 milestone production soak** on native stack | 115, 116, 117 + external soak gate |
| 119 | Session Lifecycle + Admin Controls | **Q-AUTH-03** (session lifecycle) | 113 (runs parallel with 118) |

**Coverage:** 55/55 v1.20 requirements mapped. No orphans, no duplicates.

**Load-bearing invariants:**
- Phase 112 ships FIRST — cross-cutting rewrite needs the continuous-verification safety net before it touches every test surface.
- Three Q-AUTH-* decisions are deliberately unresolved at milestone-scoping time; each gates a specific later phase.
- Phase 118 ZITADEL tear-out is gated on ≥1 milestone of production soak on the native-auth stack — external gate, cannot begin until v1.21+.

Full roadmap: `.planning/ROADMAP.md`

## Accumulated Context

### Decisions

- v1.18: Milestone driven by real volunteer feedback from door-knocking sessions — 7 reported canvassing bugs + 3 broader audits + offline hardening.
- v1.18: Test Baseline Trustworthiness (TEST-04) is its own first phase (106) so subsequent phases can trust pytest/vitest/Playwright signal before adding new tests.
- v1.18: TEST-01/02/03 are coverage obligations on every code-changing phase, not a separate end phase. Anchored to Phase 110 for traceability.
- v1.18: FORMS-01 (form requiredness audit) grouped with Phase 107 canvassing wizard fixes since CANV-03 (optional notes) is itself a requiredness fix.
- v1.18: MAP-01/02/03 grouped into a single phase (109) since the asset pipeline audit, icon fix, and list/map layering all touch the same field-mode map components.
- v1.18: 5 phases for medium appetite, sequential dependency chain (106 → 107 → 108 → 109 → 110) so each phase ships on a trustworthy baseline.
- [Phase 110]: Phase 110 exit gate PASSED — milestone v1.18 ships on commit 18d54e9. Pytest 1122 (+4 client_uuid service tests), vitest 805 (+67 offline queue/sync engine/connectivity), Playwright 312 (+4 canvassing-offline-sync) on two consecutive greens via run-e2e.sh. Production code change: submitDoorKnock now derives offline state from the same navigator.onLine signal as ConnectivityPill, so the UI and the offline queue can no longer disagree about whether the volunteer is online.
- v1.19: Driven by a real volunteer who got stuck on the login page after clicking the v1.17 invite link with no instructions on how to authenticate.
- v1.19: Audit (2026-04-22 conversation) found ZITADEL self-registration is disabled (`scripts/bootstrap-zitadel.py:372` `allowRegister: False`) and `app/services/zitadel.py` has no user-creation methods, so brand-new invitees are currently locked out.
- v1.19: Option B (ZITADEL `invite_code` + `urlTemplate` deep-link) chosen — all four research workstreams converged independently on cost, UX, pitfall surface, and re-invite handling. ROPC out of scope under every branch.
- v1.19: Phase 111 opens with a gating spike against our 2.71.x ZITADEL instance to verify the `urlTemplate` deep-link actually lands an authenticated invitee on `/invites/<token>`. Failure of the spike forces a replan.
- v1.19: TEST-01/02/03 are per-phase coverage obligations (same pattern as v1.18). TEST-04 is the pre-phase-exit baseline check.
- v1.19: Existing `/signup/$token` volunteer-application flow is separate and out of scope.
- [Phase 111-01]: urlTemplate deep-link spike FAILED. ZITADEL v4.10.1 bundles only legacy Go-templates login UI (`/ui/login/*`); the v2 TypeScript login app (`/ui/v2/login/*`) that honors `urlTemplate` is a separate undeployed Next.js app. API surface (user creation, invite codes, service-account auth) works. Failure is strictly at post-password-set redirect boundary. Plans 02-06 blocked; milestone must replan.
- [v1.19 → v1.20 pivot 2026-04-23]: Chose DIY auth (fastapi-users 15.0.5 + CookieTransport + DatabaseStrategy, Postgres-backed) over Option C non-ROPC after sizing analysis showed equivalent engineering effort (~2-3 weeks) with surface ownership as the tie-breaker. Pivot tactical in motivation; cookie-based SPA auth leans permanent. Full decision record: `.planning/notes/decision-drop-zitadel-diy-auth.md`. Tripwires for return: `.planning/seeds/SEED-003-revisit-zitadel-when-sso-needed.md`.
- v1.20: Continuous Test Verification (SEED-002) included as an early phase — auth rebuild is cross-cutting, without continuous test runs we risk repeating v1.18 Phase 106's 219-silent-failure situation.
- v1.20: Three open design questions (Q-AUTH-01/02/03 in `.planning/research/questions.md`) to resolve during plan-phases, not at milestone-scoping time: email verification model, password policy rule set, session lifecycle.
- [v1.20 roadmap 2026-04-23]: 8-phase layout (112-119) derived from SUMMARY.md recommended build order, no deviations. Phase 112 SEED-002 first (TI5 prerequisite); 113 before 114 (CSRF HMAC binds to access_token.id); 114 before 115 (SPA needs CSRF contract); 115 before 116 (invite-accept mints on new contract); 117 depends on 115 not 116 (reset independent of invite); 118 gated on production soak (external); 119 parallel with 118 (extends rather than removes access_token).

## Pending Todos

- Formal `/gsd-complete-milestone v1.18` archival to MILESTONES.md — carried over from v1.19 STATE.md; still outstanding
- Formal `/gsd-complete-milestone v1.19` archival — add v1.19 to MILESTONES.md with the research+pivot outcome and preserved research artifacts as deliverable
- Resolve Q-AUTH-02 (password policy rule set) before Phase 116 plan-phase begins
- Resolve Q-AUTH-01 (email verification model) before Phase 117 plan-phase begins
- Resolve Q-AUTH-03 (session lifecycle) before Phase 119 plan-phase begins
- Run prod user audit before Phase 113 merges (count legacy-auth users; enumerates forced-reset email list if any)
- Context7 lookup on fastapi-users 15.0.5 at Phase 113 plan-time (router prefixes, DatabaseStrategy session semantics, UUID vs. string ID, hook signatures)

## Blockers/Concerns

- **v1.18 archival gap:** v1.18 has not been formally archived to MILESTONES.md — STATE.md confirmed shipment but the milestone audit and MILESTONES.md entry are pending. Track separately; not a v1.20 blocker.
- **v1.19 archival gap:** v1.19 needs formal close-out via `/gsd-complete-milestone` now that the pivot decision has been made. Not a v1.20 blocker but should happen before v1.20 Phase 112 planning begins so the MILESTONES.md history is clean.
- **Campaign creation 500 in production** — was ZITADEL-related in v1.19; under v1.20's ZITADEL tear-out (Phase 118) this is expected to resolve by construction, but should be verified post-v1.20. Not milestone scope.
- **HSTS header** — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-23
Stopped at: v1.20 roadmap complete — ready for `/gsd-plan-phase 112` (SEED-002 Continuous Verification)
Resume file: None
