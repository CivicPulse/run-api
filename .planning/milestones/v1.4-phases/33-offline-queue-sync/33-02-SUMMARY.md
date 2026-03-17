---
phase: 33-offline-queue-sync
plan: 02
subsystem: ui
tags: [zustand, react-query, offline-sync, ky, sonner, playwright]

# Dependency graph
requires:
  - phase: 33-offline-queue-sync
    provides: offlineQueueStore, useConnectivityStatus, OfflineBanner from Plan 01
  - phase: 31-canvassing-field-mode
    provides: useCanvassingWizard, canvassingStore, DoorKnockCreate
  - phase: 32-phone-banking-field-mode
    provides: useCallingSession, RecordCallPayload
provides:
  - useSyncEngine hook with drainQueue, replayMutation, retry/discard logic
  - Offline queue fallback in useCanvassingWizard handleOutcome/handleBulkNotHome
  - Offline queue fallback in useCallingSession handleOutcome
  - OfflineBanner wired into field layout between FieldHeader and main
  - Auto-skip for entries completed by other volunteers during offline period
  - Post-sync query invalidation for walk-list-entries and phone-bank-sessions
affects: [phase-34, phase-35, field-mode]

# Tech tracking
tech-stack:
  added: []
  patterns: [extracted-drain-function-for-testability, call-site-onError-override-for-mutation-interception, auto-skip-via-query-cache-comparison]

key-files:
  created:
    - web/src/hooks/useSyncEngine.ts
    - web/src/hooks/useSyncEngine.test.ts
    - web/e2e/phase33-offline-sync.spec.ts
  modified:
    - web/src/hooks/useCanvassingWizard.ts
    - web/src/hooks/useCallingSession.ts
    - web/src/routes/field/$campaignId.tsx
    - web/playwright.config.ts

key-decisions:
  - "Extracted drainQueue and replayMutation as standalone async functions for direct unit testing without React hook rendering"
  - "Call-site onError override on .mutate() prevents useDoorKnockMutation's default revertOutcome from firing on network errors"
  - "Auto-skip checks syncedEntryIds set to distinguish our own synced entries from entries completed by other volunteers"
  - "Fixed playwright.config.ts to use HTTPS for preview server compatibility with basicSsl plugin"

patterns-established:
  - "Mutation interception: pass onError override at .mutate() call site to selectively queue vs revert"
  - "Testable async drain: export standalone functions that accept queryClient as parameter"
  - "Auto-skip pattern: compare cached query data entries against synced entry set for conflict detection"

requirements-completed: [SYNC-01, SYNC-02, SYNC-04, SYNC-05]

# Metrics
duration: 19min
completed: 2026-03-16
---

# Phase 33 Plan 02: Sync Engine & Mutation Interception Summary

**Sync engine with FIFO drain, 3-retry limit, 409 discard, auto-skip for conflict entries, and offline queue fallback wired into canvassing and phone-banking orchestrator hooks with 21 unit tests and 3 Playwright e2e tests**

## Performance

- **Duration:** 19 min
- **Started:** 2026-03-16T16:08:13Z
- **Completed:** 2026-03-16T16:27:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Sync engine drains offline queue in FIFO order with 3-retry limit, 409 conflict discard, and race condition guard
- Canvassing wizard pushes failed door-knock mutations to offline queue on TypeError (network error) without reverting optimistic UI
- Calling session pushes failed call-record mutations to offline queue on network error
- Post-sync query invalidation refreshes walk-list-entries-enriched and phone-bank-sessions detail data
- Auto-skip advances past entries completed by other volunteers during offline period with toast notification
- OfflineBanner rendered between FieldHeader and main content in field layout shell
- useSyncEngine activated at layout level covering all field screens
- 21 unit tests and 3 Playwright e2e tests all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sync engine and wire mutation interception into orchestrator hooks** - `a1fa37f` (feat)
2. **Task 2: Wire OfflineBanner and useSyncEngine into field layout + e2e test** - `29f18a1` (feat)

## Files Created/Modified
- `web/src/hooks/useSyncEngine.ts` - Sync engine with drainQueue, replayMutation, isNetworkError, isConflict, auto-skip logic
- `web/src/hooks/useSyncEngine.test.ts` - 21 unit tests covering drain, retry, discard, invalidation, auto-skip
- `web/e2e/phase33-offline-sync.spec.ts` - 3 Playwright e2e tests for banner visibility, disappear on online, queue count
- `web/src/hooks/useCanvassingWizard.ts` - Modified handleOutcome and handleBulkNotHome with offline queue fallback
- `web/src/hooks/useCallingSession.ts` - Modified handleOutcome with offline queue fallback
- `web/src/routes/field/$campaignId.tsx` - Added OfflineBanner and useSyncEngine to field layout
- `web/playwright.config.ts` - Fixed HTTPS URL and ignoreHTTPSErrors for preview server

## Decisions Made
- Extracted drainQueue as a standalone async function accepting queryClient parameter for direct unit testing without React hook rendering context
- Used call-site onError override on .mutate() to prevent useDoorKnockMutation's default revertOutcome from firing during offline queueing
- Track syncedEntryIds to distinguish our own synced entries from entries completed by other volunteers during auto-skip check
- Fixed pre-existing playwright.config.ts issue: preview server uses HTTPS via basicSsl plugin, config needed https URL and ignoreHTTPSErrors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed playwright.config.ts HTTPS configuration**
- **Found during:** Task 2 (e2e test execution)
- **Issue:** playwright.config.ts used http://localhost:4173 but vite preview serves on HTTPS due to basicSsl plugin
- **Fix:** Updated to https://localhost:4173 with ignoreHTTPSErrors: true and NODE_TLS_REJECT_UNAUTHORIZED=0
- **Files modified:** web/playwright.config.ts
- **Verification:** All 3 Playwright e2e tests pass
- **Committed in:** 29f18a1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix was necessary for e2e test execution. Pre-existing configuration issue, not scope creep.

## Issues Encountered
- Playwright webServer health check cannot verify self-signed HTTPS certificate; used debug config without webServer block and manual server management for test execution

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All offline queue sync functionality complete: queue, drain, retry, discard, invalidation, auto-skip
- Phase 33 is fully complete (Plan 01 + Plan 02)
- Ready for Phase 34 and beyond

## Self-Check: PASSED

All 7 files verified on disk. Both task commits (a1fa37f, 29f18a1) verified in git log.

---
*Phase: 33-offline-queue-sync*
*Completed: 2026-03-16*
