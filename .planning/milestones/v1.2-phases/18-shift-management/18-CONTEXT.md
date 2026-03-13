# Phase 18: Shift Management - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create and manage shifts with scheduling, volunteer signup and assignment, check-in/out tracking, roster views, and post-shift hours adjustment. Requirements: SHFT-01 through SHFT-10.

This is the last phase of v1.2 Full UI. The backend is fully built (13 endpoints). Phase 17 built the volunteer data layer; this phase builds shift operations on top.

</domain>

<decisions>
## Implementation Decisions

### Navigation & Page Structure
- **Add "Shifts" to existing volunteer sidebar** as 4th nav item (Roster, Tags, Register, Shifts)
- **Route structure**: `/campaigns/$campaignId/volunteers/shifts/` with sub-routes: `shifts/` (list), `shifts/$shiftId` (detail)
- **Shift creation via Sheet/dialog** opening over the shift list page — matches CallListDialog and SessionDialog patterns from Phases 15-16
- **Single dialog handles both create and edit** via optional `editShift` prop
- **Shift detail as dedicated route** at `/volunteers/shifts/$shiftId` with two tabs: Overview and Roster
- **Turf and phone bank session selectors included** as optional dropdown fields in the create/edit form — populated from existing turfs and sessions

### Shift List Presentation
- **Date-grouped sections**: shifts grouped under headers — "Today", "This Week", "Upcoming", "Past" — within each group sorted by start time
- **Not a DataTable**: custom grouped list, not the standard DataTable component
- **Compact card rows** per shift: name + type badge on left, time range + status badge on right, capacity indicator ("3/8 volunteers") and location below. Kebab menu for managers (Edit, Change Status, Delete)
- **Filter controls above list**: Status dropdown (All/Scheduled/Active/Completed/Cancelled) + Type dropdown (All/Canvassing/Phone Banking/General)
- **Volunteer quick actions on list cards**: Sign Up button for volunteers (when scheduled and capacity available), Cancel button if already signed up, "Join Waitlist" button when full
- **Waitlist display**: if waitlisted, show "Waitlist #N" with Cancel option

### Shift Detail — Overview Tab
- **Shift info display**: name as heading + status badge, type, date, time range, location (name + address), capacity bar, description
- **Edit button** (manager+): opens the same create/edit Sheet pre-filled
- **Contextual status transition buttons** (manager+):
  - Scheduled: [Activate] [Cancel Shift]
  - Active: [Mark Complete] [Cancel Shift]
  - Completed/Cancelled: no transition buttons (read-only)
- **Confirmation dialog** for Cancel Shift and Mark Complete

### Shift Detail — Roster Tab
- **Roster as DataTable**: columns — Name, Status (badge), Check In time, Check Out time, Hours, Actions
- **Inline check-in/out buttons** per row (manager+, only when shift is active):
  - signed_up → [Check In] button
  - checked_in → [Check Out] button
  - checked_out → shows computed hours
  - waitlisted → no action buttons
- **Single click performs action** with toast confirmation — no dialog for check-in/out
- **Kebab menu per row** (manager+): Remove Volunteer | Adjust Hours
- **"+ Assign Volunteer" button** (manager+): opens searchable dialog showing active campaign volunteers not already on this shift, select one to assign (bypasses capacity per backend behavior)

### Hours Adjustment
- **"Adjust Hours" in kebab menu** opens dialog with:
  - Computed hours (read-only)
  - Adjusted hours input (number)
  - Reason textarea (required)
  - [Cancel] [Save Adjustment] buttons
- Available for checked_out volunteers only
- Backend tracks adjusted_by and adjusted_at for audit trail

### Signup & Assignment Flow
- **Volunteer self-signup**: Sign Up button on list card → backend resolves volunteer from user_id → creates signup
- **Registration guard**: if volunteer clicks Sign Up without a volunteer record, show toast "You need to register as a volunteer first" with link to Register page (handles backend 404 "Not Registered" response)
- **Waitlist**: when shift is full, Sign Up button changes to "Join Waitlist" — backend places on waitlist with position
- **Cancel confirmation**: clicking Cancel shows confirm dialog "Cancel your signup for [shift name]?" with [Keep Signup] and [Cancel Signup]
- **Manager assignment**: "+ Assign Volunteer" on roster tab opens searchable volunteer dialog — single select + confirm
- **Manager remove**: kebab menu "Remove Volunteer" with confirmation dialog

### Empty States
- Empty shift list: "No shifts yet" + [Create Shift] CTA (manager+)
- Empty roster: "No volunteers signed up" + [Assign Volunteer] CTA (manager+)
- Empty roster (volunteer view): "No volunteers signed up yet"

### Claude's Discretion
- Exact styling of compact card rows (borders, shadows, spacing)
- Date grouping algorithm ("Today" vs "This Week" vs "Upcoming" cutoff logic)
- Loading skeleton patterns for shift list and detail page
- Responsive behavior of card rows and detail tabs
- Capacity bar visual style (progress bar vs text only)
- Date/time picker component choice for shift create/edit
- Error handling for failed mutations (signup conflicts, status transition errors)
- Whether to show location on a mini-map or text-only (text-only likely sufficient for v1)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Shift` type in `web/src/types/field-ops.ts`: full interface already defined with all fields
- `useShifts(campaignId)` hook in `web/src/hooks/useFieldOps.ts`: basic list query already exists
- `VolunteerShiftRecord` and `VolunteerHoursResponse` in `web/src/types/volunteer.ts`: shift-related types for volunteer hours tab
- `volunteers.tsx` sidebar layout: needs "Shifts" added as 4th nav item
- `DataTable` component: use for roster table on detail page
- `StatusBadge` component: use for shift status and signup status badges
- `ConfirmDialog` / `DestructiveConfirmDialog`: use for cancel signup, delete shift, status transitions
- `RequireRole` component: gate manager-only actions (create, edit, check-in/out, assign, hours adjust)
- `useFormGuard` hook: wire on shift create/edit dialog
- `EmptyState` component: use for empty shift list and empty roster
- Existing Sheet pattern from VolunteerEditSheet (Phase 17) and VoterEditSheet (Phase 13)
- `useVolunteers(campaignId)` hook: needed for assign volunteer dialog to list campaign volunteers

### Established Patterns
- Sidebar layout: `volunteers.tsx` already implemented — add "Shifts" nav item
- Dialog create/edit: same component with optional `editItem` prop (CallListDialog, SessionDialog patterns)
- Toast notifications: sonner for success/error feedback
- RequireRole: hides unauthorized content entirely (no disabled/greyed-out state)
- Kebab menu: ColumnDef cell renderer in consuming component, mutation instantiation per row

### Integration Points
- List shifts: `GET /api/v1/campaigns/${campaignId}/shifts?status=&type=`
- Get shift detail: `GET /api/v1/campaigns/${campaignId}/shifts/${shiftId}` (includes signed_up_count, waitlist_count)
- Create shift: `POST /api/v1/campaigns/${campaignId}/shifts` (manager+)
- Update shift: `PATCH /api/v1/campaigns/${campaignId}/shifts/${shiftId}` (scheduled only, manager+)
- Update shift status: `PATCH /api/v1/campaigns/${campaignId}/shifts/${shiftId}/status` (manager+)
- Delete shift: `DELETE /api/v1/campaigns/${campaignId}/shifts/${shiftId}` (scheduled only, no checked-in volunteers, manager+)
- Self signup: `POST /api/v1/campaigns/${campaignId}/shifts/${shiftId}/signup` (volunteer+, resolves volunteer from user_id)
- Cancel self signup: `DELETE /api/v1/campaigns/${campaignId}/shifts/${shiftId}/signup` (volunteer+)
- Manager assign: `POST /api/v1/campaigns/${campaignId}/shifts/${shiftId}/assign/${volunteerId}` (manager+, bypasses capacity)
- Manager remove: `DELETE /api/v1/campaigns/${campaignId}/shifts/${shiftId}/volunteers/${volunteerId}` (manager+)
- Check in: `POST /api/v1/campaigns/${campaignId}/shifts/${shiftId}/check-in/${volunteerId}` (manager+)
- Check out: `POST /api/v1/campaigns/${campaignId}/shifts/${shiftId}/check-out/${volunteerId}` (manager+)
- Adjust hours: `PATCH /api/v1/campaigns/${campaignId}/shifts/${shiftId}/volunteers/${volunteerId}/hours` (manager+)
- List shift volunteers: `GET /api/v1/campaigns/${campaignId}/shifts/${shiftId}/volunteers` (volunteer+)
- `ShiftType` values: canvassing, phone_banking, general
- `ShiftStatus` values: scheduled, active, completed, cancelled
- `SignupStatus` values: signed_up, waitlisted, checked_in, checked_out, cancelled, no_show

### Notes
- Backend list_shifts returns unpaginated results (PaginatedResponse with has_more: false) — frontend groups client-side by date
- ShiftResponse includes signed_up_count and waitlist_count computed at endpoint layer
- List endpoint currently returns 0 for counts (per shift) — detail endpoint returns accurate counts
- Signup endpoint resolves volunteer from user_id; returns 404 "Not Registered" if no volunteer record
- Manager assign bypasses capacity limits
- Delete only allowed for scheduled shifts with no checked-in volunteers

</code_context>

<specifics>
## Specific Ideas

- Shift list should feel like a schedule/agenda view with date grouping — not a flat database table
- Card rows are compact but information-rich: name, type badge, time, status, capacity, location all visible at a glance
- Volunteer self-service: Sign Up / Join Waitlist / Cancel all available directly from the list without navigating to detail
- Check-in/out should be fast single-click operations on the roster — no dialogs needed for the core action
- Hours adjustment needs the reason field (required) for audit trail — dialog is the right pattern
- Turf and phone bank session selectors should be optional dropdown fields in the create/edit form

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-shift-management*
*Context gathered: 2026-03-12*
