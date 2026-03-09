# Phase 5: Volunteer Management - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Campaigns can recruit, schedule, and track volunteers across all field operations. Volunteers are standalone entities (optionally linked to user accounts) with profiles, skills, and availability. Shifts provide typed scheduling linked to canvassing turfs and phone bank sessions. Hours tracking derives from shift check-in/check-out timestamps. Operational dashboards aggregating volunteer data are Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Volunteer Profile Model
- Standalone `volunteers` table with optional `user_id` FK to users (supports walk-in volunteers without accounts)
- Profile fields: first_name, last_name, phone, email, address (street, city, state, zip), emergency_contact_name, emergency_contact_phone, notes (free text)
- Emergency contact is required before assignment to field shifts (canvassing/phone banking)
- Status lifecycle: pending (just registered) -> active (vetted/approved by manager) -> inactive (no longer volunteering, preserved for history)
- Both registration paths: logged-in volunteers self-register (auto-linked to user account), managers create profiles for walk-in volunteers (no user link)

### Skills Tracking
- Dual system: predefined skill categories (StrEnum) + free-form campaign-scoped tags
- Predefined categories cover common campaign skills (canvassing, phone_banking, data_entry, event_setup, social_media, translation, driving, etc.)
- Free tags via many-to-many join table (same pattern as voter tags in Phase 2) for campaign-specific skills ('bilingual-spanish', 'knows-precinct-7')
- Both are filterable for shift matching

### Availability
- Calendar-style availability slots: specific date+time ranges stored as records in a `volunteer_availability` table
- Each slot: volunteer_id, start_at (datetime), end_at (datetime)
- Queryable for shift matching (find volunteers available during a shift's time window)

### Shift Scheduling
- Typed shifts via `shifts` table with type enum: canvassing, phone_banking, general
- Canvassing shifts optionally link to a turf_id; phone banking shifts optionally link to a phone_bank_session_id; general shifts have no operational link
- One-off only (no recurrence rules) -- managers create individual shifts
- Hard capacity cap: max_volunteers field, self-signup blocked when full, managers can override to add beyond capacity
- Location: free text location_name + optional structured address fields (street, city, state, zip) + optional lat/long coordinates
- Status lifecycle: scheduled -> active -> completed, with cancelled status that preserves signups for record-keeping
- Shift metadata: name, description, start_at, end_at, created_by

### Assignment & Signup Flow
- Shift-centric assignment: all volunteer assignment to operations goes through shifts
- Signing up for a canvassing shift + checking in = system creates WalkListCanvasser record for the linked turf's walk list
- Signing up for a phone banking shift + checking in = system creates SessionCaller record for the linked session
- Self-signup: volunteers with 'active' status can sign up for available shifts (pending volunteers blocked)
- Self-cancel: volunteers can cancel their own signup before shift start time; after start, only managers can remove
- Auto-waitlist: when a shift reaches capacity, volunteers can join a waitlist; if someone cancels, next on waitlist is auto-promoted
- Manager actions: assign volunteers to shifts (bypasses capacity), remove volunteers, cancel shifts

### Hours Tracking
- API-driven check-in/check-out: explicit API calls record timestamps on the shift_volunteers join table (check_in_at, check_out_at)
- Shift check-in/out is the single source of truth for ALL volunteer hours (canvassing, phone banking, general)
- VOL-06 auto-calculation: canvassing and phone banking hours ARE shift hours -- no separate derivation needed
- Manager adjustments: managers can override hours with audit trail (adjusted_hours, adjustment_reason, adjusted_by, adjusted_at)
- Original timestamps always preserved alongside any adjustment
- Cumulative stats (total hours, shifts worked, etc.) computed on-read via queries -- no denormalized counters

### Claude's Discretion
- Exact predefined skill categories list
- Waitlist promotion mechanism (immediate vs batched)
- Shift-to-walk-list resolution when a turf has multiple walk lists
- Database indexing strategy for availability slot queries
- Volunteer search/filter query builder design
- Shift signup join table schema details

</decisions>

<specifics>
## Specific Ideas

- Walk-in volunteers (clipboard sign-ups at events) are a core use case -- the standalone volunteer entity with optional user link is essential for this
- The pending -> active vetting gate prevents unvetted volunteers from accessing voter data via canvassing/phone banking shifts
- Emergency contact required for field shifts reflects real campaign safety practices (canvassers in unfamiliar neighborhoods)
- Shift-centric assignment means Phase 3/4 operational models (WalkListCanvasser, SessionCaller) are created as a SIDE EFFECT of shift check-in, not as a parallel workflow

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WalkListCanvasser` (app/models/walk_list.py): Join table for canvasser-to-walk-list assignment -- shift check-in creates these records
- `SessionCaller` (app/models/phone_bank.py): Join table with check_in_at/check_out_at -- shift check-in creates these records
- `CampaignMember` (app/models/campaign_member.py): User-to-campaign join table pattern -- reference for shift_volunteers join table
- `VoterInteractionService` composition pattern (app/services/voter_interaction.py): Compose into VolunteerService for event recording
- Voter tag system (Phase 2): many-to-many join table pattern -- reuse for volunteer skill tags
- `BaseSchema` (app/schemas/common.py): Base Pydantic model for all volunteer schemas
- `PaginatedResponse[T]` (app/schemas/common.py): Generic pagination for volunteer/shift listing
- `set_campaign_context()` (app/db/rls.py): RLS context setter -- all volunteer tables need campaign_id + RLS policies
- `CampaignRole` enum (app/core/security.py): manager+ for shift creation/volunteer management, volunteer+ for self-registration and self-signup

### Established Patterns
- Status lifecycle enum (draft/scheduled -> active -> completed) consistent across walk lists, survey scripts, phone bank sessions
- native_enum=False on all StrEnum columns for migration extensibility
- RLS on child tables via subquery through parent's campaign_id
- Service class pattern for business logic
- Cursor-based pagination
- RFC 9457 Problem Details for errors

### Integration Points
- New models: Volunteer, VolunteerSkill, VolunteerTag, VolunteerAvailability, Shift, ShiftVolunteer (join table with check-in/out + waitlist)
- Shift check-in creates WalkListCanvasser records (canvassing shifts) or SessionCaller records (phone banking shifts)
- New routes mount via app/api/v1/router.py
- RLS policies on all new tables
- Volunteer hours data feeds into Phase 6 dashboard endpoints (DASH-03)

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 05-volunteer-management*
*Context gathered: 2026-03-09*
