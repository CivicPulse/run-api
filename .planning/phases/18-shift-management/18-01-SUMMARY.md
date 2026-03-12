---
phase: 18-shift-management
plan: "01"
subsystem: ui
tags: [tanstack-query, typescript, react, shifts, hooks]

# Dependency graph
requires:
  - phase: 17-volunteer-management
    provides: Volunteer sidebar layout, useVolunteers hooks pattern, volunteerKeys factory
provides:
  - Shift TypeScript types (ShiftCreate, ShiftUpdate, ShiftSignupResponse, CheckInResponse, HoursAdjustment, ShiftStatusUpdate)
  - Shift constants (SHIFT_TYPES, SHIFT_STATUSES, SIGNUP_STATUSES, VALID_TRANSITIONS)
  - Shift status/type display helpers (shiftStatusVariant, signupStatusVariant, shiftTypeLabel)
  - 14 TanStack Query hooks for all shift CRUD, signup, assignment, check-in/out, hours adjustment
  - shiftKeys query key factory
  - Wave 0 test stubs (15 it.todo covering SHFT-01,02,03,05,06,07,09,10)
  - Sidebar nav with Shifts as 4th item
affects: [18-02, 18-03, 18-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [shift query key factory with all/detail/volunteers/list keys, per-action mutation hooks with targeted cache invalidation]

key-files:
  created:
    - web/src/types/shift.ts
    - web/src/hooks/useShifts.ts
    - web/src/hooks/useShifts.test.ts
  modified:
    - web/src/routes/campaigns/$campaignId/volunteers.tsx

key-decisions:
  - "Shift hooks follow useVolunteers.ts and usePhoneBankSessions.ts patterns exactly -- query key factory + individual query/mutation functions"
  - "shiftKeys.list spreads shiftKeys.all and appends 'list' + filters -- stays invalidatable by shift mutations that invalidate shiftKeys.all"
  - "Wave 0 stubs use it.todo with no imports -- suite stays green while stubs are pending"

patterns-established:
  - "shiftKeys factory: all/detail/volunteers/list key builders for targeted cache invalidation"
  - "Mutation hooks invalidate specific cache slices: check-in/out only invalidate detail+volunteers, not all shifts"

requirements-completed: [SHFT-01, SHFT-02, SHFT-03, SHFT-05, SHFT-06, SHFT-07, SHFT-09, SHFT-10]

# Metrics
duration: 116s
completed: 2026-03-12
---

# Phase 18 Plan 01: Shift Data Layer Summary

**Complete shift data layer with 14 TanStack Query hooks, TypeScript types mirroring backend schemas, VALID_TRANSITIONS status map, status/type variant helpers, Wave 0 test stubs, and Shifts sidebar nav item**

## Performance

- **Duration:** 116 sec
- **Started:** 2026-03-12T02:11:30Z
- **Completed:** 2026-03-12T02:13:26Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created shift.ts with all types, constants, status transition map, and display helper functions mirroring backend Pydantic schemas
- Created useShifts.ts with shiftKeys factory and 14 hooks covering all 13 shift API endpoints
- Created 15 Wave 0 test stubs covering 8 SHFT requirements
- Updated volunteer sidebar nav to include Shifts as 4th item

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shift types and update sidebar nav** - `2d1e544` (feat)
2. **Task 2: Create shift hooks and Wave 0 test stubs** - `9d62d0a` (feat)

## Files Created/Modified
- `web/src/types/shift.ts` - ShiftCreate, ShiftUpdate, ShiftSignupResponse, CheckInResponse, HoursAdjustment, ShiftStatusUpdate types + SHIFT_TYPES/STATUSES/SIGNUP_STATUSES const arrays + VALID_TRANSITIONS map + shiftStatusVariant/signupStatusVariant/shiftTypeLabel helpers
- `web/src/hooks/useShifts.ts` - shiftKeys factory + 14 hooks: useShiftList, useShiftDetail, useCreateShift, useUpdateShift, useUpdateShiftStatus, useDeleteShift, useSelfSignup, useCancelSignup, useAssignVolunteer, useRemoveVolunteer, useCheckInVolunteer, useCheckOutVolunteer, useAdjustHours, useShiftVolunteers
- `web/src/hooks/useShifts.test.ts` - 15 it.todo stubs covering SHFT-01, 02, 03, 05, 06, 07, 09, 10
- `web/src/routes/campaigns/$campaignId/volunteers.tsx` - Added Shifts as 4th sidebar nav item

## Decisions Made
- Shift hooks follow useVolunteers.ts and usePhoneBankSessions.ts patterns exactly -- query key factory + individual query/mutation functions
- shiftKeys.list spreads shiftKeys.all and appends 'list' + filters -- stays invalidatable by shift mutations that invalidate shiftKeys.all
- Wave 0 stubs use it.todo with no imports -- suite stays green while stubs are pending

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 14 shift hooks importable from useShifts.ts, ready for UI component consumption in plans 18-02, 18-03, 18-04
- Types provide complete contracts for shift create/edit forms, roster display, and status management
- VALID_TRANSITIONS map enables UI to show only valid status transition buttons
- Status variant helpers ready for StatusBadge rendering

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 18-shift-management*
*Completed: 2026-03-12*
