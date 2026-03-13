---
phase: 18-shift-management
plan: "02"
subsystem: ui
tags: [react, tanstack-router, shifts, sheet-dialog, date-grouping, zod, react-hook-form]

# Dependency graph
requires:
  - phase: 18-shift-management
    provides: Shift types, hooks (useCreateShift, useUpdateShift, useDeleteShift, useSelfSignup, useUpdateShiftStatus), shiftKeys factory, VALID_TRANSITIONS map, status/type variant helpers
provides:
  - ShiftDialog Sheet component for create/edit with zod validation, turf/session selectors, useFormGuard
  - ShiftCard compact row with shift info, status/type badges, kebab menu, status transitions, signup button
  - Shift list route page with date grouping (Today/This Week/Upcoming/Past), status/type filters, empty state
affects: [18-03, 18-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [date-grouped card list (not DataTable) for schedule-style views, Sheet-based create/edit with zod + react-hook-form, per-card mutation hooks for status transitions and signup, HTTPError catch for 422/404 error differentiation]

key-files:
  created:
    - web/src/components/shifts/ShiftDialog.tsx
    - web/src/components/shifts/ShiftCard.tsx
    - web/src/routes/campaigns/$campaignId/volunteers/shifts/index.tsx
  modified:
    - web/src/routeTree.gen.ts

key-decisions:
  - "ShiftDialog uses Sheet (not Dialog) following VolunteerEditSheet pattern -- consistent side-panel UX for long forms"
  - "NONE_VALUE sentinel for optional Select fields (turf, session) -- Radix SelectItem requires non-empty string values"
  - "Capacity shown as 'Max: N' on list cards since list endpoint returns 0 for counts -- accurate counts only on detail page (RESEARCH pitfall 2)"
  - "Sign Up button shown on all scheduled shifts -- 422 'already signed up' and 404 'not registered' handled gracefully with specific toast messages"
  - "Date grouping: Today = current calendar day, This Week = tomorrow through Sunday, Upcoming = after this week, Past = before today start"

patterns-established:
  - "Date-grouped card list: groupShiftsByDate pure function returns non-empty groups in display order with ascending sort within each group"
  - "Per-card mutation pattern: ShiftCard instantiates useDeleteShift, useUpdateShiftStatus, useSelfSignup per card for independent mutation state"
  - "HTTPError differentiation: catch ky HTTPError, check response.status for 422 vs 404, show specific user-facing messages"

requirements-completed: [SHFT-01, SHFT-02, SHFT-04, SHFT-05, SHFT-10]

# Metrics
duration: 209s
completed: 2026-03-12
---

# Phase 18 Plan 02: Shift List Page Summary

**Shift list page with date-grouped card layout, Sheet-based create/edit dialog with zod validation, and ShiftCard with kebab menu, status transitions, and volunteer signup actions**

## Performance

- **Duration:** 209 sec
- **Started:** 2026-03-12T02:16:20Z
- **Completed:** 2026-03-12T02:19:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created ShiftDialog Sheet component with create/edit modes, zod validation for 13 fields, turf/session selectors, and useFormGuard for unsaved changes
- Created ShiftCard compact row with shift info display, status/type badges, kebab menu (edit, status transitions, delete), and volunteer Sign Up button with error handling
- Created shift list route page with date grouping (Today/This Week/Upcoming/Past), status and type filter dropdowns, empty state, and ShiftDialog integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ShiftDialog and ShiftCard components** - `44645bb` (feat)
2. **Task 2: Create shift list page with date grouping and filters** - `c397f13` (feat)

## Files Created/Modified
- `web/src/components/shifts/ShiftDialog.tsx` - Sheet-based create/edit form with zod schema, turf/session selectors, useFormGuard, ISO datetime conversion
- `web/src/components/shifts/ShiftCard.tsx` - Compact card row with name, type badge, time range, status badge, capacity, location, kebab menu, status transitions with ConfirmDialog, delete with DestructiveConfirmDialog, Sign Up button with 422/404 error handling
- `web/src/routes/campaigns/$campaignId/volunteers/shifts/index.tsx` - Shift list page with groupShiftsByDate function, status/type filter dropdowns, Create Shift button (manager+), ShiftDialog integration, EmptyState, loading spinner
- `web/src/routeTree.gen.ts` - Auto-generated route tree update

## Decisions Made
- ShiftDialog uses Sheet (not Dialog) following VolunteerEditSheet pattern for consistent side-panel UX with long forms
- NONE_VALUE sentinel (`__none__`) for optional Select fields (turf_id, phone_bank_session_id) since Radix SelectItem requires non-empty string values
- Capacity displayed as "Max: N" on list cards since list endpoint returns 0 for signed_up_count/waitlist_count (RESEARCH pitfall 2) -- accurate counts available only on detail page
- Sign Up button shown on all scheduled shifts; 422 "already signed up" and 404 "not registered" handled with specific toast messages per PLAN specification
- Date grouping algorithm: Today = current calendar day, This Week = tomorrow through end of week (Sunday), Upcoming = after this week, Past = before today start; non-empty groups returned in display order

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ShiftDialog and ShiftCard components are importable for the shift detail page (Plan 18-03)
- Date grouping function is a pure function that could be extracted to utils if needed elsewhere
- All shift hooks from Plan 01 are wired and functional in the UI components
- Status transition confirmation dialogs established pattern for detail page reuse

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 18-shift-management*
*Completed: 2026-03-12*
