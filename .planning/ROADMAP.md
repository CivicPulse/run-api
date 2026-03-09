# Roadmap: CivicPulse Run API

## Overview

This roadmap delivers a multi-tenant campaign field operations API from foundation to operational dashboards. The build order follows a strict dependency chain: campaign tenancy and auth must exist before any data is created, voter data must exist before field operations can target it, and dashboards aggregate results from field operations. The six phases move from infrastructure (auth, multi-tenancy) through data (voter import, CRM) to operations (canvassing, phone banking, volunteers) to visibility (dashboards).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Authentication and Multi-Tenancy** - ZITADEL auth, campaign CRUD, RLS isolation, and role-based access control
- [ ] **Phase 2: Voter Data Import and CRM** - Voter file import pipeline, canonical voter model, search/filtering, tagging, and interaction history
- [x] **Phase 3: Canvassing Operations** - Turf cutting, walk list generation, door-knock recording, survey scripts, and canvasser assignment (completed 2026-03-09)
- [x] **Phase 4: Phone Banking** - Call list generation, call scripts, outcome recording, and survey capture reusing the canvassing survey engine (completed 2026-03-09)
- [x] **Phase 5: Volunteer Management** - Volunteer registration, shift scheduling, assignment to turfs and phone banks, and hours tracking (completed 2026-03-09)
- [ ] **Phase 6: Operational Dashboards** - Canvassing progress, phone banking progress, and volunteer activity summary endpoints

## Phase Details

### Phase 1: Authentication and Multi-Tenancy
**Goal**: Any user can authenticate, create a campaign, and be confident their campaign data is completely isolated from other campaigns
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. User can authenticate via ZITADEL and access protected API endpoints with a valid JWT
  2. Campaign admin can create, update, and delete campaigns they own
  3. A user in Campaign A cannot read or modify any data belonging to Campaign B (RLS enforced at the database level)
  4. Campaign admin can invite users and assign roles, and the API enforces different permissions for each role (owner, admin, manager, volunteer, viewer)
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Project foundation: FastAPI skeleton, PostgreSQL + Docker, Alembic migrations with RLS, SQLAlchemy models, JWT validation with Authlib
- [ ] 01-02-PLAN.md — Campaign CRUD with ZITADEL org provisioning, compensating transactions, role enforcement, user identity sync, /me endpoints
- [ ] 01-03-PLAN.md — Campaign invites, member management, role assignment, RLS integration tests

### Phase 2: Voter Data Import and CRM
**Goal**: Campaign staff can import voter files from multiple sources and work with a unified voter database for targeting and outreach
**Depends on**: Phase 1
**Requirements**: VOTER-01, VOTER-02, VOTER-03, VOTER-04, VOTER-05, VOTER-06, VOTER-07, VOTER-08, VOTER-09, VOTER-10
**Success Criteria** (what must be TRUE):
  1. Campaign admin can upload a generic CSV or L2-format voter file and see imported voters appear in their campaign's voter database
  2. Campaign user can search and filter voters by demographics, geography, voting history, and tags, and build reusable target universes
  3. Campaign user can tag voters, create static lists, and create dynamic lists from saved filter queries
  4. Every voter interaction (door knock, call, survey response) is recorded in an append-only history visible on the voter record
  5. Voter contact information (phone, email, address) can be viewed and managed with primary/secondary designation
**Plans**: 4 plans

Plans:
- [ ] 02-01-PLAN.md — Voter data model (all SQLAlchemy models, Pydantic schemas), Alembic migration with RLS, MinIO + StorageService, TaskIQ broker
- [ ] 02-02-PLAN.md — Import pipeline: pre-signed URL upload, RapidFuzz field mapping, CSV batch processing, TaskIQ background job, import status endpoints
- [ ] 02-03-PLAN.md — Voter search/filter with composable query builder, tag management, static/dynamic voter lists, target universes
- [ ] 02-04-PLAN.md — Append-only interaction history, multi-channel contact management (phone/email/address), RLS integration tests

### Phase 3: Canvassing Operations
**Goal**: Campaign managers can cut turfs, generate walk lists, and canvassers can record door-knock outcomes and survey responses in the field
**Depends on**: Phase 2
**Requirements**: CANV-01, CANV-02, CANV-03, CANV-04, CANV-05, CANV-06, CANV-07, CANV-08
**Success Criteria** (what must be TRUE):
  1. Campaign manager can define geographic turfs by drawing polygons, and the system identifies which voters fall within each turf
  2. Campaign manager can generate a walk list from a turf and target criteria, with voters clustered by household so one address is one stop
  3. Canvasser can record door-knock outcomes (not home, refused, supporter, etc.) and the system tracks contact attempts with timestamps per voter
  4. Canvasser can follow a linear survey script, record responses per question (multiple choice, scale, free text), and responses are stored per voter
  5. Campaign manager can assign canvassers to specific turfs
**Plans**: 4 plans

Plans:
- [ ] 03-00-PLAN.md — Wave 0 test stub files for all canvassing operations (turfs, walk lists, canvassing, surveys, spatial integration)
- [ ] 03-01-PLAN.md — All canvassing models (turf, walk list, survey), Pydantic schemas, Alembic migration with PostGIS, voter geom backfill, RLS policies
- [ ] 03-02-PLAN.md — TurfService, WalkListService, CanvassService, turf and walk list API endpoints with spatial queries and household clustering
- [ ] 03-03-PLAN.md — SurveyService (reusable survey engine), survey API endpoints, RLS integration tests for all Phase 3 tables

### Phase 4: Phone Banking
**Goal**: Campaign managers can run phone banking operations using the same survey and outcome infrastructure as canvassing
**Depends on**: Phase 3
**Requirements**: PHONE-01, PHONE-02, PHONE-03, PHONE-04, PHONE-05
**Success Criteria** (what must be TRUE):
  1. Campaign manager can generate call lists from voter universe criteria, filtered to voters with valid phone numbers and excluding do-not-call entries
  2. Phone banker can follow call scripts (linear and branched) and record call outcomes (answered, no answer, busy, wrong number, voicemail, refused, deceased)
  3. Phone banker can capture survey responses during calls using the same survey engine as canvassing, and all outcomes sync to the voter's interaction history
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Phone banking models (CallList, CallListEntry, PhoneBankSession, SessionCaller, DoNotCallEntry), Pydantic schemas, Alembic migration with RLS, test stubs
- [ ] 04-02-PLAN.md — CallListService (generation, claim-on-fetch, DNC filtering), DNCService (CRUD, bulk import, auto-flag), call list and DNC API endpoints
- [ ] 04-03-PLAN.md — PhoneBankService (session lifecycle, call recording, survey integration, supervisor ops), phone bank API endpoints, RLS integration tests

### Phase 5: Volunteer Management
**Goal**: Campaigns can recruit, schedule, and track volunteers across all field operations
**Depends on**: Phase 3 (volunteer assignment links to turfs and phone banks)
**Requirements**: VOL-01, VOL-02, VOL-03, VOL-04, VOL-05, VOL-06
**Success Criteria** (what must be TRUE):
  1. Volunteer can register with profile information (name, contact, skills, availability) and self-sign up for available shifts
  2. Campaign manager can create shifts with date, time, location, and capacity limits, and assign volunteers to canvassing turfs, phone bank sessions, and tasks
  3. System tracks volunteer hours via check-in/check-out and auto-calculates hours from canvassing and phone banking session durations
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — Volunteer and shift models (Volunteer, Shift, ShiftVolunteer), Pydantic schemas, Alembic migration with RLS, test stubs
- [ ] 05-02-PLAN.md — VolunteerService, ShiftService (signup, waitlist, check-in/out with WalkListCanvasser/SessionCaller side effects, hours), all API endpoints, unit tests
- [ ] 05-03-PLAN.md — RLS integration tests for all Phase 5 tables (volunteers, shifts, tags, shift_volunteers, availability)

### Phase 6: Operational Dashboards
**Goal**: Campaign leadership has real-time visibility into field operation progress across canvassing, phone banking, and volunteer activity
**Depends on**: Phase 4, Phase 5
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. API returns canvassing progress data including doors knocked, contacts made, and outcomes broken down by turf and canvasser
  2. API returns phone banking progress data including calls made, contacts reached, and outcomes by type
  3. API returns volunteer activity summary including active volunteers, scheduled shifts, and total hours contributed
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md — Dashboard schemas (14 Pydantic response models), three aggregation services (CanvassingDashboardService, PhoneBankingDashboardService, VolunteerDashboardService) with live SQLAlchemy queries
- [ ] 06-02-PLAN.md — 12 dashboard route handlers (overview, canvassing, phone-banking, volunteers, my-stats, drilldowns), router registration, unit tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Authentication and Multi-Tenancy | 3/3 | Complete |  |
| 2. Voter Data Import and CRM | 3/4 | In Progress|  |
| 3. Canvassing Operations | 4/4 | Complete   | 2026-03-09 |
| 4. Phone Banking | 3/3 | Complete   | 2026-03-09 |
| 5. Volunteer Management | 3/3 | Complete   | 2026-03-09 |
| 6. Operational Dashboards | 1/2 | In Progress|  |
