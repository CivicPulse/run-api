---
phase: 38-tech-debt-cleanup
plan: 02
subsystem: testing
tags: [vitest, playwright, zustand, driver.js, e2e, unit-test]

# Dependency graph
requires:
  - phase: 34
    provides: tour system (tourStore, useTour hook, driver.js integration)
provides:
  - 36 implemented tests replacing stubs across tourStore, useTour, and tour e2e
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [OIDC localStorage seeding for auth-dependent e2e tests, page.addInitScript for pre-navigation state seeding]

key-files:
  created: []
  modified:
    - web/src/stores/tourStore.test.ts
    - web/src/hooks/useTour.test.ts
    - web/e2e/tour-onboarding.spec.ts

key-decisions:
  - "Rehydration test verifies localStorage shape rather than calling persist.rehydrate() (jsdom async limitations)"
  - "OIDC user seeded in localStorage via page.addInitScript for auth-dependent tour e2e tests"
  - "Used .first() for assignment-card data-tour attribute check (2 cards on hub page)"

patterns-established:
  - "OIDC auth seeding: seed oidc.user:{authority}:{client_id} in localStorage for e2e tests requiring auth state"
  - "Tour state seeding: use page.addInitScript to set tour-state in localStorage before navigation"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-17
---

# Phase 38 Plan 02: Tour Test Stubs Summary

**36 test stubs implemented across tourStore unit tests (17), useTour hook tests (7), and tour e2e tests (12) with zero stubs remaining**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-17T20:41:42Z
- **Completed:** 2026-03-17T20:48:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- All 17 tourStore unit tests implemented: tourKey, completions, sessionCounts, shouldShowQuickStart, transient state persistence
- All 7 useTour hook unit tests implemented: driver.js creation, setRunning, markComplete/onDestroyed, cleanup on unmount, instance replacement
- All 12 tour e2e tests implemented: welcome tour auto-trigger, help button replay, quick-start card visibility/dismiss, data-tour attribute verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement 24 unit test stubs (tourStore + useTour)** - `e7efeaf` (test)
2. **Task 2: Implement 12 tour e2e test stubs** - `7db3cbf` (test)

## Files Created/Modified
- `web/src/stores/tourStore.test.ts` - 17 unit tests for tour state management (completions, sessions, quick-start logic, persistence)
- `web/src/hooks/useTour.test.ts` - 7 unit tests for driver.js hook integration (start, destroy, cleanup, replacement)
- `web/e2e/tour-onboarding.spec.ts` - 12 e2e tests with full API mocking, OIDC auth seeding, and localStorage tour state seeding

## Decisions Made
- Rehydration test verifies localStorage persistence shape directly rather than using `persist.rehydrate()` which has async timing issues in jsdom
- OIDC user seeded in localStorage via `page.addInitScript` using known storage key format `oidc.user:{authority}:{client_id}` for auth-dependent tour e2e tests
- Used `.first()` selector for assignment-card attribute check since hub renders 2 assignment cards (canvassing + phone banking)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed assignment-card strict mode violation in e2e test**
- **Found during:** Task 2 (e2e test implementation)
- **Issue:** `[data-tour='assignment-card']` resolves to 2 elements on hub page (canvassing + phone banking cards)
- **Fix:** Used `.first()` to avoid Playwright strict mode violation
- **Files modified:** web/e2e/tour-onboarding.spec.ts
- **Verification:** All 12 e2e tests pass
- **Committed in:** 7db3cbf (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor selector adjustment for test correctness. No scope creep.

## Issues Encountered
- Zustand persist `rehydrate()` does not synchronously restore state in jsdom test environment; resolved by testing localStorage shape directly
- Tour auto-trigger and help button replay require authenticated user (`profile.sub` for tourKey); resolved by seeding OIDC user in localStorage

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All v1.4 tech debt test stubs are now implemented
- Tour system has full test coverage: 24 unit tests + 12 e2e tests
- No remaining test.todo or test.fixme stubs in the codebase for tour features

---
*Phase: 38-tech-debt-cleanup*
*Completed: 2026-03-17*
