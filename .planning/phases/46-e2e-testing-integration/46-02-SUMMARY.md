---
phase: 46-e2e-testing-integration
plan: 02
subsystem: testing
tags: [rls, pytest, playwright, api-smoke, e2e, integration]

requires:
  - phase: 01-07 (v1.0 MVP)
    provides: RLS policies, voter/turf models, API endpoints
provides:
  - API-level RLS smoke tests verifying middleware campaign context setting
  - All skipped test stubs converted to real tests (zero skip markers)
affects: [testing, rls, e2e]

tech-stack:
  added: []
  patterns: [ASGITransport+dependency-override API smoke test pattern, page.route() E2E mock pattern]

key-files:
  created:
    - tests/integration/test_rls_api_smoke.py
  modified:
    - web/e2e/phase31-canvassing.spec.ts
    - web/e2e/phase21-integration-polish.spec.ts

key-decisions:
  - "Used dependency_overrides + app_user_engine for API smoke tests to test real RLS through middleware path"
  - "Converted canvassing E2E tests from conditional skip to page.route() API mocks"
  - "Converted deleted call list test from test.skip to page.route() mock with null call_list_name"

patterns-established:
  - "API RLS smoke test: create_app() + dependency_overrides[get_current_user] + dependency_overrides[get_db] with set_campaign_context"
  - "E2E mock canvassing: setupCanvassingMocks() intercepts field/me, walk list detail, entries, and knock endpoints"

requirements-completed: [TEST-02, TEST-03]

duration: 7min
completed: 2026-03-24
---

# Phase 46 Plan 02: RLS API Smoke Tests and Skipped Test Conversion Summary

**API-level RLS smoke tests verify middleware campaign context across voter/turf endpoints; 10 skipped E2E stubs converted to real mock-based tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-25T01:29:21Z
- **Completed:** 2026-03-25T01:36:29Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created 4 API-level RLS smoke tests covering voter search scoping, turf list scoping, cross-campaign 403 rejection, and null context empty results
- Converted 9 canvassing E2E tests from conditional skip to page.route() API mocks providing walk list data
- Converted 1 integration-polish deleted call list test from test.skip to mock-based test
- Zero test.skip or pytest.mark.skip markers remain across entire test suite

## Task Commits

Each task was committed atomically:

1. **Task 1: API-level RLS smoke tests** - `df2fcbf` (test)
2. **Task 2: Convert pending skipped test stubs to real tests** - `7fb82d4` (test)

## Files Created/Modified
- `tests/integration/test_rls_api_smoke.py` - 4 API-level RLS smoke tests using ASGITransport + dependency overrides
- `web/e2e/phase31-canvassing.spec.ts` - 9 canvassing tests converted from conditional skip to page.route() mocks
- `web/e2e/phase21-integration-polish.spec.ts` - 1 deleted call list test converted from test.skip to mock-based

## Decisions Made
- Used real app_user DB connection with set_campaign_context instead of mocks for API smoke tests -- validates the actual RLS enforcement path through SQLAlchemy
- Converted canvassing E2E tests to use page.route() API interception with mock walk list data, keeping real ZITADEL login for auth verification
- Added setupCanvassingMocks() shared helper for all 9 canvassing tests to reuse the same mock data fixture

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted mock pattern to match actual test architecture**
- **Found during:** Task 2 (Convert skipped test stubs)
- **Issue:** Plan assumed tests used "setupAuth + page.route" mock pattern, but actual specs use real ZITADEL login
- **Fix:** Kept real ZITADEL login and added page.route() interceptors only for the walk list data endpoints that caused the conditional skips
- **Files modified:** web/e2e/phase31-canvassing.spec.ts
- **Verification:** grep confirms zero test.skip markers, tests have page.route() mocks
- **Committed in:** 7fb82d4

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Adaptation necessary because plan incorrectly described the existing test pattern. No scope change -- same outcome achieved.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API-level RLS verification complete (D-07 satisfied at both SQL and API layers)
- All test debt from v1.0 skipped stubs eliminated (D-06 satisfied)
- Ready for remaining phase 46 plans

---
*Phase: 46-e2e-testing-integration*
*Completed: 2026-03-24*
