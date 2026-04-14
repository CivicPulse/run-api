---
gsd_state_version: 1.0
milestone: v1.19
milestone_name: Volunteer Lifecycle Expansion
status: executing
stopped_at: Roadmap for v1.19 written (ROADMAP.md + STATE.md + REQUIREMENTS.md traceability); phase directories 111-115 created; ready to plan phase 111
last_updated: "2026-04-14T07:17:10.552Z"
last_activity: 2026-04-14 -- Phase 111 planning complete
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 3
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-14)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** v1.19 Volunteer Lifecycle Expansion — pre-signup assignment

## Current Position

Phase: 111 — Reconciliation & Dual-Identity Schema (not started)
Plan: —
Status: Ready to execute
Last activity: 2026-04-14 -- Phase 111 planning complete

Progress: [          ] 0% (0/5 phases)

## Roadmap Summary

v1.19 Volunteer Lifecycle Expansion spans **Phases 111-115**. Dependency chain is strictly sequential: 111 → 112 → 113 → 114 → 115.

| #   | Phase                                     | Requirements                                                                 | Criteria |
|-----|-------------------------------------------|------------------------------------------------------------------------------|----------|
| 111 | Reconciliation & Dual-Identity Schema     | MIGRATE-01, MIGRATE-02, ASSIGN-01, ASSIGN-02                                  | 5        |
| 112 | Service Layer & Invite-Acceptance Backfill| ASSIGN-03, BACKFILL-01, BACKFILL-02                                           | 4        |
| 113 | Runtime API Gating                        | RUNTIME-03                                                                    | 5        |
| 114 | Picker UI & Runtime-Gating UX             | PICKER-01, PICKER-02, PICKER-03, PICKER-04, RUNTIME-01, RUNTIME-02            | 7        |
| 115 | E2E Coverage & Milestone Exit             | TEST-03 (anchor), TEST-01, TEST-02 (milestone coverage anchor)                | 4        |

**Sequencing rationale:**

- Phase 111 ships the data foundation (one-time reconciliation + dual-identity schema) so all subsequent code reads against a clean post-reconciliation state.
- Phase 112 lands the backend service helper and invite-acceptance backfill on top of the new schema.
- Phase 113 closes the runtime API safety boundary BEFORE any UI surfaces the new picker entries — so if a pre-signup row ever reaches a runtime endpoint it fails closed with a structured error.
- Phase 114 adds all user-visible picker + disabled-action UX once the API is safe.
- Phase 115 is the milestone exit gate with full E2E coverage of the assign → disabled-action → invite-accept → actionable flow.

**Cross-cutting coverage:** TEST-01 (unit) and TEST-02 (integration) land on every code-changing phase (111-115). TEST-03 (E2E) is anchored to Phase 115 as the milestone-final coverage gate.

**Coverage:** 17/17 v1.19 requirements mapped.

## Accumulated Context

### Decisions

- v1.19: Driving incident — Leo Segelman volunteer application approved 2026-04-13, appears on volunteers page after the 4902c158 fix, but cannot be assigned to "D5 Not Voted" phone banking session because Add Caller picker only surfaces `campaign_members`. Same blocker for canvassing walk list assignment.
- v1.19: Approach selected during brainstorm — **Option A: dual-identity assignment**. `session_callers` and the canvassing assignment table accept either `user_id` (logged-in member) OR `volunteer_id` (pre-signup volunteer) as primary identity, with an exactly-one constraint. Runtime operations (check-in, start-call, record-knock) remain user-scoped.
- v1.19: **Option B (pre-stub placeholder users on approval) REJECTED** — orphan-prone. ZITADEL issues its own user id on signup, so pre-stubbed rows would need an ID-remap reconciliation on accept. Confirmed by the orphan campaign_members row discovered during prod cleanup on 2026-04-14.
- v1.19: **Option C (merge volunteers into users + campaign_members entirely) REJECTED** — too large a blast radius, rewrites anonymous-signup flow and ZITADEL bootstrap for marginal gain.
- v1.19: Julia Callahan in the Vote Hatcher campaign is the in-DB exemplar of the dual-row pattern the product already tolerates: one `volunteers` row (no user_id) + one `campaign_members` row, never linked. v1.19 includes a one-time reconciliation migration in Phase 111.
- v1.19: Scope boundary — NO change to authentication, ZITADEL integration, or how volunteers actually log in. Purely data-model + assignment-UI changes. Runtime operations stay user-scoped.
- v1.19 roadmap: Reconciliation (MIGRATE) is bundled with the schema migration in Phase 111 so all subsequent code reads against the post-reconciliation schema. BACKFILL is bundled with the service helper in Phase 112 (not a standalone phase) since it is a small extension to existing `accept_invite` logic.
- v1.19 roadmap: Runtime API gating (Phase 113) intentionally lands BEFORE picker UI (Phase 114) so the API defends itself before any UI exposes pre-signup rows to runtime endpoints.

### Carry-forward from v1.18

- [Phase 106]: D-15 — phase-verify cluster (~51) and misc (~29-40) deferred to v1.19 via `.planning/todos/pending/106-phase-verify-cluster-triage.md`. **Not in v1.19 milestone scope** unless explicitly pulled in.

## Pending Todos

- Plan phase 111 via `/gsd-plan-phase 111`

## Blockers/Concerns

- Pre-existing E2E flakes (mobile sidebar NAV-01, org-switcher, postgres port races) — discovered 2026-04-14, not in milestone scope. May need its own dedicated CI-stabilization pass before or alongside v1.19.
- Campaign creation 500 in production — ZITADEL pod connectivity investigation remains an ops follow-up, not milestone scope.
- HSTS header — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-14T04:20:00.000Z
Stopped at: Roadmap for v1.19 written (ROADMAP.md + STATE.md + REQUIREMENTS.md traceability); phase directories 111-115 created; ready to plan phase 111
Resume file: None
