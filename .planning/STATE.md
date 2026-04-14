---
gsd_state_version: 1.0
milestone: v1.19
milestone_name: Volunteer Lifecycle Expansion
status: defining_requirements
stopped_at: Defining requirements for v1.19 — pre-signup volunteer assignment to phone bank sessions and walk lists
last_updated: "2026-04-14T03:50:00.000Z"
last_activity: 2026-04-14
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-14)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** v1.19 Volunteer Lifecycle Expansion — pre-signup assignment

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-14 — Milestone v1.19 started

Progress: [          ] 0% (0/0 phases)

## Roadmap Summary

_To be defined by gsd-roadmapper after requirements are confirmed._

## Accumulated Context

### Decisions

- v1.19: Driving incident — Leo Segelman volunteer application approved 2026-04-13, appears on volunteers page after the 4902c158 fix, but cannot be assigned to "D5 Not Voted" phone banking session because Add Caller picker only surfaces `campaign_members`. Same blocker for canvassing walk list assignment.
- v1.19: Approach selected during brainstorm — **Option A: dual-identity assignment**. `session_callers` and the canvassing assignment table accept either `user_id` (logged-in member) OR `volunteer_id` (pre-signup volunteer) as primary identity, with an exactly-one constraint. Runtime operations (check-in, start-call, record-knock) remain user-scoped.
- v1.19: **Option B (pre-stub placeholder users on approval) REJECTED** — orphan-prone. ZITADEL issues its own user id on signup, so pre-stubbed rows would need an ID-remap reconciliation on accept. Confirmed by the orphan campaign_members row discovered during prod cleanup on 2026-04-14.
- v1.19: **Option C (merge volunteers into users + campaign_members entirely) REJECTED** — too large a blast radius, rewrites anonymous-signup flow and ZITADEL bootstrap for marginal gain.
- v1.19: Julia Callahan in the Vote Hatcher campaign is the in-DB exemplar of the dual-row pattern the product already tolerates: one `volunteers` row (no user_id) + one `campaign_members` row, never linked. v1.19 will include a one-time reconciliation migration.
- v1.19: Scope boundary — NO change to authentication, ZITADEL integration, or how volunteers actually log in. Purely data-model + assignment-UI changes. Runtime operations stay user-scoped.

### Carry-forward from v1.18

- [Phase 106]: D-15 — phase-verify cluster (~51) and misc (~29-40) deferred to v1.19 via `.planning/todos/pending/106-phase-verify-cluster-triage.md`. Not in v1.19 milestone scope unless explicitly pulled in.

## Pending Todos

- Define REQUIREMENTS.md for v1.19
- Spawn gsd-roadmapper to produce phase breakdown
- Plan first phase via `/gsd-plan-phase`

## Blockers/Concerns

- Pre-existing E2E flakes (mobile sidebar NAV-01, org-switcher, postgres port races) — discovered 2026-04-14, not in milestone scope. May need its own dedicated CI-stabilization pass before or alongside v1.19.
- Campaign creation 500 in production — ZITADEL pod connectivity investigation remains an ops follow-up, not milestone scope.
- HSTS header — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-14T03:50:00.000Z
Stopped at: PROJECT.md and STATE.md updated for v1.19; defining requirements next
Resume file: None
