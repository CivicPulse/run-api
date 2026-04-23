---
gsd_state_version: 1.0
milestone: v1.20
milestone_name: native-auth-rebuild-and-invite-onboarding
status: Defining requirements
stopped_at: ""
last_updated: "2026-04-23T19:00:00.000Z"
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
**Current focus:** Milestone v1.20 scoping — requirements and roadmap in progress

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-23 — Milestone v1.20 started after v1.19 closed as research+pivot (ZITADEL→DIY auth)

## Roadmap Summary

TBD — roadmap will be generated after v1.20 requirements are confirmed. Phase numbering continues from v1.19 (Phase 111 preserved as the `urlTemplate` spike-FAIL artifact; v1.20 begins at Phase 112).

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

## Pending Todos

- Formal `/gsd-complete-milestone v1.18` archival to MILESTONES.md — carried over from v1.19 STATE.md; still outstanding
- Formal `/gsd-complete-milestone v1.19` archival — add v1.19 to MILESTONES.md with the research+pivot outcome and preserved research artifacts as deliverable

## Blockers/Concerns

- **v1.18 archival gap:** v1.18 has not been formally archived to MILESTONES.md — STATE.md confirmed shipment but the milestone audit and MILESTONES.md entry are pending. Track separately; not a v1.20 blocker.
- **v1.19 archival gap:** v1.19 needs formal close-out via `/gsd-complete-milestone` now that the pivot decision has been made. Not a v1.20 blocker but should happen before v1.20 Phase 112 planning begins so the MILESTONES.md history is clean.
- **Campaign creation 500 in production** — was ZITADEL-related in v1.19; under v1.20's ZITADEL tear-out this is expected to resolve by construction, but should be verified post-v1.20. Not milestone scope.
- **HSTS header** — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-23
Stopped at: v1.20 milestone initialization — PROJECT.md updated, STATE.md reset, requirements and roadmap pending
Resume file: None
