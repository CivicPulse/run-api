# Roadmap: CivicPulse Run API

## Overview

Current milestone: **v1.19 Volunteer Lifecycle Expansion** — allow pre-signup volunteers (approved but not yet logged in) to be assigned to phone bank sessions and canvassing walk lists, so admins can build rosters before invite acceptance. Phases 111-115.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-10)
- ✅ **v1.1 Local Dev & Deployment Readiness** — Phases 8-11 (shipped 2026-03-10)
- ✅ **v1.2 Full UI** — Phases 12-22 (shipped 2026-03-13)
- ✅ **v1.3 Voter Model & Import Enhancement** — Phases 23-29 (shipped 2026-03-15)
- ✅ **v1.4 Volunteer Field Mode** — Phases 30-38 (shipped 2026-03-17)
- ✅ **v1.5 Go Live — Production Readiness** — Phases 39-48 (shipped 2026-03-25)
- ✅ **v1.6 Imports** — Phases 49-55 (shipped 2026-03-29)
- ✅ **v1.10 Import Recovery** — Phases 56-58 (shipped 2026-04-01)
- ✅ **v1.11 Faster Imports** — Phases 59-70 (shipped 2026-04-04)
- ✅ **v1.12 Hardening & Remediation** — Phases 71-77 (shipped 2026-04-05)
- ✅ **v1.13 Production Shakedown Remediation** — Phases 78-83 (shipped 2026-04-06)
- ✅ **v1.14 Voter Search & Lookup** — Phases 84-87 (shipped 2026-04-07)
- ✅ **v1.15 Twilio Communications** — Phases 88-94 (shipped 2026-04-08)
- ✅ **v1.16 Email Delivery Foundation** — Phases 95-100 (shipped 2026-04-08)
- ✅ **v1.17 Easy Volunteer Invites** — Phases 101-105 (shipped 2026-04-10)
- ✅ **v1.18 Field UX Polish** — Phases 106-110 (shipped 2026-04-11)
- 🚧 **v1.19 Volunteer Lifecycle Expansion** — Phases 111-115 (in progress, started 2026-04-14)

## Milestone History

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Authentication and Multi-Tenancy (3/3 plans) — completed 2026-03-09
- [x] Phase 2: Voter Data Import and CRM (4/4 plans) — completed 2026-03-09
- [x] Phase 3: Canvassing Operations (4/4 plans) — completed 2026-03-09
- [x] Phase 4: Phone Banking (3/3 plans) — completed 2026-03-09
- [x] Phase 5: Volunteer Management (3/3 plans) — completed 2026-03-09
- [x] Phase 6: Operational Dashboards (2/2 plans) — completed 2026-03-09
- [x] Phase 7: Integration Wiring Fixes (1/1 plan) — completed 2026-03-10

See: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Local Dev & Deployment Readiness (Phases 8-11) — SHIPPED 2026-03-10</summary>

- [x] Phase 8: Containerization (2/2 plans) — completed 2026-03-10
- [x] Phase 9: Local Dev Environment (2/2 plans) — completed 2026-03-10
- [x] Phase 10: CI/CD Pipeline (1/1 plan) — completed 2026-03-10
- [x] Phase 11: Kubernetes & GitOps (2/2 plans) — completed 2026-03-10

See: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Full UI (Phases 12-22) — SHIPPED 2026-03-13</summary>

See: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Voter Model & Import Enhancement (Phases 23-29) — SHIPPED 2026-03-15</summary>

See: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Volunteer Field Mode (Phases 30-38) — SHIPPED 2026-03-17</summary>

See: `.planning/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Go Live — Production Readiness (Phases 39-48) — SHIPPED 2026-03-25</summary>

See: `.planning/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>✅ v1.6 Imports (Phases 49-55) — SHIPPED 2026-03-29</summary>

See: `.planning/milestones/v1.6-ROADMAP.md`

</details>

<details>
<summary>✅ v1.10 Import Recovery (Phases 56-58) — SHIPPED 2026-04-01</summary>

- [x] Phase 56: Schema & Orphan Detection (1/1 plan) — completed 2026-04-01
- [x] Phase 57: Recovery Engine & Completion Hardening (1/1 plan) — completed 2026-04-01
- [x] Phase 58: Test Coverage (1/1 plan) — completed 2026-04-01

See: `.planning/milestones/v1.10-ROADMAP.md`

</details>

<details>
<summary>✅ v1.11 Faster Imports (Phases 59-70) — SHIPPED 2026-04-04</summary>

- [x] Phase 59: Chunk Schema & Configuration — completed 2026-04-03
- [x] Phase 60: Parent Split & Parallel Processing — completed 2026-04-03
- [x] Phase 61: Completion Aggregation & Error Merging — completed 2026-04-03
- [x] Phase 62: Resilience & Cancellation — completed 2026-04-03
- [x] Phase 63: Secondary Work Offloading — completed 2026-04-03
- [x] Phase 64: Frontend Throughput & Status UI — completed 2026-04-03
- [x] Phase 65: Chunk Planning & Concurrency Cap Closure — completed 2026-04-03
- [x] Phase 66: Import Wizard Flow Recovery & Progress Accuracy — completed 2026-04-03
- [x] Phase 67: Chunk Import Cleanup & Deletion Semantics — completed 2026-04-03
- [x] Phase 68: Progress Metric Accuracy & Validation Closeout — completed 2026-04-03
- [x] Phase 69: Queued Cancellation Finalization Closure — completed 2026-04-04
- [x] Phase 70: Reopened Import Restore Flow Closure — completed 2026-04-04

See: `.planning/milestones/v1.11-ROADMAP.md`

</details>

<details>
<summary>✅ v1.12 Hardening & Remediation (Phases 71-77) — SHIPPED 2026-04-05</summary>

- [x] Phase 71: Tenant Isolation — Service & Route Scoping (3/3 plans) — completed 2026-04-04
- [x] Phase 72: Row-Level Security Hardening (3/3 plans) — completed 2026-04-05
- [x] Phase 73: Frontend Auth Guards & OIDC Error Surfacing (6/6 plans) — completed 2026-04-05
- [x] Phase 74: Data Integrity & Concurrency (4/4 plans) — completed 2026-04-05
- [x] Phase 75: Reliability — Frontend State & PII Hygiene (4/4 plans) — completed 2026-04-05
- [x] Phase 76: Reliability — Backend Infrastructure (5/5 plans) — completed 2026-04-05
- [x] Phase 77: Quality, Accessibility & Test Coverage (5/5 plans) — completed 2026-04-05

See: `.planning/milestones/v1.12-ROADMAP.md`

</details>

<details>
<summary>✅ v1.13 Production Shakedown Remediation (Phases 78-83) — SHIPPED 2026-04-06</summary>

- [x] Phase 78: Tenant Isolation Containment (3/3 plans) — completed 2026-04-06
- [x] Phase 79: Error Handling and Edge Security (3/3 plans) — completed 2026-04-06
- [x] Phase 80: Workflow Recovery (3/3 plans) — completed 2026-04-05
- [x] Phase 81: Field, Accessibility, and Mobile Launch Readiness (3/3 plans) — completed 2026-04-06
- [x] Phase 82: Contract Drift, Validation, and Documentation Decisions (3/3 plans) — completed 2026-04-06
- [x] Phase 83: Reverification and Shakedown Cleanup (3/3 plans) — completed 2026-04-06

See: `.planning/milestones/v1.13-ROADMAP.md`

</details>

<details>
<summary>✅ v1.14 Voter Search & Lookup (Phases 84-87) — SHIPPED 2026-04-07</summary>

- [x] Phase 84: Search Contract & Composition — completed 2026-04-07
- [x] Phase 85: Campaign-Scoped Search Data & Freshness — completed 2026-04-07
- [x] Phase 86: Ranked Multi-Field Lookup — completed 2026-04-07
- [x] Phase 87: Search-First Voter Page UX — completed 2026-04-07

See: `.planning/milestones/v1.14-ROADMAP.md`

</details>

<details>
<summary>✅ v1.15 Twilio Communications (Phases 88-94) — SHIPPED 2026-04-08</summary>

- [x] Phase 88: Org Twilio Credentials & Encryption Foundation — completed 2026-04-07
- [x] Phase 89: Phone Number Inventory & Provisioning — completed 2026-04-07
- [x] Phase 90: Webhook Security & Routing Infrastructure — completed 2026-04-07
- [x] Phase 91: Browser Voice Calling — completed 2026-04-07
- [x] Phase 92: Two-Way SMS & Opt-Out Handling — completed 2026-04-07
- [x] Phase 93: Spend Controls & Communication Telemetry — completed 2026-04-08
- [x] Phase 94: Twilio Lookup Validation — completed 2026-04-08

See: `.planning/milestones/v1.15-ROADMAP.md`

</details>

<details>
<summary>✅ v1.16 Email Delivery Foundation (Phases 95-100) — SHIPPED 2026-04-08</summary>

See: `.planning/milestones/v1.16-ROADMAP.md`

</details>

<details>
<summary>✅ v1.17 Easy Volunteer Invites (Phases 101-105) — SHIPPED 2026-04-10</summary>

- [x] Phase 101: Signup Link Foundation & Public Entry (1/1 plan) — completed 2026-04-09
- [x] Phase 102: Volunteer Applications & Existing-Account Intake (1/1 plan) — completed 2026-04-09
- [x] Phase 103: Review Queue, Approval, and Access Activation (1/1 plan) — completed 2026-04-09
- [x] Phase 104: Public Volunteer Intake Closure (1/1 plan) — completed 2026-04-09
- [x] Phase 105: Review Context and Audit Traceability Closeout (1/1 plan) — completed 2026-04-09

See: `.planning/milestones/v1.17-ROADMAP.md`

</details>

<details>
<summary>✅ v1.18 Field UX Polish (Phases 106-110) — SHIPPED 2026-04-11</summary>

- [x] Phase 106: Test Baseline Trustworthiness (5/5 plans) — completed 2026-04-11
- [x] Phase 107: Canvassing Wizard Fixes (10/10 plans) — completed 2026-04-11
- [x] Phase 108: House Selection & Active-State (7/7 plans) — completed 2026-04-11
- [x] Phase 109: Map Rendering & Asset Pipeline (6/6 plans) — completed 2026-04-11
- [x] Phase 110: Offline Queue & Connectivity Hardening (8/8 plans) — completed 2026-04-11

See: `.planning/milestones/v1.18-ROADMAP.md`

</details>

## Current Milestone

### v1.19 Volunteer Lifecycle Expansion

**Goal:** Allow pre-signup volunteers (approved but not yet logged in) to be assigned to phone banking sessions and canvassing walk lists. When the volunteer accepts their invite and logs in, their existing assignments become immediately actionable with no re-work.

**Phase numbering:** continues from v1.18 (last phase 110) → v1.19 spans **Phases 111-115**.

**Phase dependency chain:** 111 → 112 → 113 → 114 → 115 (sequential; each phase leaves the system shippable on its own).

## Phases

- [ ] **Phase 111: Reconciliation & Dual-Identity Schema** — One-time Julia-style reconciliation migration plus dual-identity (`user_id` OR `volunteer_id`) schema on `session_callers` and the walk-list canvasser assignment table.
- [ ] **Phase 112: Service Layer & Invite-Acceptance Backfill** — Dual-identity service helper / unified DTO plus `InviteService.accept_invite` extension that backfills outstanding session/walk-list assignments on first login.
- [ ] **Phase 113: Runtime API Gating** — Runtime-action API endpoints reject `volunteer_id`-only assignments with a structured 422 error the frontend can render.
- [ ] **Phase 114: Picker UI & Runtime-Gating UX** — Add Caller / Add Canvasser pickers surface pre-signup volunteers with clear affordance; phone-banking and canvassing runtime actions render disabled with tooltip for pre-signup rows.
- [ ] **Phase 115: E2E Coverage & Milestone Exit** — Full end-to-end coverage of the assign → disabled-action → accept-invite → actionable-post-login flow, plus milestone-final 4-suite gate.

## Phase Details

### Phase 111: Reconciliation & Dual-Identity Schema

**Goal:** The data foundation for dual-identity assignment is in place and existing Julia-style dual-row volunteers are linked, so every subsequent phase reads and writes against a clean post-reconciliation schema.

**Depends on:** none (first phase of milestone)

**Requirements:** MIGRATE-01, MIGRATE-02, ASSIGN-01, ASSIGN-02

**Success Criteria** (what must be TRUE):
1. Running the reconciliation migration against a fixture containing Julia-style dual-row volunteers links every unambiguous match, leaves ambiguous rows unchanged, and emits a report with linked / ambiguous / unchanged counts (MIGRATE-01).
2. Pytest coverage exercises the reconciliation migration against link, ambiguous, and no-match seeded cases and asserts idempotent re-runs produce zero new links (MIGRATE-02).
3. `session_callers` accepts a row with either `user_id` set or `volunteer_id` set (exactly one) and rejects rows with both or neither set at the DB level; the migration is reversible (ASSIGN-01).
4. The canvassing walk-list canvasser assignment table accepts the same dual-identity shape with the same exactly-one CHECK constraint and reversible migration (ASSIGN-02).
5. The production database schema after this phase is shippable on its own — no downstream code depends on service / UI / runtime-gating work landing first.

**Plans:** TBD

### Phase 112: Service Layer & Invite-Acceptance Backfill

**Goal:** All backend service-layer reads and writes of session-caller and canvassing-assignment rows handle both identity types transparently, and a volunteer accepting their invite has every outstanding assignment silently upgraded to runtime-capable in the same transaction.

**Depends on:** Phase 111

**Requirements:** ASSIGN-03, BACKFILL-01, BACKFILL-02

**Success Criteria** (what must be TRUE):
1. Backend service methods that read session-caller / canvassing-assignment rows return a unified person DTO that resolves to either a volunteer record or a user record via a single helper, with no `if user_id else volunteer_id` branching leaking out of the service layer (ASSIGN-03).
2. When a pre-signup volunteer accepts their invite, every outstanding `session_callers` and walk-list canvasser row whose `volunteer_id` resolves to the invitee by email is updated in place to set `user_id` and clear `volunteer_id` as part of the existing `accept_invite` flow (BACKFILL-01).
3. If any step of accept_invite fails (user sync, volunteer backfill, assignment backfill), the entire transaction rolls back with no partial state on any of the three surfaces (BACKFILL-02).
4. Unit and integration test coverage (TEST-01/02) lands alongside the service helper and backfill changes, exercising both identity types against a real test database.

**Plans:** TBD

### Phase 113: Runtime API Gating

**Goal:** The runtime-action API surface refuses to execute authenticated operations on behalf of a pre-signup volunteer assignment, returning a structured machine-readable error the frontend can render consistently.

**Depends on:** Phase 112

**Requirements:** RUNTIME-03

**Success Criteria** (what must be TRUE):
1. Phone banking runtime endpoints (check-in, start-call, submit-call-record) return 422 with a stable error `code` when invoked against an assignment whose primary identity is `volunteer_id` only (RUNTIME-03).
2. Canvassing runtime endpoints (check-in, record door knock, submit outcome) return the same structured 422 under the same condition (RUNTIME-03).
3. The error payload carries a code the frontend can map 1:1 to the disabled-tooltip message without string matching, and the contract is covered by integration tests against a real test database (TEST-02).
4. Unit test coverage (TEST-01) locks the gating behavior for every modified endpoint handler.
5. The API is safe to ship before any UI surfaces the new picker entries — pre-signup rows cannot reach runtime endpoints through any supported UI path yet, and the API defends itself if they ever do.

**Plans:** TBD

### Phase 114: Picker UI & Runtime-Gating UX

**Goal:** Admins can assign pre-signup volunteers to phone banking sessions and canvassing walk lists through the existing Add Caller / Add Canvasser pickers, and every runtime action that requires a logged-in user renders clearly disabled with an explanatory tooltip for pre-signup assignments.

**Depends on:** Phase 113

**Requirements:** PICKER-01, PICKER-02, PICKER-03, PICKER-04, RUNTIME-01, RUNTIME-02

**Success Criteria** (what must be TRUE):
1. Opening the Add Caller picker on a phone banking session shows logged-in campaign members and pre-signup volunteers in the same list, with a visual badge or icon distinguishing pre-signup entries (PICKER-01).
2. Opening the Add Canvasser picker on a walk list shows the same dual list with the same visual distinction (PICKER-02).
3. A pre-signup volunteer row in either picker displays a clear affordance (tooltip or status text) explaining "Hasn't logged in yet — they'll be able to start working when they accept their invite" (PICKER-03).
4. The picker search box matches against name and email for both members and pre-signup volunteers with a single query (PICKER-04).
5. Phone banking runtime action buttons (check-in, start-call, submit-call-record) render disabled with an explanatory tooltip for assignments whose primary identity is `volunteer_id` (RUNTIME-01).
6. Canvassing runtime action buttons (check-in, record door knock, submit outcome) render disabled with the same tooltip for `volunteer_id`-only assignments (RUNTIME-02).
7. Unit and integration tests (TEST-01/02) cover the picker data path, search behavior, and disabled-state rendering.

**Plans:** TBD
**UI hint**: yes

### Phase 115: E2E Coverage & Milestone Exit

**Goal:** The end-to-end user journey — admin assigns a pre-signup volunteer to a session, the volunteer sees disabled runtime actions, the volunteer accepts their invite, and their assignments become immediately actionable — is locked in by Playwright, and the full v1.19 test suite gate is satisfied.

**Depends on:** Phase 114

**Requirements:** TEST-03 (anchor), TEST-01, TEST-02 (milestone coverage anchor)

**Success Criteria** (what must be TRUE):
1. An E2E spec via `web/scripts/run-e2e.sh` assigns a pre-signup volunteer to a phone banking session through the Add Caller picker and verifies the assignment appears in the session roster with the pre-signup badge (TEST-03).
2. The same spec (or a sibling spec) verifies that phone banking and canvassing runtime actions render disabled with the correct tooltip text for pre-signup assignments (TEST-03).
3. An E2E spec exercises invite acceptance as the assigned pre-signup volunteer and verifies that after first login the volunteer's session and walk-list assignments are immediately runtime-capable with no admin re-assign step (TEST-03).
4. Milestone-final 4-suite gate: `uv run ruff check .`, `uv run pytest`, `vitest`, and `web/scripts/run-e2e.sh` all exit clean; every file modified across phases 111-115 has meaningful unit + integration + E2E coverage for its changed behavior (TEST-01/02/03).

**Plans:** TBD
**UI hint**: yes

---

_TEST-01, TEST-02, and TEST-03 are cross-cutting coverage obligations applied as explicit success criteria on every code-changing phase (111-115). They are anchored to Phase 115 in the Traceability table as the milestone-final coverage gate._
