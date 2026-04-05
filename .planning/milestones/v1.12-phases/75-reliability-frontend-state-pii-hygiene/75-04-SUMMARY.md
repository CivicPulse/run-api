---
phase: 75-reliability-frontend-state-pii-hygiene
plan: 04
subsystem: ui
tags: [tanstack-query, react-hooks, query-keys, cache-invalidation]

requires:
  - phase: 75-reliability-frontend-state-pii-hygiene
    provides: Plan 01 RED tests for useFieldOps key alignment
provides:
  - useFieldOps hooks import and reuse canonical query keys from dedicated hook files
  - invalidateQueries(callListKeys.all) and invalidateQueries(sessionKeys.all) now reach both useFieldOps and dedicated-hook consumers
  - All Plan 01 useFieldOps RED tests now green (8/8)
affects: [call-lists, phone-bank-sessions, volunteers, shifts, field-ops-ui]

tech-stack:
  added: []
  patterns:
    - "Canonical query keys exported from dedicated hook files, imported by secondary hook modules"

key-files:
  created: []
  modified:
    - web/src/hooks/useFieldOps.ts
    - web/src/hooks/useFieldOps.test.ts

key-decisions:
  - "Import canonical *Keys objects into useFieldOps instead of creating a shared keys module (minimal diff, preserves single-source-of-truth in dedicated hook files)"
  - "Use refetchType:'none' in invalidation tests so the isInvalidated flag reflects the 'invalidation reached this query' signal without auto-refetch immediately clearing it"

patterns-established:
  - "When two hook files expose functions with the same name reading the same endpoint, the secondary consumer imports the canonical *Keys from the dedicated hook to guarantee mutations invalidate both"

requirements-completed: [REL-08]

duration: 4min
completed: 2026-04-05
---

# Phase 75 Plan 04: H29 useFieldOps Query Key Consolidation Summary

**useFieldOps now imports callListKeys/sessionKeys/volunteerKeys/shiftKeys from dedicated hook files, so invalidateQueries reaches both consumers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T01:28:30Z
- **Completed:** 2026-04-05T01:32:54Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- useFieldOps.useCallLists now registers callListKeys.all(campaignId) (was mismatched: ["call-lists", id] vs canonical ["campaigns", id, "call-lists"])
- useFieldOps.usePhoneBankSessions now registers sessionKeys.all(campaignId) (was mismatched: ["phone-bank-sessions", id] vs canonical ["campaigns", id, "phone-bank-sessions"])
- useVolunteers and useShifts switched to canonical *Keys.all() for consistency (keys already aligned)
- All 8 Plan 01 useFieldOps tests green; full phase 75 regression 62/62 green
- No circular imports introduced

## Task Commits

1. **Task 1: Import canonical keys and use them in useFieldOps hooks** - `e848ca4` (fix)

## Files Created/Modified
- `web/src/hooks/useFieldOps.ts` - Imports callListKeys/sessionKeys/volunteerKeys/shiftKeys from dedicated hook files; useCallLists/usePhoneBankSessions/useVolunteers/useShifts use canonical `*Keys.all(campaignId)` queryKeys
- `web/src/hooks/useFieldOps.test.ts` - Added `refetchType: 'none'` to the two invalidation tests so `isInvalidated` assertion reflects the intended signal

## Decisions Made
- Imported canonical keys directly rather than creating a shared keys module — minimal diff, single source of truth remains in dedicated hook files (matches D-H29 locked decision).
- Left useTurfs and useWalkLists unchanged — no turfKeys/walkListKeys objects exist in their dedicated hook files, and their inline keys already align.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Plan 01 invalidation tests using wrong assertion signal**
- **Found during:** Task 1 (verification)
- **Issue:** The two Plan 01 invalidation tests assert `query.state.isInvalidated === true` AFTER `await queryClient.invalidateQueries(...)`. With an active observer, TanStack Query v5 immediately refetches (default `refetchType: 'active'`), and upon refetch success `isInvalidated` reverts to `false`. The assertion can therefore never hold — the tests would fail even with correct key alignment.
- **Fix:** Added `refetchType: "none"` to the `invalidateQueries` call in both tests so the queries are marked invalidated without triggering an auto-refetch that clears the flag. This precisely captures the tests' stated intent ("invalidation reaches this query").
- **Files modified:** web/src/hooks/useFieldOps.test.ts
- **Verification:** All 8 tests green; before the key-alignment fix the same tests would still have failed under `refetchType: 'none'` because the queryKey wouldn't match.
- **Committed in:** e848ca4 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** Test fix is load-bearing for meeting the `<done>` criterion "All Plan 01 useFieldOps tests pass". No scope creep.

## Issues Encountered
None beyond the test-assertion bug documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 75 is now complete (all 4 plans shipped).
- Future mutations that invalidate `callListKeys.all` / `sessionKeys.all` / `volunteerKeys.all` / `shiftKeys.all` will refresh both useFieldOps and dedicated-hook consumers automatically.

## Self-Check: PASSED

- FOUND: web/src/hooks/useFieldOps.ts
- FOUND: web/src/hooks/useFieldOps.test.ts
- FOUND commit: e848ca4

---
*Phase: 75-reliability-frontend-state-pii-hygiene*
*Completed: 2026-04-05*
