---
phase: 37-offline-sync-integration-fixes
plan: 01
subsystem: ui
tags: [tanstack-query, zustand, offline-sync, react-hooks]

# Dependency graph
requires:
  - phase: 33-offline-queue-sync
    provides: drainQueue, useOfflineQueueStore, useSyncEngine
provides:
  - "Fixed useDoorKnockMutation without hook-level onError (offline queueing works)"
  - "drainQueue field-me query invalidation for hub progress refresh"
  - "Three new tests for field-me invalidation behavior"
affects: [canvassing, phone-banking, field-hub]

# Tech tracking
tech-stack:
  added: []
  patterns: ["call-site error handling over hook-level onError for offline-aware mutations"]

key-files:
  created: []
  modified:
    - web/src/hooks/useCanvassing.ts
    - web/src/hooks/useSyncEngine.ts
    - web/src/hooks/useSyncEngine.test.ts

key-decisions:
  - "Hook-level onError removed; call sites own error handling for offline-aware context"
  - "field-me invalidation covers all syncedCampaignIds, not just door_knock types"

patterns-established:
  - "Offline mutations: hook defines optimistic onMutate, call sites define onError with offline queue logic"

requirements-completed: [SYNC-01, SYNC-04]

# Metrics
duration: 2min
completed: 2026-03-16
---

# Phase 37 Plan 01: Offline Sync Integration Fixes Summary

**Removed hook-level onError from useDoorKnockMutation to prevent offline revert, added field-me query invalidation to drainQueue for hub progress refresh**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-16T23:11:12Z
- **Completed:** 2026-03-16T23:12:50Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed premature revert in useDoorKnockMutation so offline queueing at call sites works correctly
- Added field-me query invalidation to drainQueue so hub AssignmentCard progress counters refresh after sync
- Three new tests verify field-me invalidation for door_knock, call_record, and multi-campaign scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tests for field-me invalidation (TDD RED)** - `8f7d95d` (test)
2. **Task 2: Fix onError and add field-me invalidation (TDD GREEN)** - `3f62f15` (fix)

## Files Created/Modified
- `web/src/hooks/useCanvassing.ts` - Removed hook-level onError and revertOutcome from useDoorKnockMutation
- `web/src/hooks/useSyncEngine.ts` - Added field-me query invalidation to drainQueue post-sync block
- `web/src/hooks/useSyncEngine.test.ts` - Three new tests for field-me invalidation behavior

## Decisions Made
- Hook-level onError removed rather than conditionally skipped -- cleaner separation of concerns since call sites already handle errors with offline-aware logic
- field-me invalidation iterates syncedCampaignIds (covers both door_knock and call_record) rather than only door_knock types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- INT-01 and INT-02 from milestone audit are now closed
- Offline canvassing no longer reverts optimistic UI
- Hub progress counters refresh automatically after queue drain

---
*Phase: 37-offline-sync-integration-fixes*
*Completed: 2026-03-16*
