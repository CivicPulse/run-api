---
phase: 32-phone-banking-field-mode
plan: 03
subsystem: testing
tags: [vitest, playwright, e2e, zustand, phone-banking, accessibility]

# Dependency graph
requires:
  - phase: 32-01
    provides: calling types, OutcomeGrid generalization, CallingVoterCard, PhoneNumberList, CompletionSummary
  - phase: 32-02
    provides: callingStore, useCallingSession hook, phone-banking route
provides:
  - Vitest unit tests for calling.ts utilities (formatPhoneDisplay, getPhoneStatus, CALL_OUTCOME_CONFIGS)
  - Vitest unit tests for callingStore Zustand store
  - Playwright e2e tests covering PHONE-01 through PHONE-07 and A11Y-05
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Playwright API route interception for e2e tests without live backend
    - Zustand store direct getState() testing pattern (no React rendering context)

key-files:
  created:
    - web/src/types/calling.test.ts
    - web/src/stores/callingStore.test.ts
    - web/e2e/phase32-verify.spec.ts
  modified: []

key-decisions:
  - "Playwright e2e tests use page.route() API mocking instead of live backend for CI compatibility"
  - "Completion test uses sessionStorage manipulation to simulate isComplete state (prefetch race prevention)"
  - "getByText with exact: true needed for voter names that also appear in aria-live announcements"

patterns-established:
  - "API route interception: mock all API endpoints via page.route() for isolated e2e testing"
  - "Claim mock returns same entries on every call (simulates infinite pool), with store manipulation for completion testing"

requirements-completed: [PHONE-01, PHONE-02, PHONE-03, PHONE-04, PHONE-05, PHONE-06, PHONE-07, A11Y-05]

# Metrics
duration: 27min
completed: 2026-03-15
---

# Phase 32 Plan 03: Phone Banking Tests Summary

**Vitest unit tests for calling utilities and Zustand store, Playwright e2e tests covering all PHONE-01 through PHONE-07 and A11Y-05 requirements with API route interception**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-15T22:44:42Z
- **Completed:** 2026-03-15T23:11:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 21 Vitest unit tests covering formatPhoneDisplay (5 cases), getPhoneStatus (5 cases), CALL_OUTCOME_CONFIGS (3 cases), and callingStore (8 cases)
- 11 Playwright e2e tests verifying all phone banking requirements via API route interception
- Full requirement coverage: start/stop session, tel: dialing, outcome buttons, inline survey, progress tracking, phone formatting, clipboard capability, accessibility, skip, empty state, and completion summary

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Vitest unit tests for calling types and store** - `3347404` (test)
2. **Task 2: Create Playwright e2e tests for phone banking flow** - `4ae18e2` (test)

## Files Created/Modified
- `web/src/types/calling.test.ts` - Vitest tests for formatPhoneDisplay, getPhoneStatus, CALL_OUTCOME_CONFIGS
- `web/src/stores/callingStore.test.ts` - Vitest tests for callingStore Zustand store lifecycle
- `web/e2e/phase32-verify.spec.ts` - Playwright e2e tests for all phone banking requirements

## Decisions Made
- Used Playwright `page.route()` API interception instead of live backend calls for CI-compatible testing
- Used `{ exact: true }` on getByText for voter names that appear in both visible text and sr-only aria-live regions
- Completion test manipulates sessionStorage directly to trigger isComplete state, avoiding prefetch race condition where claim mock always returns entries
- Survey script mock uses correct `/surveys/` endpoint path (not `/survey-scripts/`) matching actual useSurveyScript hook

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed strict mode violations in Playwright selectors**
- **Found during:** Task 2 (Playwright e2e tests)
- **Issue:** getByText("Alice Smith") matched both visible text and aria-live sr-only region; getByRole("button", { name: "End Session" }) matched both back arrow button and End Session button
- **Fix:** Added `{ exact: true }` to voter name selectors and End Session button selector
- **Files modified:** web/e2e/phase32-verify.spec.ts
- **Verification:** All 11 Playwright tests pass
- **Committed in:** 4ae18e2

**2. [Rule 1 - Bug] Fixed survey mock endpoint path and field names**
- **Found during:** Task 2 (Playwright e2e tests)
- **Issue:** Plan used `/survey-scripts/` path and `text`/`type` fields, but actual API uses `/surveys/` path and `question_text`/`question_type` fields
- **Fix:** Updated mock route pattern and response payload to match actual API schema
- **Files modified:** web/e2e/phase32-verify.spec.ts
- **Verification:** Survey test passes with correct question text displayed
- **Committed in:** 4ae18e2

**3. [Rule 1 - Bug] Fixed aria-live selector ambiguity**
- **Found during:** Task 2 (Playwright e2e tests)
- **Issue:** `[aria-live="polite"]` matched both the phone banking announcement region and Sonner toast notification region
- **Fix:** Used compound selector `[aria-live="polite"][role="status"]` to target the specific announcement region
- **Files modified:** web/e2e/phase32-verify.spec.ts
- **Verification:** A11Y accessibility test passes
- **Committed in:** 4ae18e2

---

**Total deviations:** 3 auto-fixed (3 bugs in test selectors/mocks)
**Impact on plan:** All auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated files (voters/imports/new.tsx, canvassing.tsx) prevent `npm run build`, requiring Vite dev server instead of preview mode for Playwright
- Pre-fetch race condition: claim mock returning same entries on every call causes entries to grow infinitely, preventing natural session completion. Resolved by manipulating sessionStorage for completion test.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 32 (Phone Banking Field Mode) is fully complete with all requirements verified
- All PHONE-01 through PHONE-07 and A11Y-05 requirements covered by automated tests
- Ready for Phase 33 (Offline Sync) or Phase 34 (Onboarding Tour)

---
*Phase: 32-phone-banking-field-mode*
*Completed: 2026-03-15*
