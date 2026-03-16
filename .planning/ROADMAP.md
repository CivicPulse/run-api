# Roadmap: CivicPulse Run API

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-10)
- ✅ **v1.1 Local Dev & Deployment Readiness** — Phases 8-11 (shipped 2026-03-10)
- ✅ **v1.2 Full UI** — Phases 12-22 (shipped 2026-03-13)
- ✅ **v1.3 Voter Model & Import Enhancement** — Phases 23-29 (shipped 2026-03-15)
- 🚧 **v1.4 Volunteer Field Mode** — Phases 30-35 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Authentication and Multi-Tenancy (3/3 plans) — completed 2026-03-09
- [x] Phase 2: Voter Data Import and CRM (4/4 plans) — completed 2026-03-09
- [x] Phase 3: Canvassing Operations (4/4 plans) — completed 2026-03-09
- [x] Phase 4: Phone Banking (3/3 plans) — completed 2026-03-09
- [x] Phase 5: Volunteer Management (3/3 plans) — completed 2026-03-09
- [x] Phase 6: Operational Dashboards (2/2 plans) — completed 2026-03-09
- [x] Phase 7: Integration Wiring Fixes (1/1 plan) — completed 2026-03-10

See: `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 Local Dev & Deployment Readiness (Phases 8-11) — SHIPPED 2026-03-10</summary>

- [x] Phase 8: Containerization (2/2 plans) — completed 2026-03-10
- [x] Phase 9: Local Dev Environment (2/2 plans) — completed 2026-03-10
- [x] Phase 10: CI/CD Pipeline (1/1 plan) — completed 2026-03-10
- [x] Phase 11: Kubernetes & GitOps (2/2 plans) — completed 2026-03-10

See: `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 Full UI (Phases 12-22) — SHIPPED 2026-03-13</summary>

- [x] Phase 12: Shared Infrastructure & Campaign Foundation (3/3 plans) — completed 2026-03-10
- [x] Phase 13: Voter Management Completion (7/7 plans) — completed 2026-03-11
- [x] Phase 14: Voter Import Wizard (4/4 plans) — completed 2026-03-11
- [x] Phase 15: Call Lists & DNC Management (6/6 plans) — completed 2026-03-11
- [x] Phase 16: Phone Banking (7/7 plans) — completed 2026-03-11
- [x] Phase 17: Volunteer Management (5/5 plans) — completed 2026-03-12
- [x] Phase 18: Shift Management (4/4 plans) — completed 2026-03-12
- [x] Phase 19: Verification & Validation Gap Closure (3/3 plans) — completed 2026-03-12
- [x] Phase 20: Caller Picker UX (2/2 plans) — completed 2026-03-12
- [x] Phase 21: Integration Polish (1/1 plan) — completed 2026-03-12
- [x] Phase 22: Final Integration Fixes (1/1 plan) — completed 2026-03-13

See: `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.3 Voter Model & Import Enhancement (Phases 23-29) — SHIPPED 2026-03-15</summary>

- [x] Phase 23: Schema Foundation (2/2 plans) — completed 2026-03-13
- [x] Phase 24: Import Pipeline Enhancement (3/3 plans) — completed 2026-03-13
- [x] Phase 25: Filter Builder & Query Enhancement (2/2 plans) — completed 2026-03-14
- [x] Phase 26: Frontend Updates (4/4 plans) — completed 2026-03-14
- [x] Phase 27: Wire Advanced Filters to Backend (3/3 plans) — completed 2026-03-15
- [x] Phase 28: Filter Chips & Frontend Type Coverage (2/2 plans) — completed 2026-03-15
- [x] Phase 29: Integration Polish & Tech Debt Cleanup (2/2 plans) — completed 2026-03-15

See: `.planning/milestones/v1.3-ROADMAP.md` for full phase details.

</details>

### v1.4 Volunteer Field Mode (In Progress)

**Milestone Goal:** A dedicated, zero-training mobile-first experience for volunteers actively canvassing or phone banking in the field.

- [x] **Phase 30: Field Layout Shell & Volunteer Landing** - Mobile shell layout with no admin chrome, assignment-aware volunteer hub (completed 2026-03-15)
- [x] **Phase 31: Canvassing Wizard** - Linear door-to-door wizard with household grouping, inline survey, persistent state, and shared field components (completed 2026-03-15)
- [x] **Phase 32: Phone Banking Field Mode** - Mobile calling experience with tap-to-call, outcome recording, and inline survey reuse (completed 2026-03-15)
- [ ] **Phase 33: Offline Queue & Sync** - Local outcome queue with automatic sync on connectivity resume
- [ ] **Phase 34: Guided Onboarding Tour** - Step-by-step driver.js tour with per-segment completion and replay
- [ ] **Phase 35: Accessibility Audit & Polish** - WCAG compliance sweep, milestone celebrations, and touch target verification

## Phase Details

### Phase 30: Field Layout Shell & Volunteer Landing
**Goal**: Volunteers can enter field mode and see their active assignment without encountering any admin UI
**Depends on**: Nothing (first phase of v1.4; builds on v1.2 frontend infrastructure)
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04
**Success Criteria** (what must be TRUE):
  1. Volunteer navigating to /field sees a mobile-optimized layout with no sidebar, no admin navigation, and no data tables
  2. Volunteer sees their active assignment (canvassing or phone banking) on the landing page and can tap to enter it
  3. Volunteer can navigate back to the landing hub from any field screen via a persistent back control
  4. Volunteer sees a help button in the field header (wired to tour replay in Phase 34; renders as disabled/placeholder until then)
**Plans**: 3 plans

Plans:
- [ ] 30-01-PLAN.md — Backend field/me endpoint and frontend data layer (types + hook)
- [ ] 30-02-PLAN.md — Field layout shell, FieldHeader, and placeholder sub-routes
- [ ] 30-03-PLAN.md — Landing hub page with assignment cards and volunteer auto-redirect

### Phase 31: Canvassing Wizard
**Goal**: Volunteers can work through an entire walk list door-by-door from their phone, recording outcomes and answering surveys without losing progress
**Depends on**: Phase 30
**Requirements**: CANV-01, CANV-02, CANV-03, CANV-04, CANV-05, CANV-06, CANV-07, CANV-08, A11Y-04
**Success Criteria** (what must be TRUE):
  1. Volunteer sees the next address with voter name, party, and propensity context, and multiple voters at the same address are grouped by household
  2. Volunteer records a door-knock outcome via large touch-target buttons and automatically advances to the next door
  3. Volunteer can answer inline survey questions after a "Contact Made" outcome, with the option to skip
  4. Volunteer sees progress ("12 of 47 doors") and can resume where they left off after a phone interruption or app switch
  5. Screen reader users hear state transitions announced via ARIA live regions as the wizard advances between doors
**Plans**: 5 plans

Plans:
- [ ] 31-01-PLAN.md — Backend enriched entries endpoint + frontend types, Zustand store, React Query hooks
- [ ] 31-02-PLAN.md — Shared field components: OutcomeGrid, VoterCard, HouseholdCard, FieldProgress
- [ ] 31-03-PLAN.md — Canvassing wizard route with household navigation, outcome recording, auto-advance
- [ ] 31-04-PLAN.md — InlineSurvey, ResumePrompt, DoorListView + ARIA live regions
- [ ] 31-05-PLAN.md — Playwright e2e tests and Vitest unit tests for all requirements

### Phase 32: Phone Banking Field Mode
**Goal**: Volunteers can work through a phone banking session from their phone, calling voters and recording outcomes without switching between apps
**Depends on**: Phase 31 (reuses OutcomeGrid, InlineSurvey, FieldProgress, VoterCard components)
**Requirements**: PHONE-01, PHONE-02, PHONE-03, PHONE-04, PHONE-05, PHONE-06, PHONE-07, A11Y-05
**Success Criteria** (what must be TRUE):
  1. Volunteer can start and stop a phone banking session with obvious, large controls
  2. Volunteer taps a phone number to call via the native dialer, or copies it to clipboard as a fallback
  3. Volunteer records call outcome via large touch-target buttons and can answer inline survey questions after a contact
  4. Volunteer sees session progress (calls completed / remaining) and phone numbers are displayed in readable format while dialing uses E.164
  5. Phone banking caller info and outcome buttons are usable by screen reader users without relying on visual context
**Plans**: 3 plans

Plans:
- [ ] 32-01-PLAN.md — Calling types, Zustand store, OutcomeGrid generalization
- [ ] 32-02-PLAN.md — Orchestrator hook, CallingVoterCard, PhoneNumberList, CompletionSummary, phone-banking route
- [ ] 32-03-PLAN.md — Playwright e2e tests and Vitest unit tests for all requirements

### Phase 33: Offline Queue & Sync
**Goal**: Volunteers can continue recording outcomes when they lose cell signal, and their data syncs automatically when connectivity returns
**Depends on**: Phase 31, Phase 32 (queues outcomes from both canvassing and phone banking)
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05
**Success Criteria** (what must be TRUE):
  1. Volunteer can record door-knock and phone banking outcomes while offline; they queue locally without error
  2. Queued interactions automatically sync to the server when connectivity resumes, without volunteer intervention
  3. Volunteer sees a visible offline indicator when connectivity is lost and it disappears when connectivity returns
  4. Volunteer receives updated walk list status (houses contacted by others) when connectivity resumes
**Plans**: 2 plans

Plans:
- [ ] 33-01-PLAN.md — Offline queue store, connectivity hook, and OfflineBanner component
- [ ] 33-02-PLAN.md — Sync engine, mutation interception in orchestrator hooks, field layout wiring

### Phase 34: Guided Onboarding Tour
**Goal**: Volunteers understand how to use field mode without any training or documentation
**Depends on**: Phase 30, Phase 31, Phase 32 (tour targets elements on all field screens)
**Requirements**: TOUR-01, TOUR-02, TOUR-03, TOUR-04, TOUR-05, TOUR-06
**Success Criteria** (what must be TRUE):
  1. Volunteer sees a guided step-by-step tour on first visit that walks through field mode capabilities
  2. Tour runs in contextual segments (welcome, canvassing, phone banking) so each segment targets only screens the volunteer is on
  3. Tour only runs once per volunteer per campaign and the completion state persists across sessions
  4. Volunteer can replay the tour at any time via the help button and sees contextual tooltip icons on key actions
  5. Volunteer sees brief quick-start instructions before beginning canvassing or phone banking
**Plans**: TBD

Plans:
- [ ] 34-01: TBD
- [ ] 34-02: TBD

### Phase 35: Accessibility Audit & Polish
**Goal**: Field mode meets WCAG AA standards and delights volunteers with milestone celebrations and rich voter context
**Depends on**: Phase 31, Phase 32, Phase 33, Phase 34 (final pass over all field screens)
**Requirements**: A11Y-01, A11Y-02, A11Y-03, POLISH-01, POLISH-02, POLISH-03
**Success Criteria** (what must be TRUE):
  1. All field mode screens are navigable via screen reader with proper ARIA labels, roles, and live regions
  2. All interactive elements meet WCAG 2.5.5 minimum touch target size (44x44px) and WCAG AA color contrast, verified via audit
  3. Volunteer sees milestone celebration toasts at 25%, 50%, 75%, and 100% completion of their assignment
  4. Voter context card shows name, party, age, and propensity before each interaction in both canvassing and phone banking
**Plans**: TBD

Plans:
- [ ] 35-01: TBD
- [ ] 35-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 30 → 31 → 32 → 33 → 34 → 35

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Authentication and Multi-Tenancy | v1.0 | 3/3 | Complete | 2026-03-09 |
| 2. Voter Data Import and CRM | v1.0 | 4/4 | Complete | 2026-03-09 |
| 3. Canvassing Operations | v1.0 | 4/4 | Complete | 2026-03-09 |
| 4. Phone Banking | v1.0 | 3/3 | Complete | 2026-03-09 |
| 5. Volunteer Management | v1.0 | 3/3 | Complete | 2026-03-09 |
| 6. Operational Dashboards | v1.0 | 2/2 | Complete | 2026-03-09 |
| 7. Integration Wiring Fixes | v1.0 | 1/1 | Complete | 2026-03-10 |
| 8. Containerization | v1.1 | 2/2 | Complete | 2026-03-10 |
| 9. Local Dev Environment | v1.1 | 2/2 | Complete | 2026-03-10 |
| 10. CI/CD Pipeline | v1.1 | 1/1 | Complete | 2026-03-10 |
| 11. Kubernetes & GitOps | v1.1 | 2/2 | Complete | 2026-03-10 |
| 12. Shared Infrastructure & Campaign Foundation | v1.2 | 3/3 | Complete | 2026-03-10 |
| 13. Voter Management Completion | v1.2 | 7/7 | Complete | 2026-03-11 |
| 14. Voter Import Wizard | v1.2 | 4/4 | Complete | 2026-03-11 |
| 15. Call Lists & DNC Management | v1.2 | 6/6 | Complete | 2026-03-11 |
| 16. Phone Banking | v1.2 | 7/7 | Complete | 2026-03-11 |
| 17. Volunteer Management | v1.2 | 5/5 | Complete | 2026-03-12 |
| 18. Shift Management | v1.2 | 4/4 | Complete | 2026-03-12 |
| 19. Verification & Validation Gap Closure | v1.2 | 3/3 | Complete | 2026-03-12 |
| 20. Caller Picker UX | v1.2 | 2/2 | Complete | 2026-03-12 |
| 21. Integration Polish | v1.2 | 1/1 | Complete | 2026-03-12 |
| 22. Final Integration Fixes | v1.2 | 1/1 | Complete | 2026-03-13 |
| 23. Schema Foundation | v1.3 | 2/2 | Complete | 2026-03-13 |
| 24. Import Pipeline Enhancement | v1.3 | 3/3 | Complete | 2026-03-13 |
| 25. Filter Builder & Query Enhancement | v1.3 | 2/2 | Complete | 2026-03-14 |
| 26. Frontend Updates | v1.3 | 4/4 | Complete | 2026-03-14 |
| 27. Wire Advanced Filters to Backend | v1.3 | 3/3 | Complete | 2026-03-15 |
| 28. Filter Chips & Frontend Type Coverage | v1.3 | 2/2 | Complete | 2026-03-15 |
| 29. Integration Polish & Tech Debt Cleanup | v1.3 | 2/2 | Complete | 2026-03-15 |
| 30. Field Layout Shell & Volunteer Landing | 3/3 | Complete    | 2026-03-15 | - |
| 31. Canvassing Wizard | 5/5 | Complete    | 2026-03-15 | - |
| 32. Phone Banking Field Mode | 3/3 | Complete    | 2026-03-15 | - |
| 33. Offline Queue & Sync | v1.4 | 0/2 | Not started | - |
| 34. Guided Onboarding Tour | v1.4 | 0/0 | Not started | - |
| 35. Accessibility Audit & Polish | v1.4 | 0/0 | Not started | - |

### Phase 36: Google Maps Navigation Link for Canvassing

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 35
**Plans:** 3/3 plans complete

Plans:
- [ ] TBD (run /gsd:plan-phase 36 to break down)
