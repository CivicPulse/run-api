---
phase: 107
plan: 05
subsystem: canvassing-wizard
tags: [canvassing, hooks, sonner, race-condition, vitest, react, zustand, accessibility]
requires:
  - phase: 107-01 (usePrefersReducedMotion)
  - phase: 107-04 (announceAutoAdvance + advanceAfterOutcome helpers)
provides:
  - Synchronous skip handler with isPending double-tap guard
  - unskipEntry action on canvassingStore (D-05 reversibility)
  - Skipped — Undo info toast with skipAtCompletedCount snapshot
  - Can't undo — already moved on warning toast
  - Skip didn't sync — still saved on this device error toast
  - isSkipPending exposed from useCanvassingWizard hook
  - HouseholdCard Skip button + OutcomeGrid disabled-while-pending gating
affects:
  - 107-08 (E2E specs will exercise the new skip + undo flow)
  - 110 (offline queue inherits the local-skip-without-rollback contract)
tech-stack:
  added: []
  patterns:
    - "Snapshot-completed-count gate for Undo validity (no other outcome recorded since)"
    - "Mutation-pending guard replaces wall-clock setTimeout to close double-tap race"
    - "Local skip is reversible by design (D-05) so server failure does NOT roll back"
    - "Toast info+action pattern for non-blocking reversible operations"
key-files:
  created:
    - .planning/phases/107-canvassing-wizard-fixes/107-05-SUMMARY.md
  modified:
    - web/src/stores/canvassingStore.ts
    - web/src/hooks/useCanvassingWizard.ts
    - web/src/hooks/useCanvassingWizard.test.ts
    - web/src/components/field/HouseholdCard.tsx
    - web/src/components/field/VoterCard.tsx
key-decisions:
  - "300ms setTimeout removed entirely; replaced with skipEntryMutation.isPending guard per RESEARCH.md §2 option (c) — closes both the slow-network race AND the double-tap race in one structural fix"
  - "skipAtAddressIndex + skipAtCompletedCount snapshotted at skip time so the Undo closure can detect 'recorded another outcome since' without polling — purely lexical"
  - "Server skip failure does NOT roll back local state per D-05 (skip is reversible by design); a Skip didn't sync toast surfaces the failure and the volunteer can re-activate from All Doors"
  - "outcomesDisabled threaded through HouseholdCard → VoterCard → OutcomeGrid (rather than only disabling the Skip button) so the entire interaction surface is gated while a skip is pending — anti-double-tap rule per UI-SPEC §Outcome Button States applies to outcome buttons too"
  - "Toast Undo onClick reads useCanvassingStore.getState() at click-time (not closure-captured) so it sees the LATEST completedEntries; only entriesToSkip is closure-captured because that set is immutable for this skip operation"
  - "Existing test 'skips the current address...' updated to assert mutate was called with (id, options) since the mutation now passes onError"
requirements-completed: [CANV-02]
duration: 18 min
completed: 2026-04-10
---

# Phase 107 Plan 05: CANV-02 Skip Race Fix Summary

**Removed the 300ms setTimeout race in handleSkipAddress and replaced it with a synchronous local skip + immediate advance + isPending double-tap guard + Undo toast — closing the slow-network race AND the double-tap bug at the structural level rather than tuning a wall-clock timeout.**

## Performance

- **Started:** 2026-04-10T23:32:00Z
- **Completed:** 2026-04-10T23:50:00Z
- **Duration:** ~18 min
- **Tasks:** 1 (TDD refactor + tests in one commit)
- **Files modified:** 5
- **Commits:** 1 task commit + 1 metadata commit (this SUMMARY)

## Accomplishments

- CANV-02 fixed at root cause per D-07 + RESEARCH.md §2 option (c)
- Skip is reversible via Undo toast per D-05/D-06
- Double-tap race closed by `skipEntryMutation.isPending` guard (not a tuned timeout)
- 6 new vitest cases on top of the 13 from 107-04 (19 total) — all passing
- TypeScript clean

## Task Commits

1. **Task 1: Refactor handleSkipAddress + Undo toast + tests** — `e9e9cac` (fix)

**Plan metadata:** (added in final commit below) (docs)

## Files Created/Modified

- `web/src/stores/canvassingStore.ts` — Added `unskipEntry(entryId)` action + interface signature
- `web/src/hooks/useCanvassingWizard.ts` — Refactored `handleSkipAddress` per RESEARCH.md §2 option (c); destructured `unskipEntry` from store; exposed `isSkipPending` in hook return
- `web/src/hooks/useCanvassingWizard.test.ts` — Mocks updated (`toast.info`, `toastBase`, `skipMutationState.isPending` getter); existing skip test updated to expect 2-arg `mutate` call; 6 new tests added
- `web/src/components/field/HouseholdCard.tsx` — `isSavingDoorKnock` + `isSkipPending` props added; Skip button disabled + aria-disabled + aria-label per UI-SPEC §Skip Button Affordance; `outcomesDisabled` propagated to VoterCard
- `web/src/components/field/VoterCard.tsx` — `outcomesDisabled` prop forwarded to `<OutcomeGrid disabled={…} />`

(Note: `web/src/routes/field/$campaignId/canvassing.tsx` already received the `isSkipPending` plumbing in commit `cd7e629` from Wave 3 partner plan 107-06; no further edit needed.)

## What Was Built

### Production code

```ts
// useCanvassingWizard.ts — new handleSkipAddress
const handleSkipAddress = useCallback(() => {
  if (!currentHousehold) return
  if (skipEntryMutation.isPending) return // anti-double-tap guard

  const entriesToSkip = currentHousehold.entries
    .filter(
      (entry) =>
        completedEntries[entry.id] === undefined &&
        !skippedEntries.includes(entry.id),
    )
    .map((entry) => entry.id)

  if (entriesToSkip.length === 0) {
    advanceRef.current()
    return
  }

  const skipAtAddressIndex = useCanvassingStore.getState().currentAddressIndex
  const skipAtCompletedCount = Object.keys(
    useCanvassingStore.getState().completedEntries,
  ).length

  for (const id of entriesToSkip) skipEntry(id)
  advanceRef.current()

  toast.info("Skipped — Undo", {
    id: "skip-undo",
    duration: 4000,
    action: {
      label: "Undo",
      onClick: () => {
        const state = useCanvassingStore.getState()
        const completedSince =
          Object.keys(state.completedEntries).length > skipAtCompletedCount
        if (completedSince) {
          toast("Can't undo — already moved on", {
            id: "skip-undo-unavailable",
            duration: 3000,
          })
          return
        }
        for (const id of entriesToSkip) unskipEntry(id)
        useCanvassingStore.setState({ currentAddressIndex: skipAtAddressIndex })
      },
    },
  })

  for (const id of entriesToSkip) {
    skipEntryMutation.mutate(id, {
      onError: () => {
        toast.error("Skip didn't sync — still saved on this device", {
          id: "skip-sync-error",
        })
      },
    })
  }
}, [currentHousehold, completedEntries, skippedEntries, skipEntry, unskipEntry, skipEntryMutation])
```

### New tests (6)

1. **handleSkipAddress advances synchronously without setTimeout** — asserts `currentAddressIndex === 1` immediately after the call (no `waitFor` needed for timing)
2. **double-tap Skip is guarded by isPending and only advances once** — second tap with `skipMutationState.isPending = true` is a no-op; mutate called once
3. **skip fires sonner info toast with Undo action** — asserts `toastInfo` called with `id: "skip-undo"`, `duration: 4000`, action `label: "Undo"`
4. **Undo toast action restores skipped entries to pending if no outcome recorded since** — captures the toast action's `onClick`, invokes it, asserts `skippedEntries === []` and `currentAddressIndex === 0`
5. **Undo after another outcome was recorded shows 'Can't undo' toast and is a no-op** — calls `recordOutcome("entry-b", "not_home")` between skip and undo; asserts `toastBase` fires `Can't undo — already moved on` and skipped entries unchanged
6. **skip mutation failure surfaces error toast and keeps local skip** — `skipMutate.mockImplementation` invokes `onError` immediately; asserts `toast.error` fires `Skip didn't sync — still saved on this device` AND `skippedEntries` still contains `entry-a` (D-05 no-rollback)

## Verification

- `cd web && npx vitest run src/hooks/useCanvassingWizard.test.ts` → **19 passed** (13 from 107-04 + 6 new)
- `cd web && npx vitest run src/routes/field/$campaignId/canvassing.test.tsx` → **4 passed** (HouseholdCard signature change did not break the route tests)
- `cd web && npx tsc --noEmit` → clean exit

### Acceptance Criteria Checks

- `grep -c "setTimeout.*300" web/src/hooks/useCanvassingWizard.ts` → **0** (D-07 satisfied)
- `grep -n "skipEntryMutation.isPending" web/src/hooks/useCanvassingWizard.ts` → **2 hits** (guard + return value)
- `grep -n "Skipped — Undo" web/src/hooks/useCanvassingWizard.ts` → **1 hit**
- `grep -n "Can't undo — already moved on" web/src/hooks/useCanvassingWizard.ts` → **1 hit**
- `grep -n "Skip didn't sync" web/src/hooks/useCanvassingWizard.ts` → **1 hit**
- `grep -n "unskipEntry" web/src/stores/canvassingStore.ts` → **2 hits** (interface + impl)
- `grep -n "isSkipPending" web/src/components/field/HouseholdCard.tsx` → **3 hits** (prop type, default, skipDisabled calc)
- `grep -n "Skip this house. You can come back to it." web/src/components/field/HouseholdCard.tsx` → **1 hit**
- `grep -ni "double-tap" web/src/hooks/useCanvassingWizard.test.ts` → **1 hit** (test name)
- `grep -n "Undo toast action restores" web/src/hooks/useCanvassingWizard.test.ts` → **1 hit** (test name)

## Decisions Made

See frontmatter `key-decisions`. Highlights:

1. **Structural fix, not timeout tuning.** The 300ms `setTimeout` was hiding a race between local Zustand state, the skip mutation's invalidate/refetch, and the households memo's pinning logic. Replacing it with `skipEntryMutation.isPending` removes the wall-clock dependency entirely AND closes the double-tap race in the same change.
2. **Snapshot-completed-count for Undo validity.** Rather than wiring an event listener for "outcome recorded after skip", we capture `Object.keys(completedEntries).length` at skip time and compare against the live count when Undo fires. Simpler than reactive state, identical semantics for the use case.
3. **No rollback on server failure.** D-05 says skip is reversible by design — if the server skip mutation fails, the volunteer can re-activate the household from All Doors. Rolling back the local skip would create a confusing "I tapped skip and the house is back" surprise. The error toast reassures the volunteer that the skip is at least saved locally.
4. **Outcome buttons disabled too, not just Skip.** UI-SPEC §Outcome Button States anti-double-tap rule applies to the entire interaction surface during a pending mutation. Threading `outcomesDisabled` through HouseholdCard → VoterCard → OutcomeGrid is the cleanest way to apply this without spreading mutation state into VoterCard.
5. **Existing skip test updated, not replaced.** The existing test "skips the current address back into the queue and advances to the next door" still exercises the happy path; only the `skipMutate.toHaveBeenCalledWith("entry-a")` assertion was loosened to `("entry-a", expect.any(Object))` because mutate now passes an `onError` options bag.
6. **Mock plumbing for `isPending` getter.** The skip mutation mock now uses a getter on `skipMutationState.isPending` so the double-tap test can flip it between calls without re-mocking. Reset to `false` in `beforeEach`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OutcomeGrid disabled gating required threading through VoterCard, not direct route wiring**
- **Found during:** Task 1, Step 3 of the plan (OutcomeGrid disabled gate)
- **Issue:** The plan instructed to wire `disabled={isSavingDoorKnock || isSkipPending}` directly from `canvassing.tsx` to `OutcomeGrid`, but `OutcomeGrid` is rendered transitively via `VoterCard` (inside `HouseholdCard`), not directly from the route. There is no direct binding point in `canvassing.tsx`.
- **Fix:** Threaded a new `outcomesDisabled` prop through `HouseholdCard` → `VoterCard` → `OutcomeGrid`. `HouseholdCard` derives `skipDisabled = isSavingDoorKnock || isSkipPending` and forwards it as `outcomesDisabled` to each `VoterCard`. `VoterCard` forwards to `OutcomeGrid disabled={…}`.
- **Files modified:** `web/src/components/field/HouseholdCard.tsx`, `web/src/components/field/VoterCard.tsx`
- **Verification:** Existing canvassing route tests still pass (4/4); type-check clean.
- **Committed in:** `e9e9cac`

**2. [Rule 3 - Blocking] Existing skip test assertion broke when mutate signature changed**
- **Found during:** Task 1, after running the test suite the first time
- **Issue:** The existing test at line ~315 asserted `expect(skipMutate).toHaveBeenCalledWith("entry-a")` but the new code calls `skipEntryMutation.mutate(id, { onError: …})`, so the mock receives 2 args.
- **Fix:** Loosened to `toHaveBeenCalledWith("entry-a", expect.any(Object))`.
- **Files modified:** `web/src/hooks/useCanvassingWizard.test.ts`
- **Verification:** Test passes.
- **Committed in:** `e9e9cac`

**3. [Rule 3 - Blocking] sonner mock missing `info` method**
- **Found during:** Task 1, after writing the new tests
- **Issue:** Existing mock was `Object.assign(vi.fn(), { error, success })`. The new code calls `toast.info(...)` and `toast(...)` (the base function). Without `info` on the mock, the call would crash.
- **Fix:** Added `toastInfo` and `toastBase` hoisted vars; mock is now `Object.assign(toastBase, { error, success, info })`. Reset both in `beforeEach`.
- **Files modified:** `web/src/hooks/useCanvassingWizard.test.ts`
- **Verification:** All 19 tests pass.
- **Committed in:** `e9e9cac`

**4. [Rule 3 - Blocking] canvassing.tsx isSkipPending wiring already landed in 107-06**
- **Found during:** Task 1, Step 3 verification
- **Issue:** The plan instructed me to add `isSkipPending` destructuring + `isSkipPending={isSkipPending}` to `HouseholdCard` in `canvassing.tsx`. But Wave 3 partner plan 107-06 (commit `cd7e629`) already pre-wired this exact change because the planner staged it across both parallel plans.
- **Fix:** None needed — verified the file already contains the wiring (`grep -n isSkipPending` returns 2 hits in `canvassing.tsx`). My local edits were no-op overwrites of identical code, which `git diff` correctly reports as zero changes. Documented here for traceability.
- **Files modified:** none (already in place)
- **Verification:** `grep -n "isSkipPending" web/src/routes/field/$campaignId/canvassing.tsx` → 2 hits.
- **Committed in:** `cd7e629` (Plan 107-06, not this plan)

---

**Total deviations:** 4 auto-fixed (all Rule 3 — Blocking, all in test/wiring scaffolding; production hook code matched the plan exactly).
**Impact on plan:** None — all auto-fixes were necessary for tests to compile/run. The structural fix to `handleSkipAddress` matches RESEARCH.md §2 option (c) verbatim.

## Authentication Gates

None.

## Issues Encountered

None blocking.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `web/src/stores/canvassingStore.ts` (modified, contains `unskipEntry`)
- FOUND: `web/src/hooks/useCanvassingWizard.ts` (modified, no `setTimeout.*300`, has `skipEntryMutation.isPending` guard, has `Skipped — Undo`, `Can't undo`, `Skip didn't sync`)
- FOUND: `web/src/hooks/useCanvassingWizard.test.ts` (modified, 19 tests)
- FOUND: `web/src/components/field/HouseholdCard.tsx` (modified, `isSkipPending` prop + Skip aria-label)
- FOUND: `web/src/components/field/VoterCard.tsx` (modified, `outcomesDisabled` prop)
- FOUND: commit `e9e9cac` (fix(107-05): remove 300ms setTimeout race in handleSkipAddress)
- 19/19 tests pass; 4/4 canvassing route tests still pass
- `npx tsc --noEmit` clean

## Next Phase Readiness

- CANV-02 fixed; the Skip-house bug that motivated the entire plan no longer reproduces under any of the analyzed race conditions
- Plan 107-06 already shipped (Wave 3 partner) so the only remaining work in Phase 107 is plans 07/08/09
- The `isSkipPending` hook return value and the `outcomesDisabled` prop are now load-bearing for any future "in-flight mutation" UI state — keep them in mind when adding new mutations to the wizard
- E2E coverage for the new skip+undo flow lands in plan 107-08

---
*Phase: 107-canvassing-wizard-fixes*
*Completed: 2026-04-10*
