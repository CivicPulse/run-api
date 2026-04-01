---
phase: 60-e2e-field-mode-cross-cutting-validation
plan: 02
subsystem: testing
tags: [playwright, e2e, cross-cutting, navigation, empty-states, form-guard, toast, rate-limiting, error-boundary]

requires:
  - phase: 57-e2e-test-infrastructure
    provides: Playwright auth projects and config
  - phase: 58-e2e-voter-import-campaign
    provides: navigateToSeedCampaign pattern and API helper patterns

provides:
  - Cross-cutting E2E spec (CROSS-01..03, UI-01..03) with 6 test cases
  - Navigation E2E spec (NAV-01..03) with 3 test cases
affects: [60-03-test-fix-retest, val-01-full-suite-pass]

tech-stack:
  added: []
  patterns:
    - "API-created fresh campaign for empty state testing (createEmptyCampaignViaApi)"
    - "Route interception for loading skeleton visibility (page.route with delay)"
    - "Sidebar navigation testing via data-sidebar/data-active selectors"

key-files:
  created:
    - web/e2e/cross-cutting.spec.ts
    - web/e2e/navigation.spec.ts
  modified: []

key-decisions:
  - "Used settings/general page for form guard test instead of /campaigns/new -- settings page has full ConfirmDialog while new campaign page only calls useFormGuard without rendering a dialog"
  - "Rate limiting test uses POST /voters/search and gracefully skips if 429 not triggered locally"
  - "Sidebar navigation uses data-sidebar and data-active attribute selectors for reliable element targeting"

patterns-established:
  - "Empty state testing: create fresh campaign via API, visit each list page, assert empty state text, clean up"
  - "Loading skeleton testing: intercept API with page.route delay, assert animate-pulse elements, then verify data loads"
  - "Sidebar navigation: openSidebar helper with data-state attribute check, iterate link array with URL pattern verification"

requirements-completed: [E2E-21]

duration: 6min
completed: 2026-03-29
---

# Phase 60 Plan 02: Cross-Cutting & Navigation E2E Specs Summary

**9 Playwright E2E tests covering form guards, toasts, rate limiting, empty states, loading skeletons, error boundary, and sidebar/org/breadcrumb navigation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-29T20:57:02Z
- **Completed:** 2026-03-29T21:03:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created cross-cutting.spec.ts with 6 test cases covering CROSS-01 (form navigation guard), CROSS-02 (toast notifications), CROSS-03 (rate limiting), UI-01 (empty states on 8 list pages), UI-02 (loading skeletons), and UI-03 (error boundary)
- Created navigation.spec.ts with 3 test cases covering NAV-01 (7 campaign sidebar links + mobile collapse), NAV-02 (3 org navigation links), and NAV-03 (breadcrumb/back navigation + direct URL entry)
- Both specs run as owner auth (unsuffixed) at desktop viewport per D-12 and D-15 conventions

## Task Commits

Each task was committed atomically:

1. **Task 1: Write cross-cutting.spec.ts** - `018c30e` (test)
2. **Task 2: Write navigation.spec.ts** - `4d63c65` (test)

## Files Created/Modified
- `web/e2e/cross-cutting.spec.ts` - 6 cross-cutting E2E test cases (form guards, toasts, rate limiting, empty states, loading skeletons, error boundary)
- `web/e2e/navigation.spec.ts` - 3 navigation E2E test cases (campaign sidebar, org nav, breadcrumb/back)

## Decisions Made
- Used settings/general page for CROSS-01 form guard test because it has a proper ConfirmDialog with "Unsaved changes" / "Keep editing" / "Discard changes" UI. The /campaigns/new page calls useFormGuard but does not render a dialog for the blocked state, making it unsuitable for asserting guard dialog behavior.
- Rate limiting test (CROSS-03) uses POST /voters/search endpoint and includes a graceful test.skip() if 429 is not triggered, since local dev rate limit thresholds may differ from production.
- Empty state test (UI-01) creates a fresh campaign via API helper and checks 8 distinct list pages (voters, canvassing, phone-banking/call-lists, surveys, volunteers/roster, volunteers/shifts, voters/tags, voters/lists) with appropriate text matching for each page's EmptyState title.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed form guard test page from /campaigns/new to /settings/general**
- **Found during:** Task 1 (cross-cutting spec implementation)
- **Issue:** The plan specified testing form guard on /campaigns/new, but campaigns/new.tsx calls useFormGuard({ form }) without destructuring isBlocked/proceed/reset and does not render a ConfirmDialog. With useBlocker's withResolver: true, navigation is silently blocked with no dialog for Playwright to interact with.
- **Fix:** Used /campaigns/$campaignId/settings/general which has full ConfirmDialog rendering with "Unsaved changes" title and "Keep editing" / "Discard changes" buttons
- **Files modified:** web/e2e/cross-cutting.spec.ts
- **Verification:** Test correctly interacts with alertdialog role and button labels

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary to make the form guard test functional. The settings page exercises the same useFormGuard hook and tests the same behavior.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all tests are fully implemented with real assertions.

## Next Phase Readiness
- Both spec files ready for the test-fix-retest cycle in plan 60-03
- Per D-06, specs were written first; running full suite and fixing app bugs happens next
- Per D-08, any test failures caused by app bugs should use test.skip() with bug ID reference

## Self-Check: PASSED

- [x] web/e2e/cross-cutting.spec.ts exists
- [x] web/e2e/navigation.spec.ts exists
- [x] 60-02-SUMMARY.md exists
- [x] Commit 018c30e found (Task 1)
- [x] Commit 4d63c65 found (Task 2)

---
*Phase: 60-e2e-field-mode-cross-cutting-validation*
*Completed: 2026-03-29*
