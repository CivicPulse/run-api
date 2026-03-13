---
phase: 17-volunteer-management
plan: "02"
subsystem: ui
tags: [react, tanstack-query, typescript, hooks, volunteer]

requires:
  - phase: 17-volunteer-management
    provides: backend volunteer CRUD endpoints, schemas, and tag/availability/hours sub-resources
provides:
  - Volunteer TypeScript type contracts mirroring backend Pydantic schemas
  - TanStack Query hooks for volunteer CRUD, tags, availability, and hours
  - Sidebar navigation layout for volunteer section with Outlet
affects: [17-03, 17-04, 17-05]

tech-stack:
  added: []
  patterns:
    - volunteerKeys query key factory for cross-hook cache invalidation
    - Sidebar layout with Outlet pattern (matches phone-banking, voters sections)

key-files:
  created:
    - web/src/types/volunteer.ts
    - web/src/hooks/useVolunteers.ts
    - web/src/hooks/useVolunteerTags.ts
    - web/src/hooks/useVolunteerAvailability.ts
    - web/src/hooks/useVolunteerHours.ts
  modified:
    - web/src/routes/campaigns/$campaignId/volunteers.tsx

key-decisions:
  - "volunteerKeys exported from useVolunteers.ts for cross-hook invalidation (tags and availability hooks import it)"
  - "useSelfRegister does not auto-invalidate queries -- caller handles redirect after register/conflict"
  - "Sidebar nav includes Roster, Tags, Register items matching CONTEXT.md navigation spec"

patterns-established:
  - "volunteerKeys factory pattern: all/detail/list with filters for volunteer queries"
  - "Cross-module query invalidation: useVolunteerTags and useVolunteerAvailability import volunteerKeys to invalidate detail cache"

requirements-completed: [VLTR-01, VLTR-02, VLTR-03, VLTR-04, VLTR-05, VLTR-06, VLTR-07, VLTR-08, VLTR-09]

duration: 2min
completed: 2026-03-12
---

# Phase 17 Plan 02: Types, Hooks & Layout Summary

**Volunteer TypeScript types mirroring backend schemas, 4 TanStack Query hook modules with 18 total exports, and sidebar layout conversion with Outlet**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-12T00:54:42Z
- **Completed:** 2026-03-12T00:56:45Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created complete volunteer type system: VolunteerResponse, VolunteerDetailResponse, VolunteerCreate, VolunteerUpdate, AvailabilityResponse, VolunteerTagResponse, VolunteerHoursResponse with VOLUNTEER_STATUSES and VOLUNTEER_SKILLS constants
- Built 4 hook modules covering all volunteer data operations: CRUD (7 exports), tags (7 exports), availability (3 exports), hours (1 export)
- Converted volunteers.tsx from flat table page to sidebar layout with Outlet for sub-route rendering

## Task Commits

Each task was committed atomically:

1. **Task 1: Create volunteer types and convert sidebar layout** - `6912b0c` (feat)
2. **Task 2: Create all volunteer hook modules** - `582784f` (feat)

## Files Created/Modified
- `web/src/types/volunteer.ts` - All TypeScript types and constants mirroring backend volunteer schemas
- `web/src/hooks/useVolunteers.ts` - Volunteer CRUD hooks with volunteerKeys factory and filter support
- `web/src/hooks/useVolunteerTags.ts` - Campaign tag CRUD and per-volunteer tag assignment hooks
- `web/src/hooks/useVolunteerAvailability.ts` - Availability query, add, and delete hooks with cross-query invalidation
- `web/src/hooks/useVolunteerHours.ts` - Volunteer hours summary query hook
- `web/src/routes/campaigns/$campaignId/volunteers.tsx` - Sidebar layout with Roster, Tags, Register nav and Outlet

## Decisions Made
- volunteerKeys exported from useVolunteers.ts for cross-hook invalidation (tags and availability hooks import it)
- useSelfRegister does not auto-invalidate queries -- caller handles redirect after register/conflict
- Sidebar nav includes Roster, Tags, Register items matching CONTEXT.md navigation spec

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All type contracts ready for roster, detail, tags, register, availability, and hours pages
- Hook modules provide complete data layer for all upcoming volunteer UI plans (17-03 through 17-05)
- Sidebar layout with Outlet ready for sub-route components

## Self-Check: PASSED

All 7 files verified present. Both task commits (6912b0c, 582784f) verified in git log.

---
*Phase: 17-volunteer-management*
*Completed: 2026-03-12*
