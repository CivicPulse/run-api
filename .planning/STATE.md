---
gsd_state_version: 1.0
milestone: v1.19
milestone_name: Invite Onboarding
status: defining_requirements
stopped_at: Started milestone v1.19; awaiting research before requirements
last_updated: "2026-04-22T00:00:00.000Z"
last_activity: 2026-04-22
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** Defining requirements for v1.19 Invite Onboarding

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-22 — Milestone v1.19 started

## Roadmap Summary

(Pending — research → requirements → roadmap.)

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
- v1.19: Implementation approach (Option B "ZITADEL init code" vs Option C "app-owned setup page on run.civpulse.org") deferred to research phase; researchers will score both on cost, UX, security, ZITADEL coupling, and re-invite handling before requirements are written.
- v1.19: Existing `/signup/$token` volunteer-application flow is separate and out of scope.

## Pending Todos

- Decide between Option B and Option C after parallel research completes
- Define REQUIREMENTS.md for v1.19 (categories likely: AUTH/PROVISION, INVITE, EMAIL, UX, TEST)
- Spawn roadmapper continuing from Phase 111

## Blockers/Concerns

- v1.18 has not been formally archived to MILESTONES.md via `/gsd-complete-milestone` — STATE.md confirms shipment but milestone audit and MILESTONES.md entry are pending. Track separately; not a v1.19 blocker.
- Campaign creation 500 in production — ZITADEL pod connectivity investigation remains an ops follow-up, not milestone scope.
- HSTS header — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-22T00:00:00.000Z
Stopped at: PROJECT.md and STATE.md updated for v1.19; about to spawn research agents
Resume file: None
