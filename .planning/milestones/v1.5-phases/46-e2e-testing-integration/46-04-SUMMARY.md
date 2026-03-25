---
phase: 46-e2e-testing-integration
plan: 04
subsystem: testing
tags: [playwright, e2e, ci-compatibility, relative-urls, auto-waiting]

# Dependency graph
requires:
  - phase: 46-e2e-testing-integration
    provides: Playwright config with baseURL and storageState auth pattern
provides:
  - CI-compatible canvassing E2E spec (9 tests) with relative URLs
  - CI-compatible integration-polish E2E spec (6 tests) with relative URLs
affects: [e2e-testing, ci-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic-campaign-discovery, relative-url-navigation, playwright-auto-waiting]

key-files:
  modified:
    - web/e2e/phase31-canvassing.spec.ts
    - web/e2e/phase21-integration-polish.spec.ts

key-decisions:
  - "No mock data existed in canvassing spec despite plan reference -- adapted rewrite to preserve actual file structure"
  - "Campaign ID discovered dynamically via UI navigation and URL extraction in beforeEach"

patterns-established:
  - "Dynamic campaign discovery: goto('/') -> click campaign link -> extract ID from URL"
  - "Replace waitForTimeout with toBeVisible/waitForURL auto-waiting assertions"

requirements-completed: [TEST-01, TEST-02, TEST-03]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 46 Plan 04: Gap Closure -- Hardcoded E2E Spec URLs Summary

**Removed hardcoded Tailscale URLs, manual login functions, and waitForTimeout calls from 15 E2E tests across 2 spec files, making all tests CI-compatible with dynamic campaign discovery**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T02:03:19Z
- **Completed:** 2026-03-25T02:07:12Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed all hardcoded `dev.tailb56d83.ts.net` Tailscale URLs from both spec files
- Replaced manual `login()` functions with storageState-based auth from playwright.config.ts
- Replaced 12+ `waitForTimeout()` calls with Playwright auto-waiting assertions (`toBeVisible`, `waitForURL`)
- Added dynamic campaign ID discovery pattern (navigate to root, click seed campaign, extract ID from URL)
- All 15 tests (9 canvassing + 6 integration-polish) preserved with identical assertion logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix phase31-canvassing.spec.ts** - `d99f4e3` (feat)
2. **Task 2: Fix phase21-integration-polish.spec.ts** - `71f4b00` (feat)

## Files Created/Modified
- `web/e2e/phase31-canvassing.spec.ts` - 9 canvassing wizard E2E tests, now CI-compatible with relative URLs and auto-waiting
- `web/e2e/phase21-integration-polish.spec.ts` - 6 DNC/phone-banking E2E tests, now CI-compatible with relative URLs and auto-waiting

## Decisions Made
- Plan referenced `setupCanvassingMocks` and mock data constants that did not exist in the actual canvassing spec file. Adapted the rewrite to preserve the actual file structure (no mocks, tests against seeded data) while still applying all required fixes.
- Used describe-level `let campaignId: string` variable set in `beforeEach` for cross-test campaign ID sharing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan described mock data that did not exist in canvassing spec**
- **Found during:** Task 1
- **Issue:** Plan referenced `setupCanvassingMocks`, `MOCK_WALK_LIST_ENTRIES`, `MOCK_FIELD_ME`, `WALK_LIST_ID`, `VOTER_1_ID` etc. but the actual file had zero `page.route()` calls and no mock constants
- **Fix:** Adapted the rewrite to match the actual file structure while still removing hardcoded URLs, login function, and waitForTimeout calls
- **Files modified:** web/e2e/phase31-canvassing.spec.ts
- **Verification:** All 9 tests preserved, grep confirms zero forbidden patterns
- **Committed in:** d99f4e3

---

**Total deviations:** 1 auto-fixed (1 bug in plan description vs actual file)
**Impact on plan:** Minor -- plan's mock data references were incorrect but all actual fixes (URL, login, waitForTimeout removal) applied correctly. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 15 E2E tests across both spec files are now CI-compatible
- Tests use relative URLs resolving against playwright.config.ts baseURL
- Auth handled via storageState from the setup project
- Campaign IDs discovered dynamically from seeded data
- Ready for CI pipeline execution

---
*Phase: 46-e2e-testing-integration*
*Completed: 2026-03-25*
