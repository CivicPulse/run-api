# Requirements: CivicPulse Run API

**Defined:** 2026-03-09
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Campaign Management

- [x] **AUTH-01**: User can authenticate via ZITADEL OpenID Connect and receive a JWT
- [x] **AUTH-02**: Campaign admin can create a campaign with name, type, jurisdiction, and election date
- [x] **AUTH-03**: Campaign admin can update and delete campaigns they own
- [x] **AUTH-04**: Campaign data is isolated via PostgreSQL Row-Level Security on campaign_id
- [x] **AUTH-05**: Campaign admin can assign roles to users within a campaign (owner, admin, manager, volunteer, viewer)
- [x] **AUTH-06**: API endpoints enforce role-based permissions per campaign context
- [x] **AUTH-07**: Campaign admin can invite users to a campaign with a specific role via invite link

### Voter File / CRM

- [x] **VOTER-01**: Campaign admin can import voter data from generic CSV files
- [x] **VOTER-02**: Campaign admin can import voter data from L2-format files with pre-configured field mapping
- [x] **VOTER-03**: System suggests field mappings automatically based on column name similarity during import
- [x] **VOTER-04**: Voter records conform to a canonical model (name, address, phone, email, party, voting history, demographics, lat/long, household ID)
- [x] **VOTER-05**: Campaign user can search and filter voters by demographic, geographic, voting history, and tag criteria
- [x] **VOTER-06**: Campaign user can build target universes (e.g., "Democrats who voted in 2022 but not 2024 in precinct 5")
- [x] **VOTER-07**: Campaign user can tag voters and manage static voter lists
- [x] **VOTER-08**: Campaign user can create dynamic voter lists from saved filter queries
- [x] **VOTER-09**: System records interaction history per voter as an append-only event log (door knocks, calls, survey responses)
- [x] **VOTER-10**: Campaign user can view and manage contact information (phone, email, address) with primary/secondary designation

### Canvassing

- [x] **CANV-01**: Campaign manager can define geographic turfs by drawing polygons (PostGIS)
- [x] **CANV-02**: Campaign manager can generate walk lists from a turf and target universe criteria
- [x] **CANV-03**: Walk lists cluster voters by household so multiple voters at one address appear as a single stop
- [x] **CANV-04**: Canvasser can record door-knock outcomes using standard result codes (not home, refused, supporter, undecided, opposed, moved, deceased)
- [x] **CANV-05**: System tracks contact attempts per voter with timestamps
- [x] **CANV-06**: Campaign manager can assign canvassers to specific turfs
- [x] **CANV-07**: Canvasser can follow linear survey scripts and record responses per question
- [x] **CANV-08**: Survey responses are captured per voter with support for multiple choice, scale, and free text

### Phone Banking

- [x] **PHONE-01**: Campaign manager can generate call lists from voter universe criteria filtered by valid phone number and do-not-call status
- [x] **PHONE-02**: Phone banker can follow call scripts (linear and branched) during calls
- [x] **PHONE-03**: Phone banker can record call outcomes (answered, no answer, busy, wrong number, voicemail, refused, deceased)
- [x] **PHONE-04**: Phone banker can capture survey responses during calls using same survey engine as canvassing
- [x] **PHONE-05**: Call outcomes and survey responses sync to voter interaction history

### Volunteer Management

- [x] **VOL-01**: Volunteer can register with profile information (name, contact, skills, availability)
- [ ] **VOL-02**: Campaign manager can assign volunteers to canvassing turfs, phone bank sessions, and tasks
- [x] **VOL-03**: Campaign manager can create shifts with date, time, location, and capacity limits
- [ ] **VOL-04**: Volunteer can self-sign up for available shifts
- [ ] **VOL-05**: System tracks volunteer hours via check-in/check-out timestamps
- [ ] **VOL-06**: System auto-calculates hours from canvassing and phone banking session start/end times

### Dashboards

- [ ] **DASH-01**: API provides canvassing progress data (doors knocked, contacts made, outcomes by turf and canvasser)
- [ ] **DASH-02**: API provides phone banking progress data (calls made, contacts reached, outcomes by type)
- [ ] **DASH-03**: API provides volunteer activity summary (active volunteers, scheduled shifts, total hours)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Canvassing Enhancements

- **CANV-09**: Branched survey scripts with conditional logic (if supporter → ask about yard sign)
- **CANV-10**: GPS-optimized canvassing route suggestions within turfs
- **CANV-11**: Real-time canvassing monitoring endpoints with live canvasser status
- **CANV-12**: Offline sync API pattern (changes-since + batch upload with conflict resolution)

### Voter Data Enhancements

- **VOTER-11**: Voter deduplication across multiple import sources (name + address + DOB matching)
- **VOTER-12**: State-specific voter file import adapters for top 10 states
- **VOTER-13**: Organization-level multi-campaign analytics and cross-campaign views

### Campaign Enhancements

- **AUTH-08**: Campaign settings and configuration (election date, jurisdiction boundaries, default scripts)

### Integrations

- **INTG-01**: Donation/donor tracking CRM fields (for donations processed via external platforms)
- **INTG-02**: Event management (event CRUD, RSVP, volunteer assignment to events)
- **INTG-03**: Email/SMS integration endpoints (webhook-based with external providers)
- **INTG-04**: OSDI-compliant API endpoints for interoperability with existing civic tech tools

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Predictive dialer / telephony integration | Requires Twilio/TCPA/FCC compliance; use dedicated dialer services and sync results via API |
| Email/SMS delivery engine | Building deliverability infrastructure is a separate product; integrate with SendGrid/Mailgun/Twilio in v2 |
| Donation processing / Stripe integration | FEC compliance for contributions is extremely complex; defer to v2+ |
| FEC/state campaign finance compliance | 80+ federal report types, 50 state systems; insane complexity for v1 |
| Website builder / CMS | Frontend product, not a backend API concern; campaigns use existing tools |
| AI-generated campaign content | Client-side concern; API provides structured data, clients can use LLMs directly |
| Voter score prediction / modeling | Import vendor-provided scores (L2 turnout/persuasion); don't build custom models |
| Mobile canvassing app | API-only; mobile clients are separate projects consuming this API |
| Web dashboard frontend | API-only; web frontends are separate projects |
| Real-time WebSocket infrastructure | SSE sufficient for v1 dashboards; WebSocket only if specific demand emerges |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| AUTH-06 | Phase 1 | Complete |
| AUTH-07 | Phase 1 | Complete |
| VOTER-01 | Phase 2 | Complete |
| VOTER-02 | Phase 2 | Complete |
| VOTER-03 | Phase 2 | Complete |
| VOTER-04 | Phase 2 | Complete |
| VOTER-05 | Phase 2 | Complete |
| VOTER-06 | Phase 2 | Complete |
| VOTER-07 | Phase 2 | Complete |
| VOTER-08 | Phase 2 | Complete |
| VOTER-09 | Phase 2 | Complete |
| VOTER-10 | Phase 2 | Complete |
| CANV-01 | Phase 3 | Complete |
| CANV-02 | Phase 3 | Complete |
| CANV-03 | Phase 3 | Complete |
| CANV-04 | Phase 3 | Complete |
| CANV-05 | Phase 3 | Complete |
| CANV-06 | Phase 3 | Complete |
| CANV-07 | Phase 3 | Complete |
| CANV-08 | Phase 3 | Complete |
| PHONE-01 | Phase 4 | Complete |
| PHONE-02 | Phase 4 | Complete |
| PHONE-03 | Phase 4 | Complete |
| PHONE-04 | Phase 4 | Complete |
| PHONE-05 | Phase 4 | Complete |
| VOL-01 | Phase 5 | Complete |
| VOL-02 | Phase 5 | Pending |
| VOL-03 | Phase 5 | Complete |
| VOL-04 | Phase 5 | Pending |
| VOL-05 | Phase 5 | Pending |
| VOL-06 | Phase 5 | Pending |
| DASH-01 | Phase 6 | Pending |
| DASH-02 | Phase 6 | Pending |
| DASH-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after roadmap creation*
