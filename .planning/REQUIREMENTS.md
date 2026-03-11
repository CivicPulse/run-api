# Requirements: CivicPulse Run API

**Defined:** 2026-03-10
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.2 Requirements

Requirements for Full UI milestone. Each maps to roadmap phases.

### Shared Infrastructure

- [x] **INFR-01**: UI shows/hides actions based on user's campaign role (permission-gated)
- [x] **INFR-02**: User is warned before navigating away from unsaved form changes
- [x] **INFR-03**: Data tables use consistent sorting, filtering, pagination, and empty states

### Campaign Management

- [x] **CAMP-01**: User can edit campaign name, description, and election date
- [x] **CAMP-02**: User can delete a campaign with confirmation
- [x] **CAMP-03**: User can invite members by email with role assignment
- [x] **CAMP-04**: User can view pending invites and revoke them
- [x] **CAMP-05**: User can view campaign member list with role badges
- [x] **CAMP-06**: User can change a member's role
- [x] **CAMP-07**: User can remove a member from a campaign
- [x] **CAMP-08**: User can transfer campaign ownership to another admin

### Voter Management

- [x] **VOTR-01**: User can view and manage contacts (phone, email, address) in voter detail
- [x] **VOTR-02**: User can set a primary contact for each contact type
- [x] **VOTR-03**: User can create a new voter record manually
- [x] **VOTR-04**: User can edit an existing voter record
- [x] **VOTR-05**: User can manage campaign-level voter tags
- [x] **VOTR-06**: User can add/remove tags on individual voters
- [x] **VOTR-07**: User can create and manage static voter lists
- [x] **VOTR-08**: User can create and manage dynamic voter lists with filter criteria
- [x] **VOTR-09**: User can view voter list detail with member management
- [x] **VOTR-10**: User can use advanced search with composable filters
- [x] **VOTR-11**: User can add interaction notes on voter detail page

### Voter Imports

- [x] **IMPT-01**: User can upload a CSV file via drag-and-drop
- [x] **IMPT-02**: User can view auto-detected column mappings with suggestions
- [x] **IMPT-03**: User can manually adjust column mappings via dropdown selects
- [x] **IMPT-04**: User can preview mapped data before confirming import
- [x] **IMPT-05**: User can track import progress with row count and percentage
- [x] **IMPT-06**: User can view import history with status and error counts
- [x] **IMPT-07**: User can resume an in-progress import wizard after navigating away

### Call Lists & DNC

- [x] **CALL-01**: User can create a call list from a voter universe with DNC filtering
- [x] **CALL-02**: User can view call list detail with entry statuses
- [x] **CALL-03**: User can edit and delete call lists
- [x] **CALL-04**: User can view the DNC list for a campaign
- [x] **CALL-05**: User can add an individual phone number to the DNC list
- [x] **CALL-06**: User can bulk import DNC numbers from a file
- [x] **CALL-07**: User can remove a number from the DNC list
- [x] **CALL-08**: User can check if a phone number is on the DNC list

### Phone Banking

- [x] **PHON-01**: User can create a phone bank session with call list and survey
- [x] **PHON-02**: User can manage session status transitions (draft → active → complete)
- [x] **PHON-03**: User can assign and remove callers to a session
- [x] **PHON-04**: User can check in and check out of a phone bank session
- [x] **PHON-05**: User can use the active calling screen to claim and call voters sequentially
- [x] **PHON-06**: User can view voter details, contact info, and survey script during a call
- [x] **PHON-07**: User can record call outcomes with quick-select buttons
- [x] **PHON-08**: User can skip or release a claimed call list entry
- [x] **PHON-09**: User can view session progress dashboard with outcome breakdown
- [x] **PHON-10**: User can reassign call list entries to other callers

### Volunteer Management

- [ ] **VLTR-01**: User can view volunteer roster with filters
- [ ] **VLTR-02**: User can create a new volunteer record
- [ ] **VLTR-03**: User can edit a volunteer's profile and status
- [ ] **VLTR-04**: User can view volunteer detail page (info, availability, shifts, hours)
- [ ] **VLTR-05**: Volunteer can self-register through a registration flow
- [ ] **VLTR-06**: User can manage volunteer availability (add/remove time slots)
- [ ] **VLTR-07**: User can manage campaign-level volunteer tags
- [ ] **VLTR-08**: User can add/remove tags on individual volunteers
- [ ] **VLTR-09**: User can view volunteer hours and shift history

### Shift Management

- [ ] **SHFT-01**: User can create a shift with date, time, location, capacity, and type
- [ ] **SHFT-02**: User can edit and delete shifts
- [ ] **SHFT-03**: User can manage shift status transitions
- [ ] **SHFT-04**: User can view shifts in a date-grouped list
- [ ] **SHFT-05**: Volunteer can sign up for available shifts (with capacity/waitlist)
- [ ] **SHFT-06**: Manager can assign volunteers to shifts
- [ ] **SHFT-07**: Manager can check in/check out volunteers at shifts
- [ ] **SHFT-08**: User can view shift roster with volunteer statuses
- [ ] **SHFT-09**: Manager can adjust volunteer hours after a shift
- [ ] **SHFT-10**: Volunteer can cancel their shift signup

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### UI Enhancements

- **UIEN-01**: Google Calendar-style week/month grid view for shifts
- **UIEN-02**: Drag-and-drop Gantt-style shift scheduling
- **UIEN-03**: Real-time collaborative voter record editing
- **UIEN-04**: Predictive dialer integration in calling screen

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Calendar grid shift view | Massive complexity; CRUD + date-grouped list is sufficient for campaign scheduling |
| Collaborative editing | Requires CRDT/OT infrastructure; last-write-wins with conflict detection is adequate |
| Predictive dialer | Requires Twilio + TCPA compliance; manual dial with click-to-copy is the v1.2 approach |
| WebSocket real-time updates | TanStack Query polling handles progress and dashboard refresh; no backend WebSocket endpoints exist |
| Mobile-native UI | API-first; mobile clients are separate projects |
| Offline mode | Requires sync infrastructure; defer to future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 12 | Complete |
| INFR-02 | Phase 12 | Complete |
| INFR-03 | Phase 12 | Complete |
| CAMP-01 | Phase 12 | Complete |
| CAMP-02 | Phase 12 | Complete |
| CAMP-03 | Phase 12 | Complete |
| CAMP-04 | Phase 12 | Complete |
| CAMP-05 | Phase 12 | Complete |
| CAMP-06 | Phase 12 | Complete |
| CAMP-07 | Phase 12 | Complete |
| CAMP-08 | Phase 12 | Complete |
| VOTR-01 | Phase 13 | Complete |
| VOTR-02 | Phase 13 | Complete |
| VOTR-03 | Phase 13 | Complete |
| VOTR-04 | Phase 13 | Complete |
| VOTR-05 | Phase 13 | Complete |
| VOTR-06 | Phase 13 | Complete |
| VOTR-07 | Phase 13 | Complete |
| VOTR-08 | Phase 13 | Complete |
| VOTR-09 | Phase 13 | Complete |
| VOTR-10 | Phase 13 | Complete |
| VOTR-11 | Phase 13 | Complete |
| IMPT-01 | Phase 14 | Complete |
| IMPT-02 | Phase 14 | Complete |
| IMPT-03 | Phase 14 | Complete |
| IMPT-04 | Phase 14 | Complete |
| IMPT-05 | Phase 14 | Complete |
| IMPT-06 | Phase 14 | Complete |
| IMPT-07 | Phase 14 | Complete |
| CALL-01 | Phase 15 | Complete |
| CALL-02 | Phase 15 | Complete |
| CALL-03 | Phase 15 | Complete |
| CALL-04 | Phase 15 | Complete |
| CALL-05 | Phase 15 | Complete |
| CALL-06 | Phase 15 | Complete |
| CALL-07 | Phase 15 | Complete |
| CALL-08 | Phase 15 | Complete |
| PHON-01 | Phase 16 | Complete |
| PHON-02 | Phase 16 | Complete |
| PHON-03 | Phase 16 | Complete |
| PHON-04 | Phase 16 | Complete |
| PHON-05 | Phase 16 | Complete |
| PHON-06 | Phase 16 | Complete |
| PHON-07 | Phase 16 | Complete |
| PHON-08 | Phase 16 | Complete |
| PHON-09 | Phase 16 | Complete |
| PHON-10 | Phase 16 | Complete |
| VLTR-01 | Phase 17 | Pending |
| VLTR-02 | Phase 17 | Pending |
| VLTR-03 | Phase 17 | Pending |
| VLTR-04 | Phase 17 | Pending |
| VLTR-05 | Phase 17 | Pending |
| VLTR-06 | Phase 17 | Pending |
| VLTR-07 | Phase 17 | Pending |
| VLTR-08 | Phase 17 | Pending |
| VLTR-09 | Phase 17 | Pending |
| SHFT-01 | Phase 18 | Pending |
| SHFT-02 | Phase 18 | Pending |
| SHFT-03 | Phase 18 | Pending |
| SHFT-04 | Phase 18 | Pending |
| SHFT-05 | Phase 18 | Pending |
| SHFT-06 | Phase 18 | Pending |
| SHFT-07 | Phase 18 | Pending |
| SHFT-08 | Phase 18 | Pending |
| SHFT-09 | Phase 18 | Pending |
| SHFT-10 | Phase 18 | Pending |

**Coverage:**
- v1.2 requirements: 60 total
- Mapped to phases: 60
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
