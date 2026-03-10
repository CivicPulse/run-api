# Requirements: CivicPulse Run API

**Defined:** 2026-03-10
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.2 Requirements

Requirements for Full UI milestone. Each maps to roadmap phases.

### Shared Infrastructure

- [ ] **INFR-01**: UI shows/hides actions based on user's campaign role (permission-gated)
- [ ] **INFR-02**: User is warned before navigating away from unsaved form changes
- [ ] **INFR-03**: Data tables use consistent sorting, filtering, pagination, and empty states

### Campaign Management

- [ ] **CAMP-01**: User can edit campaign name, description, and election date
- [ ] **CAMP-02**: User can delete a campaign with confirmation
- [ ] **CAMP-03**: User can invite members by email with role assignment
- [ ] **CAMP-04**: User can view pending invites and revoke them
- [ ] **CAMP-05**: User can view campaign member list with role badges
- [ ] **CAMP-06**: User can change a member's role
- [ ] **CAMP-07**: User can remove a member from a campaign
- [ ] **CAMP-08**: User can transfer campaign ownership to another admin

### Voter Management

- [ ] **VOTR-01**: User can view and manage contacts (phone, email, address) in voter detail
- [ ] **VOTR-02**: User can set a primary contact for each contact type
- [ ] **VOTR-03**: User can create a new voter record manually
- [ ] **VOTR-04**: User can edit an existing voter record
- [ ] **VOTR-05**: User can manage campaign-level voter tags
- [ ] **VOTR-06**: User can add/remove tags on individual voters
- [ ] **VOTR-07**: User can create and manage static voter lists
- [ ] **VOTR-08**: User can create and manage dynamic voter lists with filter criteria
- [ ] **VOTR-09**: User can view voter list detail with member management
- [ ] **VOTR-10**: User can use advanced search with composable filters
- [ ] **VOTR-11**: User can add interaction notes on voter detail page

### Voter Imports

- [ ] **IMPT-01**: User can upload a CSV file via drag-and-drop
- [ ] **IMPT-02**: User can view auto-detected column mappings with suggestions
- [ ] **IMPT-03**: User can manually adjust column mappings via drag-and-drop
- [ ] **IMPT-04**: User can preview mapped data before confirming import
- [ ] **IMPT-05**: User can track import progress with row count and percentage
- [ ] **IMPT-06**: User can view import history with status and error counts
- [ ] **IMPT-07**: User can resume an in-progress import wizard after navigating away

### Call Lists & DNC

- [ ] **CALL-01**: User can create a call list from a voter universe with DNC filtering
- [ ] **CALL-02**: User can view call list detail with entry statuses
- [ ] **CALL-03**: User can edit and delete call lists
- [ ] **CALL-04**: User can view the DNC list for a campaign
- [ ] **CALL-05**: User can add an individual phone number to the DNC list
- [ ] **CALL-06**: User can bulk import DNC numbers from a file
- [ ] **CALL-07**: User can remove a number from the DNC list
- [ ] **CALL-08**: User can check if a phone number is on the DNC list

### Phone Banking

- [ ] **PHON-01**: User can create a phone bank session with call list and survey
- [ ] **PHON-02**: User can manage session status transitions (draft → active → complete)
- [ ] **PHON-03**: User can assign and remove callers to a session
- [ ] **PHON-04**: User can check in and check out of a phone bank session
- [ ] **PHON-05**: User can use the active calling screen to claim and call voters sequentially
- [ ] **PHON-06**: User can view voter details, contact info, and survey script during a call
- [ ] **PHON-07**: User can record call outcomes with quick-select buttons
- [ ] **PHON-08**: User can skip or release a claimed call list entry
- [ ] **PHON-09**: User can view session progress dashboard with outcome breakdown
- [ ] **PHON-10**: User can reassign call list entries to other callers

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
| INFR-01 | — | Pending |
| INFR-02 | — | Pending |
| INFR-03 | — | Pending |
| CAMP-01 | — | Pending |
| CAMP-02 | — | Pending |
| CAMP-03 | — | Pending |
| CAMP-04 | — | Pending |
| CAMP-05 | — | Pending |
| CAMP-06 | — | Pending |
| CAMP-07 | — | Pending |
| CAMP-08 | — | Pending |
| VOTR-01 | — | Pending |
| VOTR-02 | — | Pending |
| VOTR-03 | — | Pending |
| VOTR-04 | — | Pending |
| VOTR-05 | — | Pending |
| VOTR-06 | — | Pending |
| VOTR-07 | — | Pending |
| VOTR-08 | — | Pending |
| VOTR-09 | — | Pending |
| VOTR-10 | — | Pending |
| VOTR-11 | — | Pending |
| IMPT-01 | — | Pending |
| IMPT-02 | — | Pending |
| IMPT-03 | — | Pending |
| IMPT-04 | — | Pending |
| IMPT-05 | — | Pending |
| IMPT-06 | — | Pending |
| IMPT-07 | — | Pending |
| CALL-01 | — | Pending |
| CALL-02 | — | Pending |
| CALL-03 | — | Pending |
| CALL-04 | — | Pending |
| CALL-05 | — | Pending |
| CALL-06 | — | Pending |
| CALL-07 | — | Pending |
| CALL-08 | — | Pending |
| PHON-01 | — | Pending |
| PHON-02 | — | Pending |
| PHON-03 | — | Pending |
| PHON-04 | — | Pending |
| PHON-05 | — | Pending |
| PHON-06 | — | Pending |
| PHON-07 | — | Pending |
| PHON-08 | — | Pending |
| PHON-09 | — | Pending |
| PHON-10 | — | Pending |
| VLTR-01 | — | Pending |
| VLTR-02 | — | Pending |
| VLTR-03 | — | Pending |
| VLTR-04 | — | Pending |
| VLTR-05 | — | Pending |
| VLTR-06 | — | Pending |
| VLTR-07 | — | Pending |
| VLTR-08 | — | Pending |
| VLTR-09 | — | Pending |
| SHFT-01 | — | Pending |
| SHFT-02 | — | Pending |
| SHFT-03 | — | Pending |
| SHFT-04 | — | Pending |
| SHFT-05 | — | Pending |
| SHFT-06 | — | Pending |
| SHFT-07 | — | Pending |
| SHFT-08 | — | Pending |
| SHFT-09 | — | Pending |
| SHFT-10 | — | Pending |

**Coverage:**
- v1.2 requirements: 60 total
- Mapped to phases: 0
- Unmapped: 60 ⚠️

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after initial definition*
