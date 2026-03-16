---
phase: 36-google-maps-navigation-link-for-canvassing
plan: 01
subsystem: ui
tags: [google-maps, canvassing, navigation, playwright, walking-directions]

# Dependency graph
requires:
  - phase: 31-canvassing-wizard-walk-list-core
    provides: HouseholdCard, DoorListView, canvassing types
provides:
  - Dedicated Navigate button on HouseholdCard with walking directions
  - MapPin icon buttons on DoorListView rows
  - HasRegistrationAddress type alias and hasAddress helper
  - Playwright e2e tests for navigation (P36-01 through P36-04)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "stopPropagation on nested interactive elements inside button rows"
    - "Tooltip on disabled buttons via wrapping span for pointer events"

key-files:
  created:
    - web/e2e/phase36-navigate.spec.ts
  modified:
    - web/src/types/canvassing.ts
    - web/src/components/field/HouseholdCard.tsx
    - web/src/components/field/DoorListView.tsx

key-decisions:
  - "HasRegistrationAddress Pick type enables reuse across VoterDetail and Voter types"
  - "Walking travelmode default since canvassers are on foot"
  - "Disabled button wrapped in span for tooltip hover on non-interactive disabled element"

patterns-established:
  - "Navigation links use address string (not lat/long) per project feedback"
  - "Nested links inside button rows use stopPropagation to prevent parent handler"

requirements-completed: [P36-01, P36-02, P36-03, P36-04]

# Metrics
duration: 15min
completed: 2026-03-16
---

# Phase 36 Plan 01: Google Maps Navigation Links Summary

**Dedicated Navigate button with walking directions on HouseholdCard, MapPin icon on DoorListView rows, with 5 passing Playwright e2e tests**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-16T20:51:07Z
- **Completed:** 2026-03-16T21:06:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Refactored getGoogleMapsUrl to use HasRegistrationAddress type with travelmode=walking
- Replaced tappable address in HouseholdCard with explicit Navigate button (disabled with tooltip when no address)
- Added MapPin icon button to each DoorListView row with stopPropagation
- Created 5 Playwright e2e tests covering P36-01 through P36-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor getGoogleMapsUrl, update HouseholdCard and DoorListView** - `b1b05ba` (feat)
2. **Task 2: Create Playwright e2e tests** - `a81d0ef` (test)

## Files Created/Modified
- `web/src/types/canvassing.ts` - Added HasRegistrationAddress type, hasAddress helper, travelmode=walking
- `web/src/components/field/HouseholdCard.tsx` - Replaced tappable address with Navigate button
- `web/src/components/field/DoorListView.tsx` - Added MapPin icon button per household row
- `web/e2e/phase36-navigate.spec.ts` - 5 e2e tests for navigation functionality

## Decisions Made
- Used HasRegistrationAddress Pick type to decouple from full VoterDetail (enables future reuse with Voter type)
- Walking travelmode as default since canvassers are on foot
- Wrapped disabled button in span for tooltip hover (disabled elements don't fire pointer events)
- Used locator-based selectors in Playwright to avoid sr-only live region conflicts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Playwright webServer timeout due to slow vite preview startup with route warnings; resolved by running preview server separately during testing.
- Strict mode violation in Playwright tests: address text matched both sr-only live region and visible span; fixed with more specific CSS class locators.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 36 is the final phase in v1.4 roadmap
- All navigation links functional with walking directions
- No blockers

## Self-Check: PASSED

- FOUND: web/src/types/canvassing.ts
- FOUND: web/src/components/field/HouseholdCard.tsx
- FOUND: web/src/components/field/DoorListView.tsx
- FOUND: web/e2e/phase36-navigate.spec.ts
- FOUND: commit b1b05ba (feat task 1)
- FOUND: commit a81d0ef (test task 2)
- FOUND: commit 063068f (docs metadata)

---
*Phase: 36-google-maps-navigation-link-for-canvassing*
*Completed: 2026-03-16*
