---
phase: 75-reliability-frontend-state-pii-hygiene
plan: 02
subsystem: offline-sync
tags: [offline-sync, reliability, try-finally, retry, toast]

requires:
  - phase: 75-01
    provides: RED Vitest stubs for C14/C15/MAX_RETRY
provides:
  - useSyncEngine drainQueue wrapped in try/finally (lock always released)
  - continue-on-transient-error (queue never stalls on one bad item)
  - MAX_RETRY=3 exported constant
  - Item removal + toast.error after exceeding MAX_RETRY
affects: [75-04]

tech-stack:
  added: []
  patterns:
    - "try/finally around async body ensures lock release on any exception path"
    - "retry threshold expressed as exported module constant (MAX_RETRY) for single source of truth"

key-files:
  created: []
  modified:
    - web/src/hooks/useSyncEngine.ts
    - web/src/hooks/useSyncEngine.test.ts

key-decisions:
  - "Used `item.retryCount >= MAX_RETRY` (not `+1 >= MAX_RETRY`) so test setup incrementing retryCount MAX_RETRY times triggers removal on next failure"
  - "Toast message format: 'Sync failed after 3 attempts — removed {item label}.' — friendly, identifies item type + resource"
  - "Post-sync invalidation block moved inside try{} so any invalidateQueries exception also triggers finally lock release"
  - "Updated pre-existing test 'stops drain (breaks loop) on network error' to assert the new continue behavior — that old test encoded the exact bug this plan fixes"

requirements-completed: [REL-01, REL-02]

duration: ~10min
completed: 2026-04-04
---

# Phase 75 Plan 02: C14 + C15 Sync Engine Fixes Summary

**drainQueue now releases its lock in a finally block, continues processing after transient errors, and drops + toasts items that exceed MAX_RETRY=3 attempts.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `MAX_RETRY = 3` exported as module-level constant
- `drainQueue` body wrapped in `try { ... } finally { setSyncing(false) }`
- Removed `break` on transient error — replaced with `continue`
- On failure when `item.retryCount >= MAX_RETRY`: remove item + fire `toast.error` with type-specific label (door knock / call record) and resource id
- All 31 tests in `web/src/hooks/useSyncEngine.test.ts` green (was 30 pass / 1 fail)
- `npx tsc --noEmit` clean

## Task Commits

1. **Task 1: MAX_RETRY + try/finally + continue-on-transient + remove-and-toast** — `4a6bb30` (fix)

## Files Created/Modified
- `web/src/hooks/useSyncEngine.ts` — Added `MAX_RETRY` export; refactored `drainQueue` with outer try/finally, replaced break with continue, added retry-exceeded branch with remove + toast.error
- `web/src/hooks/useSyncEngine.test.ts` — Updated one pre-existing test that asserted the old (buggy) break-on-transient behavior to reflect the new contract

## Decisions Made
- Retry threshold check uses `item.retryCount >= MAX_RETRY` so the Plan 01 test that pumps `incrementRetry` MAX_RETRY times and expects removal on next failure passes as-written.
- Toast copy is specific but non-alarming: includes item type ("door knock" / "call record") + resourceId so volunteers know which item was dropped.
- Entire post-sync invalidation block sits INSIDE `try{}` so the C14 lock also releases if `invalidateQueries` throws.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Updated stale pre-existing test**
- **Found during:** Task 1 verification
- **Issue:** Test "stops drain (breaks loop) on network error after incrementing retry" (lines 270-302 pre-edit) asserted `callCount === 1` and both items remain — this encodes the exact C15 bug being fixed. It directly contradicts the new Plan 01 RED test "continues queue after transient error" at line 600.
- **Fix:** Renamed test to "continues drain on network error after incrementing retry (C15 fix — no break)" and updated assertions: `callCount === 2`, first item retried (retryCount=1) stays, second item succeeded and removed.
- **Files modified:** web/src/hooks/useSyncEngine.test.ts
- **Commit:** 4a6bb30

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
- Plan 03 (C16 callingStore PII) operates on disjoint files (callingStore.ts) — safe to run in parallel / next.
- Plan 04 (H29 useFieldOps query keys) independent.

**Verification command:**
```bash
cd web && npx vitest run src/hooks/useSyncEngine.test.ts
cd web && npx tsc --noEmit
```
Expected: 31 passing, tsc clean.

## Self-Check: PASSED

**Files verified:**
- FOUND: web/src/hooks/useSyncEngine.ts
- FOUND: web/src/hooks/useSyncEngine.test.ts

**Commits verified:**
- FOUND: 4a6bb30

---
*Phase: 75-reliability-frontend-state-pii-hygiene*
*Completed: 2026-04-04*
