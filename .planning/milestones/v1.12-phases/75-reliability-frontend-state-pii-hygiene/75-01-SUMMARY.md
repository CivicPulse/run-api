---
phase: 75-reliability-frontend-state-pii-hygiene
plan: 01
subsystem: testing
tags: [vitest, react-query, zustand, pii, offline-sync, tdd]

requires:
  - phase: prior
    provides: useSyncEngine drainQueue, callingStore persist, useFieldOps, canvassingStore.sanitizePersistedCanvassingState (reference pattern)
provides:
  - Failing Vitest stubs for C14 (try/finally lock release)
  - Failing Vitest stubs for C15 (continue-on-transient + MAX_RETRY removal + toast)
  - Failing Vitest stubs for C16 (sanitizePersistedCallingState PII stripping)
  - Failing Vitest stubs for H29 (useFieldOps query key alignment with dedicated hook keys)
affects: [75-02, 75-03, 75-04]

tech-stack:
  added: []
  patterns:
    - "RED-before-GREEN: Plan 01 locks behavioral contracts in test form before implementation"
    - "Query key equality assertion via queryClient.getQueryCache().getAll()[0].queryKey"
    - "PII round-trip test: persist envelope → sanitizer → JSON.stringify scan for PII markers"

key-files:
  created:
    - web/src/hooks/useFieldOps.test.ts
  modified:
    - web/src/hooks/useSyncEngine.test.ts
    - web/src/stores/callingStore.test.ts

key-decisions:
  - "Appended RED tests to existing useSyncEngine.test.ts and callingStore.test.ts rather than creating new files — keeps single source of truth per hook/store"
  - "Used MAX_RETRY constant import in tests so the implementation value (3) is the single source of truth once exported"
  - "Query key tests inspect QueryClient cache after renderHook rather than mocking useQuery — proves actual runtime key registration"

patterns-established:
  - "Test structure: existing passing tests remain untouched; Phase 75 RED tests grouped under marked describe blocks with REL-XX tags"
  - "E.164 regex scan as PII leak canary in serialized output"

requirements-completed: [REL-01, REL-02, REL-03, REL-08]

duration: ~15min
completed: 2026-04-04
---

# Phase 75 Plan 01: Failing Vitest Stubs for C14/C15/C16/H29 Summary

**RED test stubs locking behavioral contracts for sync-engine lock release, MAX_RETRY removal+toast, callingStore PII sanitizer, and useFieldOps query-key alignment before Plans 02-04 implement them.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-05T01:12:00Z (approx)
- **Completed:** 2026-04-05T01:26:55Z
- **Tasks:** 3
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- 22 new failing tests across 3 files locking in expected Phase 75 behavior
- 40 pre-existing tests still passing — no regressions
- All 4 codebase-review items (C14, C15, C16, H29) represented by at least one failing assertion
- Happy-path and exception-path both covered for sync engine
- PII round-trip test asserts no E.164, no voter_name, no attempt history leaks to sessionStorage

## Task Commits

1. **Task 1: useSyncEngine.test.ts — C14/C15/MAX_RETRY** — `6641bd1` (test)
2. **Task 2: callingStore.test.ts — C16 PII sanitizer** — `13911d8` (test)
3. **Task 3: useFieldOps.test.ts — H29 key alignment** — `5199e88` (test)

## Files Created/Modified
- `web/src/hooks/useSyncEngine.test.ts` — Appended 7 failing tests: 2 lock-release (try/finally), 1 continue-on-transient, 2 MAX_RETRY removal+toast, 2 MAX_RETRY export+value
- `web/src/stores/callingStore.test.ts` — Appended 13 failing tests: export, voter_name/phone_numbers/phone_attempts/phoneNumberUsed stripping, non-PII preservation, defensive input, envelope unwrapping, sessionStorage round-trip
- `web/src/hooks/useFieldOps.test.ts` — Created with 8 tests (4 failing today, 4 passing on already-aligned keys): callList/session/volunteer/shift/turfs/walkLists key registration, plus 2 invalidation round-trip proofs

## Decisions Made
- Appended RED tests to existing test files instead of creating parallel new ones — single source of truth per module.
- Imported `MAX_RETRY` in the test rather than hardcoding 3 throughout assertions — Plan 02's exported value drives all retry-count setup.
- Used `queryClient.getQueryCache().getAll()[0].queryKey` for H29 assertions — proves the runtime key, not a mocked shape.

## Deviations from Plan
None — plan executed exactly as written. Plan described creating three test files; two already existed so new tests were appended with clearly-marked `Phase 75 Plan 01 — RED tests` banners.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- **Plan 02 (C14/C15 fixes)** has 7 clear RED targets in useSyncEngine.test.ts.
- **Plan 03 (C16 sanitizer)** has 13 clear RED targets in callingStore.test.ts.
- **Plan 04 (H29 alignment)** has 4 clear RED targets (2 key-equality, 2 invalidation) in useFieldOps.test.ts.
- All tests fail for documented behavioral reasons (MAX_RETRY not exported, sanitizePersistedCallingState not exported, queryKey mismatches) — no compile errors beyond the expected missing exports.

**Verification command:**
```bash
cd web && npx vitest run src/hooks/useSyncEngine.test.ts src/stores/callingStore.test.ts src/hooks/useFieldOps.test.ts
```
Expected: 22 failing, 40 passing.

## Self-Check: PASSED

**Files verified:**
- FOUND: web/src/hooks/useSyncEngine.test.ts (MAX_RETRY import + 7 new tests)
- FOUND: web/src/stores/callingStore.test.ts (sanitizePersistedCallingState import + 13 new tests)
- FOUND: web/src/hooks/useFieldOps.test.ts (created, 8 tests)

**Commits verified:**
- FOUND: 6641bd1 (Task 1)
- FOUND: 13911d8 (Task 2)
- FOUND: 5199e88 (Task 3)

---
*Phase: 75-reliability-frontend-state-pii-hygiene*
*Completed: 2026-04-04*
