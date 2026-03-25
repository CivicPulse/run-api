# Roadmap: CivicPulse Run API

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-10)
- ✅ **v1.1 Local Dev & Deployment Readiness** — Phases 8-11 (shipped 2026-03-10)
- ✅ **v1.2 Full UI** — Phases 12-22 (shipped 2026-03-13)
- ✅ **v1.3 Voter Model & Import Enhancement** — Phases 23-29 (shipped 2026-03-15)
- ✅ **v1.4 Volunteer Field Mode** — Phases 30-38 (shipped 2026-03-17)
- 🚧 **v1.5 Go Live — Production Readiness** — Phases 39-46 (in progress)

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

<details>
<summary>✅ v1.4 Volunteer Field Mode (Phases 30-38) — SHIPPED 2026-03-17</summary>

- [x] Phase 30: Field Layout Shell & Volunteer Landing (3/3 plans) — completed 2026-03-15
- [x] Phase 31: Canvassing Wizard (5/5 plans) — completed 2026-03-15
- [x] Phase 32: Phone Banking Field Mode (3/3 plans) — completed 2026-03-15
- [x] Phase 33: Offline Queue & Sync (2/2 plans) — completed 2026-03-16
- [x] Phase 34: Guided Onboarding Tour (4/4 plans) — completed 2026-03-16
- [x] Phase 35: Accessibility Audit & Polish (4/4 plans) — completed 2026-03-16
- [x] Phase 36: Google Maps Navigation Link (2/2 plans) — completed 2026-03-16
- [x] Phase 37: Offline Sync Integration Fixes (1/1 plan) — completed 2026-03-16
- [x] Phase 38: Tech Debt Cleanup (2/2 plans) — completed 2026-03-17

See: `.planning/milestones/v1.4-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.5 Go Live — Production Readiness (In Progress)

**Milestone Goal:** Fix critical data isolation and auth bugs, ship organization management UI and map-based turf editor, audit full app for WCAG compliance and usability, then harden with observability and E2E test coverage before onboarding real users.

- [x] **Phase 39: RLS Fix & Multi-Campaign Foundation** - Fix active multi-tenant data leak and campaign visibility bugs (completed 2026-03-24)
- [x] **Phase 40: Production Hardening & Observability** - Sentry error tracking, structured logging, correct rate limiting (completed 2026-03-24)
- [x] **Phase 41: Organization Data Model & Auth** - Backend org membership table, role resolution, and API endpoints (completed 2026-03-24)
- [x] **Phase 42: Map-Based Turf Editor** - Interactive Leaflet/Geoman polygon draw/edit replacing raw JSON textarea (completed 2026-03-24)
- [x] **Phase 43: Organization UI** - Org dashboard, member directory, campaign creation wizard, settings (completed 2026-03-24)
- [x] **Phase 44: UI/UX Polish & Frontend Hardening** - Sidebar redesign, help text, error/empty/loading states (completed 2026-03-24)
- [x] **Phase 45: WCAG Compliance Audit** - Automated axe-core scan and manual screen reader testing on all admin pages (completed 2026-03-25)
- [ ] **Phase 46: E2E Testing & Integration** - Playwright critical flows, pending integration tests, RLS isolation suite

## Phase Details

### Phase 39: RLS Fix & Multi-Campaign Foundation
**Goal**: All campaign data is correctly isolated — no voter, voter list, or campaign data leaks across campaign boundaries via connection pool reuse or auth bugs
**Depends on**: Phase 38 (v1.4 complete)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06
**Success Criteria** (what must be TRUE):
  1. Two users in different campaigns on the same org cannot see each other's voters, even under concurrent connection pool reuse
  2. A user with membership in multiple campaigns sees only the active campaign's data on every page
  3. Campaign list page displays all campaigns the authenticated user has membership in (not just the most recent)
  4. Settings button on the campaign page navigates correctly to campaign settings
**Plans:** 4/4 plans complete
Plans:
- [x] 39-01-PLAN.md — Fix RLS set_config transaction scoping & pool checkout event (DATA-01, DATA-02)
- [x] 39-02-PLAN.md — Centralize RLS context into get_campaign_db dependency (DATA-03)
- [x] 39-03-PLAN.md — Fix multi-campaign membership & data migration (DATA-04, DATA-05)
- [ ] 39-04-PLAN.md — Settings button guard & human verification (DATA-06)

### Phase 40: Production Hardening & Observability
**Goal**: Production errors are captured with full context, requests are traced end-to-end, and rate limiting uses real client IPs
**Depends on**: Phase 39
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04
**Success Criteria** (what must be TRUE):
  1. Unhandled API exceptions appear in Sentry within 30 seconds, with request_id and user_id but without voter PII in the error payload
  2. Every API request emits a structured JSON log line containing request_id, user_id, campaign_id, HTTP method/path, and duration
  3. Rate limiting correctly identifies distinct users behind a shared NAT/proxy (using CF-Connecting-IP, not request.client.host)
  4. Authenticated endpoints enforce per-user rate limits that cannot be bypassed by rotating IP addresses
**Plans**: TBD
This won't work, using python instead

### Phase 41: Organization Data Model & Auth
**Goal**: The backend supports org-level roles and multi-campaign membership with correct permission resolution
**Depends on**: Phase 39
**Requirements**: ORG-01, ORG-02, ORG-03, ORG-04
**Success Criteria** (what must be TRUE):
  1. An org_owner can call org-level API endpoints and receives data spanning all campaigns in the org
  2. A user with org_admin role and no explicit campaign role can access any campaign in the org with admin-equivalent permissions
  3. Org role is additive — a user with campaign-level "viewer" and org-level "admin" resolves to admin, never viewer
  4. Non-org-admin users receive 403 on org-level endpoints
**Plans**: 3 plans
Plans:
- [x] 41-01-PLAN.md — OrganizationMember model, OrgRole enum, Alembic migration (ORG-01, ORG-02)
- [ ] 41-02-PLAN.md — Modify resolve_campaign_role() with additive org role resolution (ORG-03)
- [ ] 41-03-PLAN.md — require_org_role() dependency, org service, org API endpoints (ORG-04)

### Phase 42: Map-Based Turf Editor
**Goal**: Campaign managers can draw, edit, and manage turf boundaries visually on an interactive map instead of pasting raw GeoJSON
**Depends on**: Phase 39
**Requirements**: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08, MAP-09, MAP-10, MAP-11
**Success Criteria** (what must be TRUE):
  1. User can draw a polygon on the map and save it as a new turf — the boundary round-trips correctly through the backend and renders on reload
  2. User can edit an existing turf by dragging vertices, and the updated boundary persists
  3. Overview map displays all campaign turfs color-coded by status with voter count badges
  4. User can import a .geojson file, preview the boundary on the map, and save it as a turf
  5. Power users can toggle to an "Advanced" raw JSON textarea and edit the GeoJSON directly
**Plans**: 4 plans
Plans:
- [x] 42-01-PLAN.md — Backend voter_count, voters-by-turf, overlap detection endpoints (MAP-05, MAP-04, MAP-10)
- [x] 42-02-PLAN.md — Map foundation: MapProvider, GeomanControl, TurfMapEditor (MAP-01, MAP-02, MAP-08)
- [ ] 42-03-PLAN.md — Overview map with color-coded turfs and voter markers (MAP-03, MAP-04, MAP-05, MAP-11)
- [ ] 42-04-PLAN.md — GeoJSON import/export, address search, overlap highlight (MAP-06, MAP-07, MAP-09)
**UI hint**: yes

### Phase 43: Organization UI
**Goal**: Org admins can manage campaigns, members, and settings from an organization-level dashboard
**Depends on**: Phase 41
**Requirements**: ORG-05, ORG-06, ORG-07, ORG-08, ORG-09, ORG-10, ORG-11, ORG-12, ORG-13
**Success Criteria** (what must be TRUE):
  1. Org dashboard at /org displays a card grid of all campaigns with status, election date, and member counts
  2. Org member directory shows every user across all campaigns with a per-campaign role matrix
  3. Only org_admin+ users see the "New Campaign" button, and the creation wizard walks through name/type/jurisdiction steps
  4. Org owner can edit org name and view the ZITADEL org ID on the settings page
**Plans**: 5 plans
Plans:
- [x] 43-01-PLAN.md — Backend endpoints + frontend types, hooks, RequireOrgRole, authStore switchOrg (ORG-05, ORG-09, ORG-10, ORG-12, ORG-13)
- [x] 43-02-PLAN.md — Org dashboard, campaign cards, archive flow, org switcher (ORG-05, ORG-07, ORG-11, ORG-12, ORG-13)
- [x] 43-03-PLAN.md — Campaign creation wizard with team invite (ORG-08, ORG-10)
- [x] 43-04-PLAN.md — Member directory with role matrix, org settings page (ORG-06, ORG-09, ORG-10)
- [x] 43-05-PLAN.md — Gap closure: fix sidebar nav absent on org-level pages (ORG-05, ORG-06, ORG-09)
**UI hint**: yes

### Phase 44: UI/UX Polish & Frontend Hardening
**Goal**: The application handles all edge states gracefully and provides contextual guidance for new users
**Depends on**: Phase 42, Phase 43
**Requirements**: UX-01, UX-02, UX-03, UX-04, OBS-05, OBS-06, OBS-07
**Success Criteria** (what must be TRUE):
  1. Sidebar slides over content (not pushes) with a consolidated single-level navigation menu
  2. Volunteer creation page clearly distinguishes between adding a tracked-only volunteer record and sending a ZITADEL invite for app access
  3. Every list page shows a meaningful empty state message when no data exists (not a blank table)
  4. Every data-loading page shows a loading skeleton or spinner during fetch (no layout shift)
  5. Contextual tooltips and inline hints appear at key decision points (turf sizing, role assignment, import column mapping)
**Plans**: 5 plans
Plans:
- [x] 44-01-PLAN.md — Error boundaries + sidebar offcanvas (OBS-05, UX-01)
- [x] 44-02-PLAN.md — Volunteer invite toggle + contextual tooltips (UX-02, UX-03, UX-04)
- [x] 44-03-PLAN.md — Empty state audit + loading skeleton replacement (OBS-06, OBS-07)
- [x] 44-04-PLAN.md — Human verification of all UI/UX changes
- [x] 44-05-PLAN.md — Gap closure: org tooltip, empty state wording, error boundaries (UX-03, UX-04, OBS-05, OBS-06)
**UI hint**: yes

### Phase 45: WCAG Compliance Audit
**Goal**: All admin pages meet WCAG AA accessibility standards, verified by automated scanning and manual screen reader testing
**Depends on**: Phase 44
**Requirements**: A11Y-01, A11Y-02, A11Y-03, A11Y-04
**Success Criteria** (what must be TRUE):
  1. axe-core automated scan passes on every admin route with zero critical or serious violations
  2. Screen reader (NVDA or VoiceOver) can complete 5 critical flows: voter search, voter import, walk list creation, phone bank session, campaign settings
  3. Every interactive component is reachable and operable via keyboard alone, with visible focus indicators and no focus traps
  4. Map component has a skip-nav link and all turf CRUD operations work without the map via the JSON fallback
**Plans**: 4 plans
Plans:
- [x] 45-01-PLAN.md — Shared a11y components, root layout landmarks, theme contrast, axe fixture (A11Y-03)
- [x] 45-02-PLAN.md — Map skip-nav link, GeoJSON panel ARIA attributes, turf page headings (A11Y-04)
- [x] 45-03-PLAN.md — Parameterized axe-core route scan + violation remediation (A11Y-01)
- [x] 45-04-PLAN.md — Screen reader flow tests for 5 critical flows (A11Y-02, A11Y-03)
**UI hint**: yes

### Phase 46: E2E Testing & Integration
**Goal**: Critical user flows are covered by automated Playwright tests and all pending integration tests pass against live infrastructure
**Depends on**: Phase 45
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Playwright E2E tests pass for login, voter search, voter import, turf creation, phone bank session, and volunteer signup flows
  2. All 18 pending integration tests from v1.0 pass against live PostgreSQL, PostGIS, MinIO, and ZITADEL
  3. Cross-campaign RLS isolation test suite verifies zero data leaks across 6 isolation dimensions (voters, voter lists, turfs, walk lists, call lists, phone bank sessions)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 39 → 40 → 41 → 42 → 43 → 44 → 45 → 46

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
| 30. Field Layout Shell & Volunteer Landing | v1.4 | 3/3 | Complete | 2026-03-15 |
| 31. Canvassing Wizard | v1.4 | 5/5 | Complete | 2026-03-15 |
| 32. Phone Banking Field Mode | v1.4 | 3/3 | Complete | 2026-03-15 |
| 33. Offline Queue & Sync | v1.4 | 2/2 | Complete | 2026-03-16 |
| 34. Guided Onboarding Tour | v1.4 | 4/4 | Complete | 2026-03-16 |
| 35. Accessibility Audit & Polish | v1.4 | 4/4 | Complete | 2026-03-16 |
| 36. Google Maps Navigation Link | v1.4 | 2/2 | Complete | 2026-03-16 |
| 37. Offline Sync Integration Fixes | v1.4 | 1/1 | Complete | 2026-03-16 |
| 38. Tech Debt Cleanup | v1.4 | 2/2 | Complete | 2026-03-17 |
| 39. RLS Fix & Multi-Campaign Foundation | v1.5 | 3/4 | Complete    | 2026-03-24 |
| 40. Production Hardening & Observability | v1.5 | 1/2 | Complete    | 2026-03-24 |
| 41. Organization Data Model & Auth | v1.5 | 1/3 | Complete    | 2026-03-24 |
| 42. Map-Based Turf Editor | v1.5 | 2/4 | Complete    | 2026-03-24 |
| 43. Organization UI | v1.5 | 5/5 | Complete    | 2026-03-24 |
| 44. UI/UX Polish & Frontend Hardening | v1.5 | 5/5 | Complete    | 2026-03-24 |
| 45. WCAG Compliance Audit | v1.5 | 4/4 | Complete    | 2026-03-25 |
| 46. E2E Testing & Integration | v1.5 | 0/0 | Not started | - |
