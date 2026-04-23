---
gsd_state_version: 1.0
milestone: v1.19
milestone_name: milestone
status: completed
stopped_at: Phase 112 context gathered
last_updated: "2026-04-23T15:02:41.302Z"
last_activity: 2026-04-23 — Roadmap for v1.19 (phases 111-115) written; REQUIREMENTS.md traceability filled in.
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 6
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** v1.19 Invite Onboarding — roadmap complete, about to plan Phase 111.

## Current Position

Phase: 111 (not yet planned)
Plan: —
Status: Roadmap complete; ready for `/gsd-plan-phase 111`
Last activity: 2026-04-23 — Roadmap for v1.19 (phases 111-115) written; REQUIREMENTS.md traceability filled in.

## Roadmap Summary

5 phases, strictly sequential (111 → 112 → 113 → 114 → 115). Full detail in `.planning/ROADMAP.md`.

- **Phase 111: `urlTemplate` Spike + ZITADEL Service Surface** — Gating spike verifies ZITADEL deep-link behavior; ship `ensure_human_user` + `create_invite_code` with bounded retry; confirm service-account PAT least-privilege scope. Reqs: PROV-01, PROV-02, PROV-03, SEC-03.
- **Phase 112: Schema Migration + Legacy-Invite Handling** — Alembic migration adds provisioning columns (all tz-aware) and marks pre-v1.19 pending invites `legacy_flow=true` via pure SQL so deploy does not couple to ZITADEL availability. Reqs: MIG-01, MIG-02, MIG-03, SEC-04.
- **Phase 113: Provisioning Step in Email Task + Branched Email Content** — Extend `send_campaign_invite_email` with idempotent ZITADEL provisioning under the existing `queueing_lock`; branch first-time vs returning email content; wire `urlTemplate`. Reqs: PROV-04, PROV-05, EMAIL-01, EMAIL-02, EMAIL-03.
- **Phase 114: Frontend `/login` Interstitial + Empty-Membership Login Gate** — Pre-redirect `/login` context, OIDC-callback empty-membership gate (M1 mitigation), auto-landing-authed verification on `/invites/<token>`, email-mismatch recovery page, `SELECT FOR UPDATE` token-reuse guard. Reqs: UX-01, UX-02, UX-03, UX-04, SEC-01, SEC-02.
- **Phase 115: Resend, Recovery, and Observability** — Transparent init-code re-mint, public "request a fresh invite" rate-limited endpoint, admin resend endpoint, legacy-flow recovery CTA, funnel events, admin pending-invite visibility extension, milestone-final TEST-01/02/03/04 pass. Reqs: RECOV-01, RECOV-02, RECOV-03, RECOV-04, OBS-01, OBS-02, TEST-01, TEST-02, TEST-03, TEST-04.

**Coverage:** 29/29 requirements mapped. No orphans. TEST-01/02/03/04 anchored to Phase 115 for the milestone-final pass and referenced as per-phase exit-gate criteria on every code-changing phase (same pattern as v1.18).

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
- v1.19: Option B (ZITADEL `invite_code` + `urlTemplate` deep-link) chosen — all four research workstreams converged independently on cost, UX, pitfall surface, and re-invite handling. ROPC out of scope under every branch; Option C non-ROPC is the Phase-111 spike-failure fallback only.
- v1.19: Phase 111 opens with a gating spike against our 2.71.x ZITADEL instance to verify the `urlTemplate` deep-link actually lands an authenticated invitee on `/invites/<token>`. Failure of the spike forces a replan to Option C non-ROPC.
- v1.19: Pre-v1.19 pending invites handled via `legacy_flow=true` + recovery CTA (MIG-02) rather than a deploy-time ZITADEL backfill — avoids coupling deploy to ZITADEL availability. Recovery path reuses the same "Request a fresh invite" CTA we ship for expired init codes.
- v1.19: TEST-01/02/03 are per-phase coverage obligations (same pattern as v1.18). TEST-04 is the pre-phase-exit baseline check. All four anchor to Phase 115 in the traceability table for the milestone-final pass.
- v1.19: Existing `/signup/$token` volunteer-application flow is separate and out of scope.

## Pending Todos

- Plan Phase 111 (urlTemplate Spike + ZITADEL Service Surface) via `/gsd-plan-phase 111`

## Blockers/Concerns

- v1.18 has not been formally archived to MILESTONES.md via `/gsd-complete-milestone` — STATE.md confirms shipment but milestone audit and MILESTONES.md entry are pending. Track separately; not a v1.19 blocker.
- Campaign creation 500 in production — ZITADEL pod connectivity investigation remains an ops follow-up, not milestone scope. Worth flagging because Phase 111 spike + Phase 113 provisioning both depend on ZITADEL being reachable from prod.
- HSTS header — requires Cloudflare edge configuration outside this code milestone.
- Open contingency: Phase 111 `urlTemplate` deep-link spike is the gate for the whole milestone. If it fails, the milestone replans to Option C non-ROPC — budget one day for the spike explicitly.

## Session Continuity

Last session: --stopped-at
Stopped at: Phase 112 context gathered
Resume file: --resume-file

**Planned Phase:** 111 (urlTemplate Spike + ZITADEL Service Surface) — 6 plans — 2026-04-23T15:02:41.295Z
