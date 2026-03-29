---
phase: 59-e2e-advanced-tests
plan: 01
subsystem: testing
tags: [playwright, e2e, csv-import, l2-voter-file, geojson, fixtures]

# Dependency graph
requires:
  - phase: 46-e2e-testing
    provides: Playwright infrastructure, auth setup, and CI sharding
  - phase: 58-e2e-phase58
    provides: Phase 58 spec patterns (navigateToSeedCampaign, API helpers, serial describe)
provides:
  - L2 format CSV fixture (55 rows, 55 columns) for import testing
  - GeoJSON polygon fixture for Macon-Bibb County turf testing
  - Comprehensive voter import E2E spec covering IMP-01 through IMP-04
  - Cleaned up 10 superseded old spec files (~1570 lines removed)
affects: [59-02, 59-03, 59-04, 59-05, 59-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [L2 fixture CSV with typo-preserved headers, GeoJSON fixture for turf tests, import wizard E2E flow with API concurrent check]

key-files:
  created:
    - web/e2e/fixtures/l2-test-voters.csv
    - web/e2e/fixtures/macon-bibb-turf.geojson
    - web/e2e/voter-import.spec.ts
  modified: []

key-decisions:
  - "L2 CSV fixture preserves exact L2 typos (Lattitude, Mailng Designator, Mailing Aptartment Number, Voter in 2020 Primary) for accurate auto-detection testing"
  - "IMP-03 concurrent prevention tested via API call during active wizard session since 55-row import may complete too quickly for UI-only timing"
  - "IMP-04 cancellation test accepts both cancelled and completed outcomes since small dataset may finish before cancel takes effect"

patterns-established:
  - "Fixture files in web/e2e/fixtures/ directory for shared test data across specs"
  - "Import wizard E2E flow: upload -> wait for column mapping -> verify L2 detection -> next -> confirm -> wait for completion"

requirements-completed: [E2E-04]

# Metrics
duration: 5min
completed: 2026-03-29
---

# Phase 59 Plan 01: Test Fixtures and Voter Import Spec Summary

**L2 CSV fixture (55 voters, 55 columns with preserved typos), GeoJSON turf polygon, 10 old specs deleted, and comprehensive voter import E2E spec covering upload, auto-mapping, progress, concurrent prevention, and cancellation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-29T19:08:45Z
- **Completed:** 2026-03-29T19:14:03Z
- **Tasks:** 3
- **Files modified:** 13 (2 created, 10 deleted, 1 new spec)

## Accomplishments
- Created L2 fixture CSV with 55 realistic Macon-Bibb County voter rows matching exact 55-column L2 format including known typos
- Created GeoJSON fixture with valid Polygon in Macon-Bibb County area for turf import testing
- Deleted 10 superseded old E2E specs (~1570 lines removed) that will be replaced by Phase 59 canonical suite
- Wrote comprehensive voter import spec with 5 test cases covering IMP-01 through IMP-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Create L2 fixture CSV and GeoJSON fixture** - `67a4d66` (feat)
2. **Task 2: Delete 10 superseded old specs** - `d9a80bb` (chore)
3. **Task 3: Write voter import E2E spec (IMP-01 through IMP-04)** - `986e4b6` (feat)

## Files Created/Modified
- `web/e2e/fixtures/l2-test-voters.csv` - 55-row L2 format test data with all 55 columns
- `web/e2e/fixtures/macon-bibb-turf.geojson` - Valid GeoJSON Feature with Macon-Bibb County polygon
- `web/e2e/voter-import.spec.ts` - Comprehensive import spec (IMP-01 through IMP-04)
- Deleted: `web/e2e/voter-import.spec.ts` (old), `phone-bank.spec.ts`, `volunteer-management.spec.ts`, `turf-creation.spec.ts`, `filter-chips.spec.ts`, `phone-banking-verify.spec.ts`, `volunteer-verify.spec.ts`, `shift-verify.spec.ts`, `shift-assign-debug.spec.ts`, `voter-search.spec.ts`

## Decisions Made
- L2 CSV fixture preserves exact L2 typos for accurate auto-detection testing
- IMP-03 concurrent prevention tested via API call during active wizard session
- IMP-04 cancellation test accepts both cancelled and completed outcomes for small datasets
- Voter data uses realistic Macon-Bibb County demographics with diverse party, ethnicity, age distributions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all test data and spec logic is fully wired.

## Next Phase Readiness
- L2 fixture CSV and GeoJSON fixture are now available for Plans 02-06
- voter-import.spec.ts is ready for CI execution
- 10 old specs removed, clearing the way for canonical Phase 59 suite

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 59-e2e-advanced-tests*
*Completed: 2026-03-29*
