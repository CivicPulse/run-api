# Roadmap: CivicPulse Run API

## Overview

Current milestone: **v1.18 Field UX Polish** — fix reported canvassing field bugs and harden the offline/sync path so volunteers can complete doors reliably. Phases 106-110.

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
- 🚧 **v1.18 Field UX Polish** — Phases 106-110 (in progress)

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

## Current Milestone

### v1.18 Field UX Polish

**Goal:** Fix reported canvassing field bugs and harden the offline/sync path so volunteers can complete doors reliably. Raise the test suite to a trustworthy baseline.

**Phase numbering:** continues from v1.17 (last phase 105) → v1.18 spans **Phases 106-110**.

**Phase dependency chain:** 106 → 107 → 108 → 109 → 110 (sequential; each phase ships on a trustworthy baseline left by the previous one).

| #   | Phase                                      | Goal                                                                                     | Requirements                                      |
|-----|--------------------------------------------|------------------------------------------------------------------------------------------|---------------------------------------------------|
| 106 | 5/5 | Complete    | 2026-04-11 |
| 107 | Canvassing Wizard Fixes                    | Auto-advance, working Skip House, optional outcome notes, form-requiredness audit        | CANV-01, CANV-02, CANV-03, FORMS-01               |
| 108 | House Selection & Active-State             | Tap-to-activate from list and map with audited state machine                             | SELECT-01, SELECT-02, SELECT-03                   |
| 109 | Map Rendering & Asset Pipeline             | Leaflet icons render everywhere; list view not covered by map; asset pipeline audited    | MAP-01, MAP-02, MAP-03                            |
| 110 | Offline Queue & Connectivity Hardening     | Reliable persist/replay, connectivity indicator, sync-on-reconnect + coverage gate       | OFFLINE-01/02/03 + TEST-01/02/03 anchor           |

#### Phase 106: Test Baseline Trustworthiness ✅ Complete (2026-04-10)

**Status:** Complete — verified via 106-VERIFICATION.md (TEST-04 satisfied; D-12 exit gate passed with two consecutive Playwright greens at 01:52:12Z and 01:54:28Z; phase-verify cluster + a11y/voter-contacts deferrals authorized via D-15 Option D hybrid).

**Goal:** Pre-existing broken or consistently failing tests are fixed or deleted so that any red test in the remaining v1.18 work signals a real regression.

**Requirements:** TEST-04 ✅

**Success criteria:**
1. `uv run pytest` runs end-to-end with no unexpected failures (skips/xfails justified in code).
2. Frontend `vitest` suite runs clean with no known-broken tests left as `.skip` / `xfail` without justification.
3. `web/scripts/run-e2e.sh` runs the full Playwright suite with no flaky-known-broken specs — any remaining failures are tracked as real bugs.
4. Any tests deleted during this phase are recorded with a short justification in the phase commit messages.

**Plans:** 5/5 plans complete

Plans:
- [x] 106-01-PLAN.md — Baseline capture (env sanity, 3-suite single-run, 106-BASELINE.md scope fence, scope-explosion gate)
- [x] 106-02-PLAN.md — Pytest triage (15-min time-box, D-10 skip audit, `PHASE-106-DELETE:` deletion trail, pytest exits 0)
- [x] 106-03-PLAN.md — Vitest triage (15-min time-box, D-10 skip/only audit, vitest exits 0)
- [x] 106-04-PLAN.md — Playwright triage (D-11 known-skip audit, 3x rerun D-04, historical flake hit list, run-e2e.sh exits 0)
- [x] 106-05-PLAN.md — D-12 exit gate (ruff + pytest + vitest + 2x consecutive green Playwright via wrapper, 106-EXIT-GATE.md)

**Dependencies:** none (first phase of milestone).

#### Phase 107: Canvassing Wizard Fixes

**Goal:** A volunteer recording outcomes in the canvassing wizard experiences automatic advance, working skip, and no forced text entry.

**Requirements:** CANV-01, CANV-02, CANV-03, FORMS-01

**Success criteria:**
1. Submitting an outcome on the active house automatically transitions the wizard to the next house in the walk list (CANV-01).
2. Tapping "Skip house" advances past the current active house, marks it skipped in the queue, and surfaces the next house within one tap (CANV-02).
3. Any outcome can be saved with an empty notes field (CANV-03).
4. A documented audit of every `required` validator in field-mode forms exists and over-eager validations are removed (FORMS-01).
5. Unit, integration, and E2E tests cover auto-advance, skip, optional notes, and the form-requiredness changes (TEST-01/02/03).

**Plans:** 9 plans

Plans:
- [ ] 107-01-PLAN.md — usePrefersReducedMotion hook + unit test (D-20 dependency for Plan 04)
- [ ] 107-02-PLAN.md — HOUSE_LEVEL_OUTCOMES set in types/canvassing.ts + unit test (D-18 dependency for Plan 04)
- [ ] 107-03-PLAN.md — Integration test locking empty-notes door-knock contract (D-10/D-16)
- [ ] 107-04-PLAN.md — CANV-01: D-18 hybrid advance refactor + triple-channel feedback (D-03) + ARIA live + focus management
- [ ] 107-05-PLAN.md — CANV-02: handleSkipAddress refactor per RESEARCH §2 option (c); isPending guard; Undo toast (D-06, D-07)
- [ ] 107-06-PLAN.md — CANV-03: notesRequired prop decoupling in InlineSurvey; both call sites updated per D-19; new test file
- [ ] 107-07-PLAN.md — FORMS-01: write 107-FORMS-AUDIT.md with 4-row disposition table (D-12, D-14, D-19)
- [ ] 107-08-PLAN.md — E2E spec canvassing-wizard.spec.ts covering CANV-01/02/03 + FORMS-01 D-17 via run-e2e.sh
- [ ] 107-09-PLAN.md — Phase exit gate: ruff + pytest + vitest + run-e2e.sh green; write 107-VERIFICATION-RESULTS.md

**Dependencies:** Phase 106.

#### Phase 108: House Selection & Active-State

**Goal:** Volunteers can reliably make any house active from either the list or the map, with a state machine that is the same regardless of entry point.

**Requirements:** SELECT-01, SELECT-02, SELECT-03

**Success criteria:**
1. Tapping any house in the household list sets it as the active house (SELECT-01).
2. Tapping any house marker on the map sets it as the active house (SELECT-02).
3. A documented state-machine audit covers list-tap, map-tap, auto-advance, skip, resume, and reconciliation after offline sync; the same target state is reachable from every entry point (SELECT-03).
4. Unit, integration, and E2E tests cover list-tap, map-tap, and state transitions end-to-end (TEST-01/02/03).

**Dependencies:** Phase 107.

#### Phase 109: Map Rendering & Asset Pipeline

**Goal:** Field-mode maps render correctly — no broken marker icons and no layout occluding the household list.

**Requirements:** MAP-01, MAP-02, MAP-03

**Success criteria:**
1. Leaflet marker icons render on every field-mode map view (canvassing map, walk list map, volunteer hub map) with zero broken-image placeholders (MAP-01).
2. In list view the household list is fully visible and interactable; the map no longer overlays or z-index covers it (MAP-02).
3. A map asset pipeline audit document lives in `.planning/phases/109-*` confirming every Leaflet icon, sprite, and tile asset resolves correctly under dev, preview, and production build/serve (MAP-03).
4. Unit/integration tests cover map marker rendering and layout behavior; E2E tests confirm the list-vs-map layout bug does not return (TEST-01/02/03).

**Dependencies:** Phase 108.

#### Phase 110: Offline Queue & Connectivity Hardening

**Goal:** The offline outcome queue reliably persists, replays, and reconciles outcomes on reconnect, volunteers always know their sync state, and the full v1.18 test suite gate is satisfied.

**Requirements:** OFFLINE-01, OFFLINE-02, OFFLINE-03, TEST-01/02/03 (milestone coverage anchor)

**Success criteria:**
1. Under simulated connectivity loss, outcomes persist locally and replay on reconnect with no duplication or loss (OFFLINE-01).
2. A glanceable connectivity indicator shows online / offline / syncing / last-sync-time in the field-mode shell (OFFLINE-02).
3. Sync-on-reconnect completes within a defined budget, retries server errors with backoff, and surfaces unresolvable items as actionable errors (OFFLINE-03).
4. Full milestone coverage gate: every file modified across phases 106-110 has unit + integration + E2E coverage for its changed behavior, and the full `uv run pytest`, `vitest`, and `web/scripts/run-e2e.sh` suites pass clean (TEST-01/02/03).

**Dependencies:** Phase 109.

---

_TEST-01, TEST-02, and TEST-03 are cross-cutting coverage obligations applied as explicit success criteria on every code-changing phase (107-110). They are anchored to Phase 110 in the Traceability table as the milestone-final coverage gate._
