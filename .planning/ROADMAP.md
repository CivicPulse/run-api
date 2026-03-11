# Roadmap: CivicPulse Run API

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-10)
- ✅ **v1.1 Local Dev & Deployment Readiness** — Phases 8-11 (shipped 2026-03-10)
- 🚧 **v1.2 Full UI** — Phases 12-18 (in progress)

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

### 🚧 v1.2 Full UI (In Progress)

**Milestone Goal:** Build complete UI coverage for all ~95 API endpoints that currently lack pages, closing the gap between backend capabilities and user-facing functionality.

- [x] **Phase 12: Shared Infrastructure & Campaign Foundation** - Permission system, shared components, form guards, campaign settings and member management (completed 2026-03-10)
- [x] **Phase 13: Voter Management Completion** - Contacts, tags, lists, create/edit, advanced search, interaction notes (completed 2026-03-11)
- [x] **Phase 14: Voter Import Wizard** - Multi-step file upload, column mapping, preview, progress tracking, import history (completed 2026-03-11)
- [x] **Phase 15: Call Lists & DNC Management** - Call list CRUD with DNC filtering, DNC list management with bulk import (completed 2026-03-11)
- [ ] **Phase 16: Phone Banking** - Session management, caller assignment, active calling experience, progress dashboards
- [ ] **Phase 17: Volunteer Management** - Volunteer roster, profiles, availability, tags, self-registration, hours tracking
- [ ] **Phase 18: Shift Management** - Shift CRUD, signup/assignment, check-in/out, roster, hours adjustment

## Phase Details

### Phase 12: Shared Infrastructure & Campaign Foundation
**Goal**: Users can manage campaign settings and team members, and all subsequent UI phases have shared components, permission gating, and form protection patterns to build on
**Depends on**: Phase 11 (v1.1 complete)
**Requirements**: INFR-01, INFR-02, INFR-03, CAMP-01, CAMP-02, CAMP-03, CAMP-04, CAMP-05, CAMP-06, CAMP-07, CAMP-08
**Success Criteria** (what must be TRUE):
  1. UI elements (buttons, menu items, form fields) appear or hide based on the logged-in user's campaign role — a viewer cannot see edit/delete actions that an admin sees
  2. User is prompted with an unsaved changes warning when navigating away from any form with modified fields, and can choose to stay or discard
  3. Data tables across the application display consistent sorting controls, filter inputs, pagination, and empty state messages
  4. Campaign owner can edit campaign details, invite members by email, view pending invites, change member roles, remove members, and transfer ownership — all from the campaign settings area
  5. Campaign owner can delete a campaign with a confirmation step that prevents accidental deletion
**Plans:** 3/3 plans complete

Plans:
- [ ] 12-01-PLAN.md — Shared UI infrastructure (usePermissions, RequireRole, useFormGuard, DataTable)
- [ ] 12-02-PLAN.md — Campaign settings structure, General tab, and Danger Zone
- [ ] 12-03-PLAN.md — Campaign members and invites management

### Phase 13: Voter Management Completion
**Goal**: Users have a complete voter CRM experience — viewing, creating, editing, and organizing voters with contacts, tags, lists, search, and interaction notes
**Depends on**: Phase 12
**Requirements**: VOTR-01, VOTR-02, VOTR-03, VOTR-04, VOTR-05, VOTR-06, VOTR-07, VOTR-08, VOTR-09, VOTR-10, VOTR-11
**Success Criteria** (what must be TRUE):
  1. User can open a voter detail page and manage phone numbers, email addresses, and mailing addresses — including adding, editing, deleting contacts and setting a primary contact per type
  2. User can create a new voter record and edit existing voter records through forms with validation
  3. User can create/manage campaign-level tags and apply or remove tags on individual voters
  4. User can create static voter lists (manually adding members), create dynamic voter lists (defining filter criteria that auto-populate), and view list detail with member management
  5. User can use an advanced search interface with composable filters (demographics, voting history, tags, location) to find specific voters and add interaction notes on voter detail pages
**Plans:** 7/7 plans complete

Plans:
- [ ] 13-01-PLAN.md — Hook bug fixes (set-primary URL, voter-lists URL, tag add body), VoterFilter type expansion, Wave 0 test scaffolds
- [ ] 13-02-PLAN.md — Voters layout scaffold (voters.tsx layout + route stubs for lists/ and tags/ + sidebar nav)
- [ ] 13-03-PLAN.md — Voters index upgrade (DataTable + VoterFilterBuilder collapsible panel + New Voter sheet)
- [ ] 13-04-PLAN.md — Voter detail sub-tabs: Overview, Contacts tab (inline add/edit/set-primary), Tags tab
- [ ] 13-05-PLAN.md — Voter detail History tab (notes list + add note form) + Edit Voter sheet with useFormGuard
- [ ] 13-06-PLAN.md — Voter Lists route: lists index DataTable + static/dynamic list detail + AddVotersDialog
- [ ] 13-07-PLAN.md — Campaign Tags route (CRUD DataTable) + visual verification checkpoint

### Phase 14: Voter Import Wizard
**Goal**: Users can import voter data files into the system through a guided multi-step wizard with automatic column detection, manual mapping adjustments, progress tracking, and the ability to resume interrupted imports
**Depends on**: Phase 13
**Requirements**: IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05, IMPT-06, IMPT-07
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop a CSV file (or click to browse) to upload it, and the system begins processing the file with visible upload progress
  2. User sees auto-detected column mappings with suggestions from the backend, and can manually adjust mappings via drag-and-drop before confirming
  3. User can preview a sample of mapped data (showing how source columns map to voter fields) before confirming the import
  4. User can monitor import progress in real-time showing row counts, percentage complete, and error counts — and can view a history of all past imports with their statuses
  5. User can navigate away from an in-progress import wizard and return to resume at the correct step
**Plans:** 4/4 plans complete

Plans:
- [ ] 14-01-PLAN.md — Wave 0 types, test scaffolds, shadcn Progress install
- [ ] 14-02-PLAN.md — useImports hook, uploadToMinIO helper, deriveStep function
- [ ] 14-03-PLAN.md — Import wizard route and step components (upload, mapping, preview, progress)
- [ ] 14-04-PLAN.md — Import history page, sidebar nav update, visual checkpoint

### Phase 15: Call Lists & DNC Management
**Goal**: Users can create and manage call lists from voter universes with DNC filtering, and maintain a campaign DNC list through individual additions, bulk imports, and lookups
**Depends on**: Phase 13
**Requirements**: CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, CALL-07, CALL-08
**Success Criteria** (what must be TRUE):
  1. User can create a call list from a voter universe, with DNC numbers automatically filtered out, and can edit or delete existing call lists
  2. User can view call list detail showing all entries with their current statuses (unclaimed, claimed, completed, skipped)
  3. User can view the campaign DNC list, add individual phone numbers, and remove numbers from the list
  4. User can bulk import DNC numbers from a file and check whether a specific phone number is on the DNC list
**Plans:** 6/6 plans complete

Plans:
- [ ] 15-01-PLAN.md — Backend gaps (CallListUpdate schema, PATCH body, GET /entries endpoint) + Wave 0 test scaffolds
- [ ] 15-02-PLAN.md — Type files, hook files (useCallLists, useDNC), phone-banking.tsx sidebar layout + redirect
- [ ] 15-03-PLAN.md — Call lists index (DataTable, create/edit dialog with advanced settings, delete)
- [ ] 15-04-PLAN.md — Call list detail (stats chips, entries DataTable with status filter tabs, voter links)
- [ ] 15-05-PLAN.md — DNC list page (table, add dialog, import dialog, client-side search)
- [ ] 15-06-PLAN.md — Full test suite + visual verification checkpoint

### Phase 16: Phone Banking
**Goal**: Users can run complete phone banking sessions — creating sessions with call lists and surveys, managing callers, and using an active calling screen where callers claim voters, view contact info and survey scripts, record outcomes, and track session progress
**Depends on**: Phase 15
**Requirements**: PHON-01, PHON-02, PHON-03, PHON-04, PHON-05, PHON-06, PHON-07, PHON-08, PHON-09, PHON-10
**Success Criteria** (what must be TRUE):
  1. User can create a phone bank session selecting a call list and survey, and manage its lifecycle through draft, active, and complete status transitions
  2. User can assign callers to a session, and callers can check in and check out of sessions
  3. Caller can use the active calling screen to claim the next voter, see voter details and contact info, read through the survey script, and record call outcomes with quick-select buttons — then automatically advance to the next call
  4. Caller can skip or release a claimed entry, and a manager can reassign entries to other callers
  5. User can view a session progress dashboard showing completion percentage, outcome breakdown, and caller activity
**Plans:** 6/7 plans executed

Plans:
- [ ] 16-01-PLAN.md — Backend gaps (self-release, callers list, assigned_to_me filter, caller_count) + Wave 0 test scaffolds
- [ ] 16-02-PLAN.md — TypeScript types, session hooks, and sidebar nav update
- [ ] 16-03-PLAN.md — Sessions index page with SessionDialog (create/edit/delete)
- [ ] 16-04-PLAN.md — Session detail page (Overview tab + Progress tab with polling)
- [ ] 16-05-PLAN.md — My Sessions caller dashboard
- [ ] 16-06-PLAN.md — Active calling screen (claim lifecycle, outcomes, survey, skip)
- [ ] 16-07-PLAN.md — Full test suite verification + visual checkpoint

### Phase 17: Volunteer Management
**Goal**: Users can manage a complete volunteer roster with profiles, availability slots, tags, and hours tracking — and volunteers can self-register through a dedicated flow
**Depends on**: Phase 12
**Requirements**: VLTR-01, VLTR-02, VLTR-03, VLTR-04, VLTR-05, VLTR-06, VLTR-07, VLTR-08, VLTR-09
**Success Criteria** (what must be TRUE):
  1. User can view a filterable volunteer roster and open volunteer detail pages showing profile info, availability, shift history, and hours
  2. User can create new volunteer records and edit existing volunteer profiles and statuses
  3. Volunteer can self-register through a registration flow that creates their volunteer record
  4. User can manage volunteer availability by adding and removing time slots, and manage campaign-level volunteer tags with per-volunteer tag assignment
  5. User can view a volunteer's accumulated hours and shift history
**Plans:** 7 plans

Plans:
- [ ] 16-01-PLAN.md — Backend gaps (self-release, callers list, assigned_to_me filter, caller_count) + Wave 0 test scaffolds
- [ ] 16-02-PLAN.md — TypeScript types, session hooks, and sidebar nav update
- [ ] 16-03-PLAN.md — Sessions index page with SessionDialog (create/edit/delete)
- [ ] 16-04-PLAN.md — Session detail page (Overview tab + Progress tab with polling)
- [ ] 16-05-PLAN.md — My Sessions caller dashboard
- [ ] 16-06-PLAN.md — Active calling screen (claim lifecycle, outcomes, survey, skip)
- [ ] 16-07-PLAN.md — Full test suite verification + visual checkpoint

### Phase 18: Shift Management
**Goal**: Users can create and manage shifts with scheduling, volunteer signup and assignment, check-in/out tracking, roster views, and post-shift hours adjustment
**Depends on**: Phase 17
**Requirements**: SHFT-01, SHFT-02, SHFT-03, SHFT-04, SHFT-05, SHFT-06, SHFT-07, SHFT-08, SHFT-09, SHFT-10
**Success Criteria** (what must be TRUE):
  1. User can create shifts specifying date, time, location, capacity, and type — and can edit, delete, and manage shift status transitions
  2. User can view shifts in a date-grouped list showing upcoming and past shifts with their statuses and capacity
  3. Volunteer can sign up for available shifts (respecting capacity limits and waitlists) and cancel their signup, and managers can assign volunteers to shifts directly
  4. Manager can check in and check out volunteers at shifts, view a shift roster with each volunteer's status, and adjust volunteer hours after a shift completes
**Plans:** 7 plans

Plans:
- [ ] 16-01-PLAN.md — Backend gaps (self-release, callers list, assigned_to_me filter, caller_count) + Wave 0 test scaffolds
- [ ] 16-02-PLAN.md — TypeScript types, session hooks, and sidebar nav update
- [ ] 16-03-PLAN.md — Sessions index page with SessionDialog (create/edit/delete)
- [ ] 16-04-PLAN.md — Session detail page (Overview tab + Progress tab with polling)
- [ ] 16-05-PLAN.md — My Sessions caller dashboard
- [ ] 16-06-PLAN.md — Active calling screen (claim lifecycle, outcomes, survey, skip)
- [ ] 16-07-PLAN.md — Full test suite verification + visual checkpoint

## Progress

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
| 13. Voter Management Completion | 7/7 | Complete   | 2026-03-11 | - |
| 14. Voter Import Wizard | 4/4 | Complete    | 2026-03-11 | - |
| 15. Call Lists & DNC Management | 6/6 | Complete   | 2026-03-11 | - |
| 16. Phone Banking | 6/7 | In Progress|  | - |
| 17. Volunteer Management | v1.2 | 0/? | Not started | - |
| 18. Shift Management | v1.2 | 0/? | Not started | - |
