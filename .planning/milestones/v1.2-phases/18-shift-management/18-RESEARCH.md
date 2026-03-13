# Phase 18: Shift Management - Research

**Researched:** 2026-03-12
**Domain:** React frontend -- shift CRUD, volunteer signup/assignment, check-in/out, roster management, hours adjustment
**Confidence:** HIGH

## Summary

Phase 18 implements the complete shift management UI as the final phase of the v1.2 Full UI milestone. The backend is fully built with 13 API endpoints covering shift CRUD, volunteer signup/assignment, check-in/out, and hours adjustment. The frontend builds on top of Phase 17's volunteer infrastructure, adding "Shifts" as a 4th nav item in the volunteers sidebar layout.

The implementation follows well-established project patterns: TanStack Router file-based routes, TanStack Query hooks with `api` client from `@/api/client`, Sheet/Dialog components for create/edit, DataTable for the roster, StatusBadge for status display, RequireRole for permission gating, and ConfirmDialog for destructive actions. The shift list is the one exception -- it uses a custom date-grouped card layout instead of DataTable.

**Primary recommendation:** Build a dedicated `useShifts.ts` hooks file (following `usePhoneBankSessions.ts` pattern) with query keys, list/detail queries, and all 10+ mutation hooks, then construct the UI components referencing these hooks and the 13 existing backend endpoints.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add "Shifts" to existing volunteer sidebar as 4th nav item (Roster, Tags, Register, Shifts)
- Route structure: `/campaigns/$campaignId/volunteers/shifts/` with sub-routes: `shifts/` (list), `shifts/$shiftId` (detail)
- Shift creation via Sheet/dialog opening over the shift list page -- matches CallListDialog and SessionDialog patterns from Phases 15-16
- Single dialog handles both create and edit via optional `editShift` prop
- Shift detail as dedicated route at `/volunteers/shifts/$shiftId` with two tabs: Overview and Roster
- Turf and phone bank session selectors included as optional dropdown fields in the create/edit form
- Date-grouped sections: shifts grouped under headers -- "Today", "This Week", "Upcoming", "Past"
- Not a DataTable: custom grouped list, not the standard DataTable component
- Compact card rows per shift: name + type badge on left, time range + status badge on right, capacity indicator and location below, kebab menu for managers
- Filter controls above list: Status dropdown + Type dropdown
- Volunteer quick actions on list cards: Sign Up / Join Waitlist / Cancel buttons directly on cards
- Shift detail Overview tab: shift info display, edit button, contextual status transition buttons with confirmation dialogs
- Shift detail Roster tab: DataTable with columns Name, Status, Check In, Check Out, Hours, Actions
- Inline check-in/out buttons per row (single click, toast confirmation, no dialog)
- Kebab menu per roster row: Remove Volunteer, Adjust Hours
- "+ Assign Volunteer" button on roster opens searchable dialog showing active campaign volunteers not already on this shift
- "Adjust Hours" dialog with computed hours (read-only), adjusted hours input, reason textarea (required)
- Volunteer self-signup resolves volunteer from user_id; registration guard for 404 "Not Registered" response
- Waitlist with "Join Waitlist" button when shift is full, showing "Waitlist #N" with Cancel option
- Cancel signup confirmation dialog
- Manager assignment bypasses capacity
- Empty states for shift list and roster

### Claude's Discretion
- Exact styling of compact card rows (borders, shadows, spacing)
- Date grouping algorithm ("Today" vs "This Week" vs "Upcoming" cutoff logic)
- Loading skeleton patterns for shift list and detail page
- Responsive behavior of card rows and detail tabs
- Capacity bar visual style (progress bar vs text only)
- Date/time picker component choice for shift create/edit
- Error handling for failed mutations (signup conflicts, status transition errors)
- Whether to show location on a mini-map or text-only (text-only likely sufficient for v1)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHFT-01 | User can create a shift with date, time, location, capacity, and type | ShiftDialog component pattern (SessionDialog/CallListDialog reference), ShiftCreate schema, POST endpoint, `useCreateShift` hook |
| SHFT-02 | User can edit and delete shifts | Same ShiftDialog with `editShift` prop, PATCH/DELETE endpoints, only when scheduled status |
| SHFT-03 | User can manage shift status transitions | Status transition buttons on detail Overview tab, PATCH /status endpoint, valid transitions: scheduled->active/cancelled, active->completed |
| SHFT-04 | User can view shifts in a date-grouped list | Custom card list with date grouping, GET /shifts endpoint, client-side grouping algorithm |
| SHFT-05 | Volunteer can sign up for available shifts (with capacity/waitlist) | POST /signup endpoint resolves volunteer from user_id, capacity check, waitlist auto-placement, Sign Up/Join Waitlist buttons on cards |
| SHFT-06 | Manager can assign volunteers to shifts | Assign volunteer dialog on roster tab, POST /assign/{volunteerId} endpoint bypasses capacity |
| SHFT-07 | Manager can check in/check out volunteers at shifts | Inline buttons on roster DataTable rows, POST /check-in and /check-out endpoints |
| SHFT-08 | User can view shift roster with volunteer statuses | Roster tab DataTable, GET /volunteers endpoint, cross-reference with volunteer list for names |
| SHFT-09 | Manager can adjust volunteer hours after a shift | Adjust Hours dialog, PATCH /volunteers/{volunteerId}/hours endpoint, requires reason field for audit trail |
| SHFT-10 | Volunteer can cancel their shift signup | Cancel confirmation dialog, DELETE /signup endpoint, only before shift start for self-cancel |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TanStack Router | existing | File-based routing | Already used for all campaign routes |
| TanStack Query | existing | Data fetching + mutations | Project standard for all API hooks |
| react-hook-form | existing | Form state management | Used in VolunteerEditSheet, SessionDialog, CallListDialog |
| zod | existing | Form validation schemas | Used with zodResolver in Sheet components |
| ky | existing | HTTP client wrapper | Project `api` client uses ky |
| sonner | existing | Toast notifications | Project standard for success/error feedback |
| lucide-react | existing | Icons | Project standard for all icons |
| shadcn/ui | existing | UI primitives | All UI components from this library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-table | existing | Table rendering | For roster DataTable on shift detail page |
| date-fns | check if installed | Date grouping utilities | For "Today"/"This Week"/"Upcoming"/"Past" grouping (or use native Date APIs) |

### Not Needed
| Instead of | Why Not |
|------------|---------|
| Dedicated date picker library | Project uses native `<Input type="datetime-local" />` (confirmed in SessionDialog pattern) |
| Calendar grid view | Explicitly out of scope per REQUIREMENTS.md |
| WebSocket real-time | Out of scope per REQUIREMENTS.md; TanStack Query invalidation handles updates |

**Installation:**
No new packages needed. All dependencies already installed. If date-fns is not installed, native Date APIs are sufficient for the grouping logic.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
  hooks/
    useShifts.ts                    # NEW: All shift queries + mutations
    useShifts.test.ts               # NEW: Test stubs
  types/
    field-ops.ts                    # EXISTING: Shift type already defined
    shift.ts                        # NEW: Additional shift-specific types (ShiftCreate, ShiftSignupResponse, etc.)
  routes/campaigns/$campaignId/volunteers/
    shifts/
      index.tsx                     # NEW: Shift list page
      $shiftId/
        index.tsx                   # NEW: Shift detail page (Overview + Roster tabs)
  components/shifts/
    ShiftDialog.tsx                 # NEW: Create/Edit dialog (Sheet pattern)
    ShiftCard.tsx                   # NEW: Compact card row for shift list
    AssignVolunteerDialog.tsx       # NEW: Searchable volunteer assignment dialog
    AdjustHoursDialog.tsx           # NEW: Hours adjustment dialog
```

### Pattern 1: Dedicated Hooks File with Query Keys
**What:** Create `useShifts.ts` following `usePhoneBankSessions.ts` and `useVolunteers.ts` pattern
**When to use:** All shift data operations
**Example:**
```typescript
// Source: Verified pattern from web/src/hooks/useVolunteers.ts and usePhoneBankSessions.ts
export const shiftKeys = {
  all: (campaignId: string) => ["shifts", campaignId] as const,
  detail: (campaignId: string, shiftId: string) =>
    ["shifts", campaignId, shiftId] as const,
  volunteers: (campaignId: string, shiftId: string) =>
    ["shifts", campaignId, shiftId, "volunteers"] as const,
}

export function useShiftList(campaignId: string, filters?: { status?: string; type?: string }) {
  return useQuery({
    queryKey: [...shiftKeys.all(campaignId), "list", filters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set("status", filters.status)
      if (filters?.type) params.set("type", filters.type)
      const qs = params.toString()
      return api
        .get(`api/v1/campaigns/${campaignId}/shifts${qs ? "?" + qs : ""}`)
        .json<PaginatedResponse<Shift>>()
    },
    enabled: !!campaignId,
  })
}
```

### Pattern 2: Single Create/Edit Dialog
**What:** One ShiftDialog component handles both create and edit modes via optional `editShift` prop
**When to use:** SHFT-01 and SHFT-02
**Example:**
```typescript
// Source: Verified pattern from SessionDialog in phone-banking/sessions/index.tsx
function ShiftDialog({
  open,
  onOpenChange,
  editShift,           // Optional - when provided, dialog is in edit mode
  campaignId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editShift?: Shift
  campaignId: string
}) {
  const isEdit = !!editShift
  // ... form setup with editShift defaults
}
```

### Pattern 3: Date-Grouped Custom List (NOT DataTable)
**What:** Custom card list with date-group headers
**When to use:** SHFT-04 shift list page
**Example:**
```typescript
// Group shifts into date buckets
function groupShiftsByDate(shifts: Shift[]): Map<string, Shift[]> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))

  const groups = new Map<string, Shift[]>()
  // "Today", "This Week", "Upcoming", "Past"
  for (const shift of shifts) {
    const startAt = new Date(shift.start_at)
    let group: string
    if (startAt < today) group = "Past"
    else if (startAt < new Date(today.getTime() + 86400000)) group = "Today"
    else if (startAt <= endOfWeek) group = "This Week"
    else group = "Upcoming"
    // ...
  }
  return groups
}
```

### Pattern 4: Roster with Volunteer Name Lookup
**What:** The list_shift_volunteers endpoint returns `ShiftSignupResponse` which only includes `volunteer_id` (no name). The roster must cross-reference with the volunteer list.
**When to use:** SHFT-08 roster table
**Example:**
```typescript
// Source: Verified pattern from callListsById in phone-banking/sessions/index.tsx
const { data: volunteersData } = useVolunteerList(campaignId)
const volunteersById = useMemo(() => {
  const map: Record<string, { first_name: string; last_name: string }> = {}
  for (const v of volunteersData?.items ?? []) {
    map[v.id] = { first_name: v.first_name, last_name: v.last_name }
  }
  return map
}, [volunteersData])
```

### Pattern 5: Per-Row Mutation Hooks
**What:** RowActions component instantiates mutation hooks per row
**When to use:** SHFT-07 check-in/out buttons, SHFT-06 roster kebab actions
**Example:**
```typescript
// Source: Verified pattern from Phase 16 decision and Phase 17 RowActions
function RowActions({ signup, campaignId, shiftId }: RowActionsProps) {
  const checkInMutation = useCheckInVolunteer(campaignId, shiftId, signup.volunteer_id)
  const checkOutMutation = useCheckOutVolunteer(campaignId, shiftId, signup.volunteer_id)
  // Inline buttons based on signup.status
}
```

### Anti-Patterns to Avoid
- **Do NOT use DataTable for shift list:** Context decision explicitly says custom grouped list, not DataTable
- **Do NOT create separate dialogs for create and edit:** Single ShiftDialog with editShift prop handles both modes
- **Do NOT add dialogs for check-in/out:** Single click with toast confirmation -- no confirmation dialog
- **Do NOT use kebab menus for check-in/out:** These are inline action buttons, not dropdown items
- **Do NOT skip the registration guard:** When self-signup returns 404 "Not Registered", show toast with link to Register page
- **Do NOT fetch volunteer names from a separate endpoint per row:** Use the existing `useVolunteerList` hook once and build a lookup map

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date/time input | Custom date picker | `<Input type="datetime-local" />` | Project standard, used in SessionDialog |
| Status badge rendering | Custom badge logic | `StatusBadge` component | Already handles variant mapping |
| Permission gating | Conditional rendering with role checks | `RequireRole` component | Hides content entirely per project standard |
| Confirmation dialogs | Custom modal logic | `ConfirmDialog` / `DestructiveConfirmDialog` | Project standard, handles isPending state |
| Empty states | Custom empty UI | `EmptyState` component | Consistent dashed border + CTA pattern |
| Toast notifications | Custom notification system | `sonner` (toast) | Already imported and used everywhere |
| Form dirty state tracking | Manual state comparison | `useFormGuard({ form })` | Handles route blocking + beforeunload |
| Roster data table | Custom table markup | `DataTable` component | Handles loading, empty, sorting, pagination |

**Key insight:** Every UI primitive needed for this phase already exists in the project. The work is wiring new hooks to new route components using established patterns, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Volunteer Names Not in Roster Endpoint
**What goes wrong:** `GET /shifts/{shiftId}/volunteers` returns `ShiftSignupResponse[]` which has `volunteer_id` but NO volunteer name. Rendering a roster with only UUIDs is useless.
**Why it happens:** Backend endpoint returns the ShiftVolunteer join table rows directly without joining to the volunteers table.
**How to avoid:** Fetch `useVolunteerList(campaignId)` in parallel and build a `volunteersById` lookup map. Display name as `volunteersById[signup.volunteer_id]?.first_name + " " + last_name` with fallback to `volunteer_id.slice(0, 8)`.
**Warning signs:** Roster shows UUIDs instead of names.

### Pitfall 2: List Endpoint Returns Zero Counts
**What goes wrong:** `GET /shifts` list endpoint returns `signed_up_count: 0` and `waitlist_count: 0` for ALL shifts (see backend code comment: "For list view, return with zero counts").
**Why it happens:** The list endpoint constructs ShiftResponse from model columns directly with hardcoded zero counts to avoid N+1 queries. Only the detail endpoint computes real counts.
**How to avoid:** For capacity indicators on list cards ("3/8 volunteers"), either: (a) accept the limitation and only show max_volunteers without current signup count on list cards, or (b) use the separate detail query per shift. Recommendation: show just `max_volunteers` on list cards (e.g., "Max: 8") and display accurate counts only on the detail page where the detail endpoint is called.
**Warning signs:** All shift cards showing "0/8 volunteers" regardless of actual signups.

### Pitfall 3: Status Transition Validation
**What goes wrong:** Attempting invalid status transitions (e.g., completed->active) causes 422 errors.
**Why it happens:** Backend enforces strict transition rules: scheduled->{active, cancelled}, active->{completed}, completed/cancelled are terminal.
**How to avoid:** Show only valid transition buttons per current status (as specified in CONTEXT.md decisions). Use a status transition map in the frontend:
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["active", "cancelled"],
  active: ["completed"],
  completed: [],
  cancelled: [],
}
```
**Warning signs:** 422 errors on status change buttons.

### Pitfall 4: Self-Signup Registration Guard
**What goes wrong:** Non-registered volunteers clicking "Sign Up" get a cryptic error.
**Why it happens:** POST /signup resolves volunteer from `user_id`. If no volunteer record exists, returns 404 with type `"volunteer-not-registered"`.
**How to avoid:** Catch the specific error type in the mutation's catch block. Show toast "You need to register as a volunteer first" with a link to `/campaigns/${campaignId}/volunteers/register`.
**Warning signs:** Generic "Failed to sign up" toast instead of helpful registration guidance.

### Pitfall 5: Shift Edit Only When Scheduled
**What goes wrong:** Edit button visible on completed/cancelled shifts leads to 422 errors.
**Why it happens:** Backend only allows PATCH on shifts with status `"scheduled"`.
**How to avoid:** Only show edit button when `shift.status === "scheduled"`. The kebab menu on list cards should also conditionally show Edit based on status.
**Warning signs:** Form opens but submission fails for non-scheduled shifts.

### Pitfall 6: Delete Constraints
**What goes wrong:** Delete attempt on a shift with checked-in volunteers returns 422.
**Why it happens:** Backend checks for `checked_in` status ShiftVolunteer records before allowing delete.
**How to avoid:** Only show Delete option when shift is `scheduled`. Show informative error toast if delete fails due to checked-in volunteers.
**Warning signs:** "Delete Failed" error for shifts that appear eligible for deletion.

### Pitfall 7: Emergency Contact Requirement
**What goes wrong:** Signup or assignment for canvassing/phone_banking shifts fails with "Emergency contact required" error.
**Why it happens:** Backend enforces emergency contact for field shift types.
**How to avoid:** Display a clear error toast when this validation fails. Consider showing a note on the signup button if the shift type is canvassing or phone_banking.
**Warning signs:** Volunteers unable to sign up for certain shift types with unclear error messages.

### Pitfall 8: Hours Computation
**What goes wrong:** CheckInResponse includes `hours: float | None` which may be null.
**Why it happens:** Hours are only computed when both check_in_at and check_out_at exist. When `adjusted_hours` is set, that takes precedence.
**How to avoid:** Compute display hours as: `signup.adjusted_hours ?? (check_out_at && check_in_at ? (check_out_at - check_in_at) in hours : null)`. Show "--" for null hours.
**Warning signs:** Hours column showing "null" or "NaN" in roster table.

## Code Examples

### Hooks File Structure (useShifts.ts)
```typescript
// Source: Pattern verified from useVolunteers.ts and usePhoneBankSessions.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { PaginatedResponse } from "@/types/common"
import type { Shift } from "@/types/field-ops"
import type { ShiftSignupResponse, CheckInResponse, ShiftCreate, ShiftUpdate } from "@/types/shift"

export const shiftKeys = {
  all: (campaignId: string) => ["shifts", campaignId] as const,
  detail: (campaignId: string, shiftId: string) =>
    ["shifts", campaignId, shiftId] as const,
  volunteers: (campaignId: string, shiftId: string) =>
    ["shifts", campaignId, shiftId, "volunteers"] as const,
}

// List shifts with optional filters
export function useShiftList(campaignId: string, filters?: { status?: string; type?: string }) {
  return useQuery({
    queryKey: [...shiftKeys.all(campaignId), "list", filters],
    queryFn: () => { /* ... */ },
    enabled: !!campaignId,
  })
}

// Get single shift detail (includes accurate signed_up_count, waitlist_count)
export function useShiftDetail(campaignId: string, shiftId: string) { /* ... */ }

// Create shift (manager+)
export function useCreateShift(campaignId: string) { /* ... */ }

// Update shift (manager+, scheduled only)
export function useUpdateShift(campaignId: string, shiftId: string) { /* ... */ }

// Update shift status (manager+)
export function useUpdateShiftStatus(campaignId: string, shiftId: string) { /* ... */ }

// Delete shift (manager+, scheduled only, no checked-in volunteers)
export function useDeleteShift(campaignId: string) { /* ... */ }

// Self signup (volunteer+)
export function useSelfSignup(campaignId: string, shiftId: string) { /* ... */ }

// Cancel self signup (volunteer+)
export function useCancelSignup(campaignId: string, shiftId: string) { /* ... */ }

// Manager assign volunteer (manager+)
export function useAssignVolunteer(campaignId: string, shiftId: string) { /* ... */ }

// Manager remove volunteer (manager+)
export function useRemoveVolunteer(campaignId: string, shiftId: string) { /* ... */ }

// Check in (manager+)
export function useCheckInVolunteer(campaignId: string, shiftId: string) { /* ... */ }

// Check out (manager+)
export function useCheckOutVolunteer(campaignId: string, shiftId: string) { /* ... */ }

// Adjust hours (manager+)
export function useAdjustHours(campaignId: string, shiftId: string) { /* ... */ }

// List shift volunteers
export function useShiftVolunteers(campaignId: string, shiftId: string) { /* ... */ }
```

### Frontend Types (types/shift.ts)
```typescript
// Source: Derived from app/schemas/shift.py
export const SHIFT_TYPES = ["canvassing", "phone_banking", "general"] as const
export type ShiftType = (typeof SHIFT_TYPES)[number]

export const SHIFT_STATUSES = ["scheduled", "active", "completed", "cancelled"] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

export const SIGNUP_STATUSES = ["signed_up", "waitlisted", "checked_in", "checked_out", "cancelled", "no_show"] as const
export type SignupStatus = (typeof SIGNUP_STATUSES)[number]

export interface ShiftCreate {
  name: string
  description?: string
  type: ShiftType
  start_at: string  // ISO datetime
  end_at: string
  max_volunteers: number
  location_name?: string
  street?: string
  city?: string
  state?: string
  zip_code?: string
  turf_id?: string
  phone_bank_session_id?: string
}

export interface ShiftUpdate {
  name?: string
  description?: string
  type?: ShiftType
  start_at?: string
  end_at?: string
  max_volunteers?: number
  location_name?: string
  street?: string
  city?: string
  state?: string
  zip_code?: string
  turf_id?: string
  phone_bank_session_id?: string
}

export interface ShiftSignupResponse {
  id: string
  shift_id: string
  volunteer_id: string
  status: string
  waitlist_position: number | null
  check_in_at: string | null
  check_out_at: string | null
  signed_up_at: string
}

export interface CheckInResponse {
  id: string
  shift_id: string
  volunteer_id: string
  status: string
  check_in_at: string | null
  check_out_at: string | null
  adjusted_hours: number | null
  adjusted_by: string | null
  adjusted_at: string | null
  signed_up_at: string
  hours: number | null
}

export interface HoursAdjustment {
  adjusted_hours: number
  adjustment_reason: string
}

export interface ShiftStatusUpdate {
  status: string
}
```

### Status Variant Mapping
```typescript
// Consistent with project pattern (see sessionStatusVariant in phone-banking)
function shiftStatusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "active": return "success"
    case "scheduled": return "info"
    case "completed": return "default"
    case "cancelled": return "error"
    default: return "default"
  }
}

function signupStatusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "signed_up": return "info"
    case "waitlisted": return "warning"
    case "checked_in": return "success"
    case "checked_out": return "default"
    case "cancelled": return "error"
    case "no_show": return "error"
    default: return "default"
  }
}

function shiftTypeLabel(type: string): string {
  switch (type) {
    case "canvassing": return "Canvassing"
    case "phone_banking": return "Phone Banking"
    case "general": return "General"
    default: return type
  }
}
```

### Sidebar Nav Update
```typescript
// Source: Verified from web/src/routes/campaigns/$campaignId/volunteers.tsx
const navItems = [
  { to: `/campaigns/${campaignId}/volunteers/roster`, label: "Roster" },
  { to: `/campaigns/${campaignId}/volunteers/tags`, label: "Tags" },
  { to: `/campaigns/${campaignId}/volunteers/register`, label: "Register" },
  { to: `/campaigns/${campaignId}/volunteers/shifts`, label: "Shifts" }, // NEW
]
```

### Date Grouping Algorithm
```typescript
// Claude's discretion -- recommended approach
function groupShiftsByDate(shifts: Shift[]): { label: string; shifts: Shift[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000)
  const weekEnd = new Date(todayStart)
  weekEnd.setDate(todayStart.getDate() + (7 - todayStart.getDay()))

  const groups: Record<string, Shift[]> = {
    Today: [],
    "This Week": [],
    Upcoming: [],
    Past: [],
  }

  for (const shift of shifts) {
    const startAt = new Date(shift.start_at)
    if (startAt < todayStart) {
      groups.Past.push(shift)
    } else if (startAt < tomorrowStart) {
      groups.Today.push(shift)
    } else if (startAt < weekEnd) {
      groups["This Week"].push(shift)
    } else {
      groups.Upcoming.push(shift)
    }
  }

  // Sort within each group by start_at ascending
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  }

  // Return non-empty groups in display order (Today, This Week, Upcoming, Past)
  const order = ["Today", "This Week", "Upcoming", "Past"]
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, shifts: groups[label] }))
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useShifts in useFieldOps.ts | Dedicated useShifts.ts with full CRUD hooks | This phase | useFieldOps basic query still works but dedicated hooks needed for mutations |
| Calendar grid view | Date-grouped list view | v1.2 design decision | Explicitly deferred calendar view (UIEN-01) |
| Separate create/edit forms | Single dialog with editShift prop | Phase 15-16 pattern | Reduces code duplication |

**Deprecated/outdated:**
- `useShifts(campaignId)` in `useFieldOps.ts`: This basic list query exists but does not support filters or mutation invalidation. The new `useShiftList` in `useShifts.ts` should supersede it. Keep the old one for backward compatibility but new code uses the new hooks.

## Open Questions

1. **Signed_up_count on list cards**
   - What we know: List endpoint returns 0 for all counts. Detail endpoint returns accurate counts.
   - What's unclear: Should each shift card show accurate signup counts?
   - Recommendation: Show only `max_volunteers` on list cards (e.g., "Max: 8 volunteers"). Show accurate counts (`3/8 signed up, 2 waitlisted`) only on detail page. This avoids N+1 detail queries for every shift in the list.

2. **Volunteer name resolution for roster**
   - What we know: `ShiftSignupResponse` has `volunteer_id` but no name. `useVolunteerList` provides the volunteer data.
   - What's unclear: Whether the volunteer list will always be loaded before the roster renders.
   - Recommendation: Fetch both queries in parallel. Use `volunteersById[id]?.first_name` with fallback to ID substring. The `useVolunteerList` hook is already used elsewhere in the volunteers section so it may be cached.

3. **Self-signup user detection**
   - What we know: User can see their own signup status on shift list cards (Sign Up / Cancel / Waitlist #N). But the list endpoint does not return the current user's signup status per shift.
   - What's unclear: How to determine if the current user is signed up for a given shift from the list view.
   - Recommendation: On the list page, use the shift volunteers query for displayed shifts or add a "my signups" mechanism. Simplest approach: if the user navigates to the shift detail, the roster query will reveal their status. On the list view, consider not showing personalized buttons (show generic "View" instead) or making a lightweight query for the user's own signups. Alternatively, re-examine whether the backend could add a `my_status` field to the list response. For v1, the simplest approach is to not show personalized signup buttons on the list -- defer to the detail page for signup actions.

   **UPDATE based on CONTEXT.md:** The context explicitly requires "Volunteer quick actions on list cards: Sign Up button for volunteers (when scheduled and capacity available), Cancel button if already signed up, Join Waitlist when full." This means we need signup status per shift. Two approaches: (a) fetch all shift volunteers for each visible shift (costly), or (b) use self-signup/cancel endpoints and optimistically render based on cached state. Recommended approach: After the list loads, make a single request to get the current user's volunteer record, then for each shift use the detail endpoint or a batch query. However, the simplest viable approach for v1: just show Sign Up on all scheduled shifts, handle the 422 "already signed up" error gracefully, and refetch to show Cancel. This is pragmatic since shifts lists are typically small (< 50 items).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 + happy-dom |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHFT-01 | Create shift hook sends POST with all fields | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| SHFT-02 | Update and delete shift hooks + invalidation | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| SHFT-03 | Status transition hook sends PATCH /status | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| SHFT-04 | Shift list renders date-grouped cards | unit | `cd web && npx vitest run src/routes/campaigns/\\$campaignId/volunteers/shifts/index.test.tsx -x` | Wave 0 |
| SHFT-05 | Self-signup hook sends POST /signup | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| SHFT-06 | Assign volunteer hook sends POST /assign/{id} | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| SHFT-07 | Check-in/out hooks send POST requests | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| SHFT-08 | Roster DataTable renders volunteer list | unit | `cd web && npx vitest run src/routes/campaigns/\\$campaignId/volunteers/shifts/\\$shiftId/index.test.tsx -x` | Wave 0 |
| SHFT-09 | Adjust hours hook sends PATCH /hours | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| SHFT-10 | Cancel signup hook sends DELETE /signup | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | Wave 0 |
| E2E | Full shift lifecycle visual verification | e2e | `cd web && npx playwright test e2e/shift-verify.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green + Playwright e2e before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/useShifts.test.ts` -- covers SHFT-01 through SHFT-10 hook behavior
- [ ] `web/src/routes/campaigns/$campaignId/volunteers/shifts/index.test.tsx` -- covers SHFT-04 list rendering
- [ ] `web/src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.test.tsx` -- covers SHFT-08 roster rendering
- [ ] `web/e2e/shift-verify.spec.ts` -- end-to-end visual verification

## Sources

### Primary (HIGH confidence)
- `app/api/v1/shifts.py` -- All 13 API endpoints verified, request/response schemas confirmed
- `app/schemas/shift.py` -- All Pydantic schemas: ShiftCreate, ShiftUpdate, ShiftResponse, ShiftSignupResponse, CheckInResponse, HoursAdjustment, ShiftStatusUpdate
- `app/models/shift.py` -- SQLAlchemy models: Shift, ShiftVolunteer; enums: ShiftType, ShiftStatus, SignupStatus
- `app/services/shift.py` -- Business logic: valid transitions, signup capacity/waitlist, emergency contact enforcement, waitlist promotion, hours tracking
- `web/src/types/field-ops.ts` -- Existing Shift type definition with all fields
- `web/src/hooks/useFieldOps.ts` -- Existing basic useShifts query hook
- `web/src/hooks/useVolunteers.ts` -- Hook pattern with queryKeys, queries, mutations, invalidation
- `web/src/hooks/usePhoneBankSessions.ts` -- Hook pattern with check-in/out mutations
- `web/src/routes/campaigns/$campaignId/volunteers.tsx` -- Current sidebar layout with 3 nav items
- `web/src/routes/campaigns/$campaignId/volunteers/$volunteerId/index.tsx` -- Tabs pattern for detail page
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx` -- SessionDialog create/edit pattern, kebab actions, DataTable usage
- `web/src/components/volunteers/VolunteerEditSheet.tsx` -- Sheet pattern with useFormGuard
- `web/src/components/shared/DataTable.tsx` -- DataTable props interface
- `web/src/components/shared/StatusBadge.tsx` -- StatusBadge variant API
- `web/src/components/shared/EmptyState.tsx` -- EmptyState props interface
- `web/src/components/ConfirmDialog.tsx` -- ConfirmDialog props interface
- `web/src/components/shared/DestructiveConfirmDialog.tsx` -- Type-to-confirm dialog
- `web/src/components/shared/RequireRole.tsx` -- Role-gated rendering

### Secondary (MEDIUM confidence)
- Volunteer detail page tab pattern extrapolated to shift detail tabs
- Date grouping algorithm is Claude's discretion (no existing implementation to reference)

### Tertiary (LOW confidence)
- Self-signup personalized buttons on list cards: the exact UX for determining current user's signup status per shift from the list view is uncertain (see Open Questions #3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- all patterns verified from existing code in Phases 12-17
- Pitfalls: HIGH -- backend code reviewed, edge cases identified from service layer validation logic
- Roster volunteer names: HIGH -- limitation confirmed from schema inspection, workaround pattern verified from callListsById precedent
- Self-signup UX on list: MEDIUM -- CONTEXT.md requires it but backend doesn't provide per-shift user status in list endpoint

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable stack, no external dependencies changing)
