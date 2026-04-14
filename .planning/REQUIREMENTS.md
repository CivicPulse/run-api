# Milestone v1.19 Requirements — Volunteer Lifecycle Expansion

**Milestone:** v1.19 Volunteer Lifecycle Expansion
**Goal:** Allow pre-signup volunteers (approved but not yet logged in) to be assigned to phone banking sessions and canvassing walk lists, so admins can build rosters before invite acceptance. When the volunteer accepts their invite and logs in, their existing assignments become immediately actionable with no re-work.
**Status:** Requirements drafted — awaiting roadmap
**Last updated:** 2026-04-14

---

## Source of Truth

Requirements derived from:
- Production incident 2026-04-13: Leo Segelman volunteer application approved → appears on volunteers page (after `4902c158` fix) → cannot be assigned to "D5 Not Voted" phone banking session because Add Caller picker only surfaces `campaign_members`, not pre-signup volunteers
- Brainstorm decision: **Option A — dual-identity assignment**. `session_callers` and the canvassing assignment table accept either `user_id` (logged-in member) OR `volunteer_id` (pre-signup volunteer) as primary identity, with an exactly-one constraint. Runtime operations remain user-scoped.
- Existing pattern in the wild: Julia Callahan in the Vote Hatcher campaign (separate `volunteers` row + separate `campaign_members` row, no linkage) — proves the product already tolerates the dual-identity split implicitly; v1.19 formalizes it.
- Builds directly on v1.17 Easy Volunteer Invites (phases 101-105) and the volunteer approval fix (commit `4902c158`).

---

## v1.19 Requirements

### ASSIGN — Dual-Identity Assignment Model

- [ ] **ASSIGN-01**: The `session_callers` table accepts either a `user_id` (logged-in member) or a `volunteer_id` (pre-signup volunteer) as primary identity, with an exactly-one DB-level CHECK constraint and one of the two columns nullable. The schema migration is reversible.
- [ ] **ASSIGN-02**: The canvassing walk list assignment table (e.g., `walk_list_canvassers` or equivalent) accepts the same dual-identity model: `user_id` OR `volunteer_id`, exactly one set, with the same constraint shape and migration reversibility.
- [ ] **ASSIGN-03**: Backend service-layer methods that read or write session-caller / canvassing-assignment rows are updated to handle both identity types transparently — callers receive a unified DTO that resolves to a person record (volunteer or user) via a single helper.

### PICKER — Add Caller / Add Canvasser UI

- [ ] **PICKER-01**: The phone banking session "Add Caller" picker shows logged-in campaign members AND pre-signup volunteers in the same list, with a visual distinction (badge or icon) marking pre-signup entries.
- [ ] **PICKER-02**: The canvassing walk list canvasser picker shows the same dual list with the same visual distinction.
- [ ] **PICKER-03**: Pre-signup volunteers in either picker display a clear affordance (tooltip or status text) explaining "Hasn't logged in yet — they'll be able to start working when they accept their invite."
- [ ] **PICKER-04**: Search/filter inside both pickers matches across both name and email, regardless of whether the entry is a member or a volunteer.

### RUNTIME — Runtime Gating

- [ ] **RUNTIME-01**: Phone banking actions that require an authenticated session (check-in, start-call, submit-call-record) are disabled for assignments whose primary identity is `volunteer_id` (no linked user yet). The disabled state is rendered with a clear tooltip explaining the prerequisite.
- [ ] **RUNTIME-02**: Canvassing actions that require an authenticated session (check-in, record door knock, submit outcome) are disabled the same way for `volunteer_id`-only assignments.
- [ ] **RUNTIME-03**: The runtime-action API endpoints reject requests targeting `volunteer_id`-only assignments with a clear 422 (or 409) error and a structured `code` the frontend can render as the same disabled-tooltip message.

### BACKFILL — Invite Acceptance Reconciliation

- [ ] **BACKFILL-01**: When `InviteService.accept_invite` runs (existing flow from v1.17), it now ALSO scans `session_callers` and the canvassing assignment table for rows where `volunteer_id` resolves to a `volunteers` row whose email matches the invitee, and updates those rows in place to set `user_id` (and clear `volunteer_id`) so the assignment becomes runtime-capable instantly on first login. The existing `volunteers.user_id` backfill behavior is preserved.
- [ ] **BACKFILL-02**: BACKFILL-01 is wrapped in a single transaction with the existing `accept_invite` transaction so no partial state is possible if any step fails.

### MIGRATE — One-Time Reconciliation

- [ ] **MIGRATE-01**: A one-time data migration links existing dual-row volunteers (the Julia Callahan pattern: same person present as both a `volunteers` row and a `campaign_members` row with the same email but no `volunteers.user_id` linkage). The migration is idempotent and produces a report of how many rows were linked, how many were ambiguous (multiple matches), and how many were left unchanged.
- [ ] **MIGRATE-02**: The reconciliation migration ships with explicit pytest coverage that exercises the link, ambiguous, and no-match cases against a seeded fixture.

### TEST — Test Coverage

- [ ] **TEST-01**: Every backend file modified during v1.19 has meaningful pytest unit test coverage for new or changed behavior, including the dual-identity service helpers, runtime-gating endpoints, and the backfill flow.
- [ ] **TEST-02**: Every API and service boundary touched during v1.19 has integration test coverage (pytest integration marker) hitting a real test database with both identity types exercised.
- [ ] **TEST-03**: Every user-visible behavior changed during v1.19 has E2E test coverage via `web/scripts/run-e2e.sh`. Covers: assigning a pre-signup volunteer to a session via the picker, the disabled-runtime-action UX, accepting an invite as that volunteer, and verifying the assignment becomes actionable post-login.

---

## Future Requirements

_Deferred to later milestones:_

- Bulk-assign multiple volunteers to a session in one action
- Volunteer-self-assign workflow (volunteer signs up, sees available sessions in their hub, picks one)
- Notification emails to pre-signup volunteers when they're assigned to a session (separate transactional email work)
- Admin can resend invite from the picker if a pre-signup volunteer's invite has expired
- Drag-and-drop volunteer-to-session assignment in a roster view

---

## Out of Scope

- Merging `volunteers` and `users` into one table (Option C, rejected during brainstorm — too large a blast radius)
- Pre-stubbing placeholder `users` rows on volunteer application approval (Option B, rejected — orphan-prone, ZITADEL ID reconciliation issues)
- Any change to ZITADEL integration, OIDC flow, or how volunteers actually log in
- Any change to the volunteer application intake or approval flow itself (already shipped in v1.17 + the `4902c158` fix)
- New permission roles or RBAC changes — pre-signup volunteers do not gain login access via these assignments
- Notification/email features beyond the existing invite delivery
- Mobile app changes (this is API + web only, as per existing platform scope)

---

## Traceability

| REQ-ID       | Description                                                       | Phase |
|--------------|-------------------------------------------------------------------|-------|
| ASSIGN-01    | session_callers dual-identity schema + check constraint           | 111   |
| ASSIGN-02    | walk list canvasser dual-identity schema + check constraint       | 111   |
| ASSIGN-03    | Service-layer dual-identity helper + DTO                          | 112   |
| PICKER-01    | Add Caller picker shows volunteers                                | 114   |
| PICKER-02    | Add Canvasser picker shows volunteers                             | 114   |
| PICKER-03    | Pre-signup affordance tooltip                                     | 114   |
| PICKER-04    | Cross-identity name/email search                                  | 114   |
| RUNTIME-01   | Phone bank action gating for pre-signup                           | 114   |
| RUNTIME-02   | Canvassing action gating for pre-signup                           | 114   |
| RUNTIME-03   | API rejection with structured error                               | 113   |
| BACKFILL-01  | accept_invite backfills outstanding assignments                   | 112   |
| BACKFILL-02  | Backfill in single transaction                                    | 112   |
| MIGRATE-01   | One-time Julia-style reconciliation migration                     | 111   |
| MIGRATE-02   | Migration pytest coverage                                         | 111   |
| TEST-01      | Unit coverage for modified files                                  | 111-115*   |
| TEST-02      | Integration coverage for touched boundaries                       | 111-115*   |
| TEST-03      | E2E coverage for user-visible changes                             | 115*   |

_* TEST-01/02/03 are cross-cutting coverage obligations applied as explicit success criteria on every code-changing phase. The roadmapper anchors them to whichever phase is the last code-changing one for traceability and milestone-final pass._

**Coverage:** 17/17 requirements drafted. Phase mappings to be filled in by the roadmapper.
