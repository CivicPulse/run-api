---
phase: 33-offline-queue-sync
plan: 01
subsystem: ui
tags: [zustand, localStorage, offline, react, useSyncExternalStore, lucide-react]

# Dependency graph
requires:
  - phase: 31-canvassing-field-mode
    provides: DoorKnockCreate type, canvassingStore persist pattern, field component conventions
  - phase: 32-phone-banking-field-mode
    provides: RecordCallPayload type, callingStore pattern
provides:
  - useOfflineQueueStore with localStorage persistence for door_knock and call_record items
  - useConnectivityStatus hook for reactive online/offline detection
  - OfflineBanner component with 5-state rendering per UI-SPEC.md
affects: [33-02-PLAN, offline-queue-sync]

# Tech tracking
tech-stack:
  added: []
  patterns: [zustand-persist-localStorage, useSyncExternalStore-connectivity, partialize-exclude-transient-state]

key-files:
  created:
    - web/src/stores/offlineQueueStore.ts
    - web/src/stores/offlineQueueStore.test.ts
    - web/src/hooks/useConnectivityStatus.ts
    - web/src/hooks/useConnectivityStatus.test.ts
    - web/src/components/field/OfflineBanner.tsx
    - web/src/components/field/OfflineBanner.test.tsx
  modified: []

key-decisions:
  - "Zustand persist with localStorage (not sessionStorage) for offline queue cross-session survival"
  - "partialize excludes isSyncing from persistence to prevent stale sync state on reload"
  - "State 5 (online, items remain) reuses State 2 offline-style appearance for consistency"

patterns-established:
  - "Offline queue store: getState()/setState() direct testing pattern (no React rendering)"
  - "useSyncExternalStore for browser API reactivity (navigator.onLine)"
  - "OfflineBanner 5-state machine: hidden/offline/syncing/toast/retry-pending"

requirements-completed: [SYNC-01, SYNC-03, SYNC-05]

# Metrics
duration: 3min
completed: 2026-03-16
---

# Phase 33 Plan 01: Offline Queue Foundations Summary

**Zustand localStorage queue store, useSyncExternalStore connectivity hook, and 5-state OfflineBanner component with 29 passing tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T16:01:48Z
- **Completed:** 2026-03-16T16:05:26Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Offline queue store with push/remove/incrementRetry/setSyncing/clear operations persisted to localStorage
- Connectivity hook using useSyncExternalStore for reactive online/offline detection
- OfflineBanner renders 5 states: hidden, offline, offline with count, syncing, retry-pending
- Full ARIA accessibility: role=status, aria-live=polite, descriptive aria-labels per state
- 29 unit tests across 3 test files all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create offline queue store and connectivity hook with tests** - `9562faf` (feat)
2. **Task 2: Create OfflineBanner component with tests** - `b491083` (feat)

## Files Created/Modified
- `web/src/stores/offlineQueueStore.ts` - Zustand persist store with localStorage for offline queue items
- `web/src/stores/offlineQueueStore.test.ts` - 10 tests for store operations and persistence
- `web/src/hooks/useConnectivityStatus.ts` - Reactive online/offline detection via useSyncExternalStore
- `web/src/hooks/useConnectivityStatus.test.ts` - 4 tests for hook reactivity
- `web/src/components/field/OfflineBanner.tsx` - Slim banner component for offline/syncing state
- `web/src/components/field/OfflineBanner.test.tsx` - 15 tests for all 5 render states

## Decisions Made
- Used localStorage (not sessionStorage) for offline queue to survive page reloads and browser restarts
- partialize excludes isSyncing from persistence to ensure fresh sync state on rehydration
- State 5 (online, items remain after failed sync) reuses offline-style appearance for visual consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three foundational building blocks ready for Plan 02 to wire into existing canvassing/phone-banking flows
- Plan 02 will insert OfflineBanner into field layout shell and intercept mutation failures

## Self-Check: PASSED

All 6 files verified on disk. Both task commits (9562faf, b491083) verified in git log.

---
*Phase: 33-offline-queue-sync*
*Completed: 2026-03-16*
