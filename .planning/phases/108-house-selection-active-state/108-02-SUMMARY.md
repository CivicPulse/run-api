---
phase: 108-house-selection-active-state
plan: 02
subsystem: canvassing-field-mode
tags: [fix, tdd, select-01, pin-clear, render-path-guard, wave-2]
requirements: [SELECT-01]
dependency_graph:
  requires:
    - "Plan 108-01 wave-0 (canvassing-wizard.spec.ts House C fixture — not used directly here, but the 3-household shape is prerequisite for Plan 108-05)"
  provides:
    - "Wrapped handleJumpToAddress that clears pinnedHouseholdKey + fires haptic (consumed by Plan 108-03 map-tap per D-07)"
    - "Render-path regression guard template for list-tap / map-tap navigation (D-13)"
  affects:
    - .planning/phases/108-house-selection-active-state/108-03-PLAN.md
    - .planning/phases/108-house-selection-active-state/108-05-PLAN.md
tech_stack:
  added: []
  patterns:
    - "107-08.1 wrap-the-action pin-clear pattern replicated for jumpToAddress (third intentional-navigation entry point)"
    - "WizardHarness DOM-render regression guard (list-tap variant)"
key_files:
  created: []
  modified:
    - web/src/hooks/useCanvassingWizard.ts
    - web/src/hooks/useCanvassingWizard.test.ts
    - web/src/components/field/HouseholdCard.test.tsx
decisions:
  - "D-01/D-07 satisfied: handleJumpToAddress is the single wrapped action both list-tap (today) and map-tap (Plan 108-03) will funnel through."
  - "D-02 satisfied: tap-to-activate feedback is card-swap + haptic only — no toast added."
  - "D-13 satisfied: render-path test written, proven RED on buggy code, GREEN on fix."
  - "pinnedHouseholdKey intentionally NOT exposed on the hook result (removed in 107-04). The hook unit test asserts currentAddressIndex + vibrate spy; the DOM-level pin-clear assertion lives in HouseholdCard.test.tsx where the `households` memo re-pin behavior is observable."
  - "useLayoutEffect clamp uses storeJumpToAddress directly (raw, unwrapped) so sort-mode-driven clamps do NOT clear the user's viewing pin. This is the 107-08.1 pattern invariant."
metrics:
  duration: "~30 min"
  completed: 2026-04-11
  tasks_total: 3
  tasks_completed: 3
---

# Phase 108 Plan 02: SELECT-01 List-Tap Pin-Clear Fix Summary

Applied the 107-08.1 pin-clear wrap pattern to `handleJumpToAddress`,
locked the new behavior with a hook unit test and a DOM-render
regression guard, and proved RED→GREEN on the render-path guard per
D-13. Closes the list-tap half of SELECT-01 and sets up the shared
wrapped callback Plan 108-03 will reuse for map-tap per D-07.

## What Shipped

### Task 1 — `useCanvassingWizard.ts` (fix + wrap)

Three edits in `web/src/hooks/useCanvassingWizard.ts`:

1. **Destructure rename.** The store's `jumpToAddress` is now
   destructured as `storeJumpToAddress` alongside the existing
   `storeAdvanceAddress` / `storeSkipEntry` aliases from 107-08.1.
2. **Wrapped `handleJumpToAddress`.** Now a `useCallback` that calls
   `setPinnedHouseholdKey(null)` BEFORE delegating to
   `storeJumpToAddress(index)`, then fires `navigator.vibrate(50)`
   through a feature-detect guard (`typeof navigator !== "undefined"
   && "vibrate" in navigator` + try/catch). The callback comment
   points forward to Plan 108-03 map-tap consumption per D-07.
3. **`useLayoutEffect` clamp.** The two `jumpToAddress(...)` calls
   inside the clamp effect now call `storeJumpToAddress` directly
   (raw, unwrapped). This preserves the 107-08.1 pattern invariant —
   sort-mode-driven clamps must not clear the pin; only intentional
   user navigation does. The effect's dependency array was updated
   to reference `storeJumpToAddress` instead of `jumpToAddress`.

Verification counters (done criteria):

| Check | Expected | Actual |
|---|---|---|
| `grep -c 'setPinnedHouseholdKey(null)' src/hooks/useCanvassingWizard.ts` | ≥ 4 | **4** |
| `grep -c 'storeJumpToAddress' src/hooks/useCanvassingWizard.ts` | ≥ 3 | **6** |
| `grep -c 'navigator.vibrate(50)' src/hooks/useCanvassingWizard.ts` | ≥ 1 | **2** (announceAutoAdvance + handleJumpToAddress) |
| `cd web && npx tsc --noEmit` | clean | **clean** |
| No new `setTimeout` | none | **none** |
| No new `toast(...)` on tap path | none | **none** |

### Task 2 — `useCanvassingWizard.test.ts` (hook unit layer)

Two new cases appended to the `useCanvassingWizard` describe block:

- **`handleJumpToAddress advances currentAddressIndex and fires
  haptic`** — seeds the `multiVoterEntries` fixture, waits for the
  household list to hydrate, clears the existing `navigator.vibrate`
  spy, calls `result.current.handleJumpToAddress(1)` inside `act`,
  then asserts `useCanvassingStore.getState().currentAddressIndex ===
  1` and `navigator.vibrate` was called with `50`. The DOM-level
  pin-clear assertion is deferred to Task 3 because
  `pinnedHouseholdKey` is not exposed on the hook result (removed in
  Plan 107-04) — the hook test documents this omission with an
  inline comment.
- **`handleJumpToAddress silently skips vibrate when not
  supported`** — mirrors the existing auto-advance `vibrate`
  feature-detect test; deletes `navigator.vibrate`, invokes
  `handleJumpToAddress(1)`, asserts the call does not throw and
  `currentAddressIndex` still advances.

### Task 3 — `HouseholdCard.test.tsx` (render-path regression guard)

Appended a third test to the 107-08.1 `HouseholdCard render-path
regression` describe block, reusing the existing `WizardHarness`
component verbatim — no harness changes required because the harness
already exposes the entire wizard API via the `onReady` callback
including `handleJumpToAddress`.

The new test `rendered address swaps to the next household after a
list-tap (handleJumpToAddress)`:

1. Renders `WizardHarness` against the `multiVoterEntries` fixture (3
   voters at `house-multi` + 1 voter at `house-next`).
2. Waits for `rendered-household-key` to be `house-multi`.
3. Calls `wizardApi.handleJumpToAddress(1)` inside `act`.
4. `waitFor`s on `rendered-household-key === "house-next"` AND the
   `rendered-address` text containing `HOUSE_B_LINE1 ("400 Elm St")`
   AND NOT containing `HOUSE_A_LINE1 ("300 Pine St")`.

On the fixed code the test passes in ~36ms. On buggy code (pin-clear
commented out) it fails with `Expected "house-next" / Received
"house-multi"` — see the full verification below.

## Regression-Guard Verification

Load-bearing acceptance criterion inherited from Plan 107-08.1. The
render-path test must FAIL on the buggy code and PASS on the fix.

### Step 1 — GREEN on fixed code

```
$ cd web && npx vitest run src/components/field/HouseholdCard.test.tsx
 ✓ src/components/field/HouseholdCard.test.tsx (3 tests) 37ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### Step 2 — Temporarily disable the pin-clear

Commented out `setPinnedHouseholdKey(null)` inside the wrapped
`handleJumpToAddress` in `useCanvassingWizard.ts` (keeping the
`useCallback` shape and the `storeJumpToAddress(index)` call intact):

```typescript
const handleJumpToAddress = useCallback(
  (index: number) => {
    // REGRESSION-GUARD TEST: pin-clear intentionally disabled.
    // setPinnedHouseholdKey(null)
    storeJumpToAddress(index)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(50)
      } catch {
        // Silent no-op (iOS Safari, desktop, permission-denied).
      }
    }
  },
  [storeJumpToAddress],
)
```

### Step 3 — RED on buggy code

```
$ cd web && npx vitest run src/components/field/HouseholdCard.test.tsx -t "list-tap"

  <body>
    <div>
      <div>
        <div data-testid="rendered-address">
          300 Pine St, Macon, GA, 31201
        </div>
        <div data-testid="rendered-household-key">
          house-multi
        </div>
      </div>
    </div>
  </body>

Expected: "house-next"
Received: "house-multi"

❯ src/components/field/HouseholdCard.test.tsx:272:72

 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
```

The rendered DOM reports `house-multi` + `300 Pine St` (House A) even
though `currentAddressIndex` advanced to 1 — exactly the class of
bug (hook state right, rendered DOM wrong) that the 107-08.1
regression guard was built to catch. The test failed loudly at the
expected line (`HouseholdCard.test.tsx:272`).

### Step 4 — Re-apply the fix, GREEN restored

Restored `setPinnedHouseholdKey(null)` inside the callback. Re-ran
the full touched-file suite:

```
$ cd web && npx vitest run src/components/field/HouseholdCard.test.tsx src/hooks/useCanvassingWizard.test.ts

 ✓ src/components/field/HouseholdCard.test.tsx (3 tests) 37ms
 ✓ src/hooks/useCanvassingWizard.test.ts (21 tests) 70ms

 Test Files  2 passed (2)
      Tests  24 passed (24)
```

```
$ cd web && npx tsc --noEmit
(clean exit, no output)
```

Regression-guard cycle RED→GREEN→RED→GREEN complete. The test is
structurally sound and will catch this bug class if it ever
reappears in the list-tap path or (once Plan 108-03 lands) the
map-tap path.

## Files Touched

- `web/src/hooks/useCanvassingWizard.ts` — destructure rename,
  wrapped `handleJumpToAddress`, clamp effect rewire
- `web/src/hooks/useCanvassingWizard.test.ts` — 2 new unit tests
- `web/src/components/field/HouseholdCard.test.tsx` — 1 new
  render-path test

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | `fix(108-02): wrap handleJumpToAddress to clear pin + fire haptic` | `fb0dd2f` |
| 2 | `test(108-02): lock handleJumpToAddress pin-clear + haptic behavior` | `9914a7a` |
| 3 | `test(108-02): render-path regression guard for list-tap (SELECT-01 D-13)` | `09a31c4` |

## Verification Results

| Check | Result |
|---|---|
| `cd web && npx tsc --noEmit` | PASS (clean) |
| `cd web && npx vitest run src/hooks/useCanvassingWizard.test.ts` | PASS (21/21) |
| `cd web && npx vitest run src/components/field/HouseholdCard.test.tsx` | PASS (3/3) |
| `grep -c 'setPinnedHouseholdKey(null)' src/hooks/useCanvassingWizard.ts ≥ 4` | PASS (4) |
| `grep -c 'storeJumpToAddress' src/hooks/useCanvassingWizard.ts ≥ 3` | PASS (6) |
| `grep -c 'navigator.vibrate(50)' src/hooks/useCanvassingWizard.ts ≥ 1` | PASS (2) |
| Regression-guard RED on buggy code | PASS (documented above, Step 3) |
| Regression-guard GREEN on fix restored | PASS (documented above, Step 4) |
| No new `setTimeout` introduced | PASS |
| No new `toast(...)` on the tap path | PASS |
| Existing 19 hook tests still passing | PASS |
| Existing 2 render-path tests still passing | PASS |

## Success Criteria

- **D-01 — handleJumpToAddress clears the pin before delegating.** SATISFIED.
  `setPinnedHouseholdKey(null)` is the first statement inside the wrapped
  callback; `storeJumpToAddress(index)` runs second; haptic third.
- **D-02 — haptic on tap, NO toast.** SATISFIED. The wrap calls
  `navigator.vibrate(50)` via feature detection and does NOT call any
  sonner `toast` / `toast.info` / `toast.success` on the tap path. No
  regression of existing auto-advance toast semantics — that lives in
  `announceAutoAdvance` untouched.
- **D-07 — both entry points funnel through the same wrap.** SATISFIED at
  the hook level. Plan 108-03 will wire `CanvassingMap` marker clicks to
  pass-through the same `handleJumpToAddress` prop.
- **D-13 — render-path test catches the bug class.** SATISFIED. RED/GREEN
  verified, documented in `## Regression-Guard Verification`.
- **No regression on phase 107 tests.** SATISFIED. 21 hook tests + 2
  render-path tests continue to pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] Worktree branch base mismatch + missing web/node_modules**

- **Found during:** pre-Task 1 environment check
- **Issue:** The worktree was checked out on `worktree-agent-a1e67061`,
  which was historically based on `gsd/v1.17-milestone` — commit
  `49cb2cb` "reset phase counters after v1.17 archive." The orchestrator
  expected the worktree to be based on `8d12c710` (the 108-01 completion
  commit on `gsd/v1.18-field-ux-polish`). `git merge-base --is-ancestor`
  reported `NOT ANCESTOR`, and `ls .planning/phases/` returned only
  v1.14..v1.17 phases — no 108-* directory existed on disk.
  Additionally, `web/node_modules/` was not present in the worktree
  (only in the main repo's `web/` checkout), which would have blocked
  every `vitest` / `tsc` invocation.
- **Fix:**
  1. `git reset --hard 8d12c710754621320b05edef260f30bfd979d108` to
     re-point the worktree branch at the expected v1.18 base. The
     working tree now contains the full phase 108 plan set and the
     upstream v1.18 source.
  2. `ln -s /home/kwhatcher/projects/civicpulse/run-api/web/node_modules
     web/node_modules` to expose the main repo's installed deps to the
     worktree without re-running `npm install`. This is the same
     approach used by other worktree agents and leaves no footprint in
     the worktree index (symlink + ignored).
- **Files modified:** worktree state only (branch pointer + symlink).
  No committed changes resulted from this step.
- **Commit:** N/A
- **Note:** This is Plan 108-01's deviation #1 recurring verbatim. A
  phase-level follow-up to the worktree bootstrap flow is warranted —
  every 108-* executor will hit this until the worktree creation
  script either bases the branch on the expected head OR installs
  `web/node_modules` on spawn. Tracked mentally here, not yet filed.

**2. [Rule 2 — Test-only deviation from plan action] Vibrate-not-supported
test added in addition to the plan's single required test**

- **Found during:** Task 2 drafting
- **Issue:** The plan action only asked for one hook test (pin-clear +
  vibrate spy), but the existing hook test file already has a parallel
  "auto-advance silently skips vibrate when not supported" test for
  `announceAutoAdvance`. Shipping only the happy-path case would leave
  the `handleJumpToAddress` feature-detect branch untested, which would
  bit-rot the guard — a future edit could delete `typeof navigator`
  and no test would catch it.
- **Fix:** Added a second test
  (`handleJumpToAddress silently skips vibrate when not supported`)
  that deletes `navigator.vibrate` and asserts the call does not throw
  and still advances the index. This mirrors the existing test pattern
  exactly and costs ~12 lines.
- **Files modified:** `web/src/hooks/useCanvassingWizard.test.ts`
- **Commit:** `9914a7a`
- **Rationale:** Rule 2 (auto-add missing critical functionality —
  test-level parity with the `announceAutoAdvance` feature-detect
  test). No impact on plan scope or runtime code.

## Known Stubs

None. All code paths are fully wired: the wrapped `handleJumpToAddress`
is exported from the hook's return object and consumed by
`DoorListView` via the existing `onJump` prop wired in
`canvassing.tsx`. No placeholders, no `TODO` markers, no hardcoded
empty data flowing to UI.

## Self-Check: PASSED

- `web/src/hooks/useCanvassingWizard.ts` — FOUND (modified)
- `web/src/hooks/useCanvassingWizard.test.ts` — FOUND (modified)
- `web/src/components/field/HouseholdCard.test.tsx` — FOUND (modified)
- Commit `fb0dd2f` — FOUND in git log (`fix(108-02): wrap
  handleJumpToAddress to clear pin + fire haptic`)
- Commit `9914a7a` — FOUND in git log (`test(108-02): lock
  handleJumpToAddress pin-clear + haptic behavior`)
- Commit `09a31c4` — FOUND in git log (`test(108-02): render-path
  regression guard for list-tap (SELECT-01 D-13)`)

## Threat Flags

None. This plan touches the canvassing wizard hook and two test files
only — no new network endpoints, no auth surface, no schema changes,
no file I/O, no trust boundaries crossed. The wrapped action only
changes a client-side state order (clear pin before calling store
action) and adds a `navigator.vibrate(50)` call guarded by feature
detection. Vibrate API requires no permission and cannot leak data.
