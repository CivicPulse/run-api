---
phase: 34-guided-onboarding-tour
plan: 00
subsystem: testing
tags: [driver.js, vitest, playwright, onboarding, tour]

# Dependency graph
requires: []
provides:
  - driver.js installed and importable in web/
  - Unit test stubs for tourStore (completions, sessionCounts, shouldShowQuickStart)
  - Unit test stubs for useTour hook (startSegment, cleanup, replacement)
  - E2E test stubs for tour onboarding (welcome tour, help replay, quick-start cards, data-tour attributes)
affects: [34-01, 34-02, 34-03]

# Tech tracking
tech-stack:
  added: [driver.js@1.4.0]
  patterns: []

key-files:
  created:
    - web/src/stores/tourStore.test.ts
    - web/src/hooks/useTour.test.ts
    - web/e2e/tour-onboarding.spec.ts
  modified:
    - web/package.json
    - web/package-lock.json

key-decisions:
  - "No decisions needed - followed plan exactly"

patterns-established:
  - "test.todo() for vitest unit stubs awaiting implementation"
  - "test.fixme() for Playwright e2e stubs awaiting implementation"

requirements-completed: [TOUR-01, TOUR-02, TOUR-03, TOUR-04, TOUR-05, TOUR-06]

# Metrics
duration: 1min
completed: 2026-03-16
---

# Phase 34 Plan 00: Test Stubs & driver.js Install Summary

**driver.js installed with 24 unit test todo stubs and 12 e2e fixme stubs for guided onboarding tour (Nyquist Wave 0)**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-16T17:55:38Z
- **Completed:** 2026-03-16T17:56:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed driver.js@1.4.0 as web dependency for guided tour overlay
- Created 17 vitest todo stubs in tourStore.test.ts covering completions, sessionCounts, shouldShowQuickStart, and transient state
- Created 7 vitest todo stubs in useTour.test.ts covering startSegment, cleanup, and replacement
- Created 12 Playwright fixme stubs in tour-onboarding.spec.ts covering welcome tour, help replay, quick-start cards, and data-tour attributes

## Task Commits

Each task was committed atomically:

1. **Task 1: Install driver.js and create unit test stubs** - `0a8bc5f` (chore)
2. **Task 2: Create e2e test stub for tour onboarding** - `227a5a4` (test)

## Files Created/Modified
- `web/package.json` - Added driver.js dependency
- `web/package-lock.json` - Lock file updated
- `web/src/stores/tourStore.test.ts` - Unit test stubs for tour store (TOUR-03, TOUR-06)
- `web/src/hooks/useTour.test.ts` - Unit test stubs for useTour hook (TOUR-02)
- `web/e2e/tour-onboarding.spec.ts` - E2E test stubs for tour integration (TOUR-01, TOUR-04, TOUR-05)

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- driver.js available for Plan 01 (tour store and hook implementation)
- All 3 test stub files exist as verify targets for Plans 01, 02, 03
- Nyquist compliance satisfied: every downstream task verify target references an existing test file

---
*Phase: 34-guided-onboarding-tour*
*Completed: 2026-03-16*
