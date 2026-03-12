# Phase 17: Volunteer Management - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can manage a complete volunteer roster with profiles, availability slots, tags, and hours tracking — and volunteers can self-register through a dedicated flow. Requirements: VLTR-01 through VLTR-09.

Excluded: shift CRUD, shift signup/assignment, check-in/out (Phase 18). This phase builds the volunteer data layer; Phase 18 builds shift operations on top.

</domain>

<decisions>
## Implementation Decisions

### Navigation & Layout
- **Sidebar layout** matching `phone-banking.tsx` pattern: convert `volunteers.tsx` from flat page to sidebar nav + Outlet
- **Three sidebar nav items**: Roster, Tags, Register
- **Route structure**: `/campaigns/$campaignId/volunteers/` with sub-routes: `roster/`, `tags/`, `register/`, `$volunteerId/`
- Hours and shift history live on the volunteer detail page (accessed by clicking a roster row), not as top-level nav items

### Roster Page
- **DataTable with columns**: Name | Email | Phone | Status (badge) | Skills (badge pills, max 2 + "+N more") | Actions (kebab)
- **Filter controls above table**: Name search input + Status dropdown (All/Pending/Active/Inactive) + Skills dropdown (multi-select from 10 predefined skills)
- **Kebab menu actions** (manager+ gated): Edit volunteer | Change Status (sub-menu: Pending/Active/Inactive) | Deactivate (with ConfirmDialog)
- **Row click** navigates to volunteer detail page
- **No DELETE endpoint** — "Deactivate" sets status to inactive with ConfirmDialog explaining hours/shift history are preserved

### Volunteer Detail Page
- **Header**: Full name as heading + status badge + Edit button (manager+) + skills shown as "Skill1 · Skill2" text
- **Tags in header**: Tag pills with × to remove (manager+) + "Add Tag" button opening dropdown of available campaign tags — manages per-volunteer tag assignment inline
- **Three tabs**: Profile | Availability | Hours
- **Back navigation**: "Back to Roster" link above header

### Profile Tab
- Read-only display of all volunteer fields (contact info, emergency contact, address, notes)
- **Edit via Sheet** (slide-out panel): "Edit" button in header opens Sheet with full volunteer form pre-filled, useFormGuard wired for unsaved changes
- Matches VoterEditSheet pattern from Phase 13

### Self-Registration / Create Volunteer (Register Page)
- **Dual-mode form** on the Register route — adapts by role:
  - **Volunteers see**: First name, Last name, Phone, Email, Skills checkbox grid → calls `POST /volunteers/register`
  - **Managers see**: All fields including Street/City/State/Zip, Emergency contact, Notes, Skills checkbox grid, Status dropdown → calls `POST /volunteers`
- **Skills selection**: Checkbox grid (2 columns of 5), all 10 predefined skills shown
- **After successful registration**: sonner toast "You're registered!" + redirect to newly created volunteer's detail page
- **409 conflict handling** (already registered): toast "You're already registered" + redirect to existing volunteer detail page
- **Pre-fill from auth**: name and email from auth store when available (volunteer self-registration)

### Tags Management Page
- **Mirror voter tags pattern** from Phase 13 exactly: CRUD DataTable with tag name + created date + kebab menu (edit/delete)
- Create/Edit via TagFormDialog (same shared dialog pattern)
- Manager+ role required for all tag operations

### Availability Tab (Detail Page)
- **Slot list with add form**: sorted list of datetime ranges, each row shows formatted date range with delete (×) button
- **Add Availability dialog**: Date picker + Start time + End time → single slot per submission
- **One slot at a time**: dialog submits one slot, re-open to add another
- **Past slots shown but greyed out**: past availability has muted styling and no delete button
- **Permissions**: both volunteers (own profile) and managers (any volunteer) can add/remove availability

### Hours Tab (Detail Page)
- **Summary stat cards** at top: Total Hours | Shifts Completed | Last Active date
- **Shift history table** below: Shift Name | Date | Check-in | Check-out | Hours
- Data from `GET /volunteers/{id}/hours` (ShiftService computes from shift records)

### Empty States
- Use existing EmptyState component (icon + title + description + action) throughout:
  - Empty roster: "No volunteers yet" + [Create Volunteer] CTA
  - Empty availability: "No availability set" + [Add Availability] CTA
  - Empty hours: "No hours recorded" + "Hours appear after completing shifts" (no action button)
  - Empty tags: "No volunteer tags" + [Create Tag] CTA

### Claude's Discretion
- Exact styling of skill badge pills (color, size)
- Loading skeleton patterns for roster table and detail page
- Responsive behavior of detail page tabs and header
- Error handling for failed mutations
- Date/time picker component choice for availability
- Skills label formatting (underscores to spaces, title case)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useVolunteers(campaignId)` hook in `web/src/hooks/useFieldOps.ts`: already queries `/api/v1/campaigns/${campaignId}/volunteers`
- `Volunteer` type in `web/src/types/field-ops.ts`: full field set already defined
- `volunteers.tsx` layout file: exists as flat page, needs conversion to sidebar layout + Outlet
- `DataTable` component: use for roster and tags tables
- `StatusBadge` component: use for volunteer status badges
- `ConfirmDialog` component: use for deactivation confirmation
- `RequireRole` component: use to gate manager-only actions (edit, change status, tag management)
- `EmptyState` component: use for all empty state scenarios
- `useFormGuard` hook: wire on edit sheet and register form
- `phone-banking.tsx`: template for sidebar layout pattern
- Voter tags pattern from Phase 13: `SharedTagFormDialog` for CRUD

### Established Patterns
- Sidebar layout: `phone-banking.tsx` already implemented — replicate for volunteers
- DataTable: manualSorting, manualFiltering, manualPagination for all server-side data
- Sheet for edit forms: VoterEditSheet pattern from Phase 13
- Dialog create/edit: same component with optional `editItem` prop
- Toast notifications: sonner for success/error feedback
- RequireRole: hides unauthorized content entirely (no disabled/greyed-out state)
- Kebab menu: ColumnDef cell renderer in consuming component
- Tag pills with × removal + Add Tag dropdown: needs to be built for volunteer detail header

### Integration Points
- List volunteers: `GET /api/v1/campaigns/${campaignId}/volunteers?status=&skills=&name=`
- Get volunteer detail: `GET /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}` — returns volunteer + tags + availability
- Create volunteer (manager): `POST /api/v1/campaigns/${campaignId}/volunteers`
- Self-register (volunteer): `POST /api/v1/campaigns/${campaignId}/volunteers/register` — returns 409 if already registered
- Update volunteer: `PATCH /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}`
- Update status: `PATCH /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/status`
- Add availability: `POST /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability`
- Delete availability: `DELETE /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability/${availabilityId}`
- List availability: `GET /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability`
- Campaign tags CRUD: `POST/GET /api/v1/campaigns/${campaignId}/volunteer-tags`
- Per-volunteer tags: `POST/DELETE /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/tags/${tagId}`
- Volunteer hours: `GET /api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/hours`
- `VolunteerStatus` values: pending, active, inactive
- `VolunteerSkill` values: canvassing, phone_banking, data_entry, event_setup, social_media, translation, driving, voter_registration, fundraising, graphic_design

### Notes
- Backend has no `DELETE /volunteers/{id}` endpoint — "delete" action is deactivation via status change
- Backend `list_volunteers` returns unpaginated results (PaginatedResponse with `has_more: false`) — frontend may not need pagination controls initially
- `VolunteerDetailResponse` extends `VolunteerResponse` with `tags: list[str]` and `availability: list[AvailabilityResponse]`
- Tag names returned as strings in detail response, not full tag objects — tag IDs needed for add/remove operations (fetch from campaign tags list)

</code_context>

<specifics>
## Specific Ideas

- Sidebar layout should exactly match `phone-banking.tsx` pattern — sidebar nav on left, content on right
- Roster table should feel like Notion databases — comfortable spacing, hover highlights (from Phase 12 DataTable decisions)
- Skills shown as badge pills with max 2 visible + "+N more" overflow on roster, full checkbox grid on forms
- Tag management in header: pills with × removal + "Add Tag" dropdown for inline per-volunteer tag assignment
- Dual-mode register page: form adapts by role, manager sees all fields, volunteer sees essential fields only
- 409 handling on self-register: redirect to existing profile, not an error screen

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-volunteer-management*
*Context gathered: 2026-03-12*
