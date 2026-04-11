# Phase 108: House Selection & Active-State — Research

**Researched:** 2026-04-10
**Domain:** web/canvassing-wizard — react-leaflet marker interactivity, tap-to-activate state machine, render-path testing
**Confidence:** HIGH (all findings verified in-tree against installed versions)

## Summary

Phase 108 is a small surgical phase on top of the v1.18 canvassing wizard. All
13 decisions (D-01..D-13) in CONTEXT.md are locked and the UI contract
(108-UI-SPEC.md) is approved. Research does NOT need to explore alternatives —
only resolve the concrete implementation gaps the planner must encode as task
actions.

Every gap the planner flagged has a clean answer already present in the
repository: react-leaflet v5 `eventHandlers` + `useMap()` + `panTo()` is
already used in `TurfOverviewMap.tsx`; the existing Leaflet mock infrastructure
in `web/src/components/canvassing/map/__mocks__/leaflet.ts` covers vitest
render-path for `CanvassingMap`; the 107-08.1 wrap-the-action pattern is in
place in `useCanvassingWizard.ts` waiting for a third wrap (`handleJumpToAddress`);
the render-path test harness from `HouseholdCard.test.tsx` is reusable verbatim
for SELECT-01; and the resume flow (`ResumePrompt` + `onResume: () => {}`)
requires **no modification** — it already lands on the persisted
`currentAddressIndex` via zustand-persist, and the SELECT-03 audit only needs
to document it.

**Primary recommendation:** Follow the `TurfOverviewMap.tsx` pattern exactly
for map-tap wiring (`useMap()` inside a child-of-`MapContainer` component,
`eventHandlers={{ click }}` on each `<Marker>`, `map.panTo(...)` in the
handler); wrap `handleJumpToAddress` in `useCanvassingWizard.ts` using the
identical shape as `advanceAddress`/`skipEntry` from 107-08.1; reuse the
`WizardHarness` render-path test pattern from `HouseholdCard.test.tsx` for
the SELECT-01 regression guard; keep the SELECT-02 E2E coverage behavioral
and the SELECT-02 vitest coverage stubbed (the existing `setupLeafletMocks()`
stubs `<Marker>` as a passthrough, so real click events on the marker DOM
aren't reachable in unit tests — assert the **handler wiring** in unit and
the **real click + pan behavior** in Playwright).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**SELECT-01 — List-Tap Pin-Clear Fix**
- **D-01:** Apply the 107-08.1 pattern to `handleJumpToAddress`. Wrap the store's
  `jumpToAddress` so the wrapped version calls `setPinnedHouseholdKey(null)`
  BEFORE invoking the underlying store action. Mirror the exact wrap pattern
  used in 107-08.1 for `advanceAddress` and `skipEntry`. Pin releases on any
  intentional navigation (advance, skip, jump).
- **D-02:** Tap-to-activate feedback is `card swap + haptic` (NO toast).
  Different from auto-advance (`toast + card swap + haptic` per 107 D-03).
  The user's own tap IS the feedback.
- **D-03:** List view closes on tap — keep existing `onOpenChange(false)` at
  `DoorListView.tsx:112`.

**SELECT-02 — Map-Tap Implementation**
- **D-04:** Single-tap = activate immediately. No popup-with-confirmation, no
  long-press.
- **D-05:** Map auto-pans, no auto-zoom. Pan animation is honored only when
  `prefersReducedMotion === false`. Under reduced motion the pan is instant.
- **D-06:** Map-tap feedback = same as list-tap PLUS the existing icon swap.
  Triple combo: (a) HouseholdCard swap, (b) `navigator.vibrate(50)`, (c)
  `activeHouseholdIcon` vs `householdIcon` swap (already implemented).
- **D-07:** Implementation hooks into existing `handleJumpToAddress`. Both
  list-tap and map-tap go through the same wrapped function.

**SELECT-03 — State Machine Audit**
- **D-08:** Deliverable is `108-STATE-MACHINE.md` (Mermaid diagram +
  transition table) + a single behavioral integration test. NO XState
  refactor, NO `useReducer` extraction.
- **D-09:** Entry points covered: list-tap, map-tap, auto-advance after
  outcome, skip, resume. Reconciliation-after-sync deferred to phase 110.
- **D-10:** `108-STATE-MACHINE.md` ends with a `## Reconciliation (deferred
  to phase 110)` placeholder section.
- **D-11:** Behavioral integration test scope — single test; for each of 5
  entry points: setup walk list ≥3 households, trigger entry point on
  non-current household, assert `currentAddressIndex` advances, assert
  `pinnedHouseholdKey` clears, assert `currentHousehold` returns the new
  target.

**Test Coverage**
- **D-12:** All three layers for every fix (unit / component / E2E).
- **D-13:** Render-path test for SELECT-01 — mirror the regression-guard
  pattern from 107-08.1. Test must FAIL on a buggy version (pin doesn't
  clear) and PASS on the fix.

### Claude's Discretion
- Marker click handler shape: `eventHandlers={{ click: ... }}` on each
  `<Marker>` vs a shared `handleMarkerClick(index)` callback.
- Behavioral integration test location: inside existing
  `useCanvassingWizard.test.ts` (659 lines today) or a new
  `useCanvassingWizard.state-machine.test.ts`.
- Pan animation duration: Leaflet default vs custom.
- Mermaid style: state diagram vs flowchart.
- Wrapped `handleJumpToAddress`: inline in the hook vs extracted helper.

### Deferred Ideas (OUT OF SCOPE)
- Reconciliation after offline sync — phase 110.
- Marker pulse animation on activation — rejected.
- Connection line from volunteer location to active marker — rejected.
- Multi-select / bulk-activate from list — rejected.
- XState refactor — rejected per D-08.
- `useReducer` extraction — rejected per D-08.
- Map-tap shows address popup before activation — rejected per D-04.
- Auto-zoom on activation — rejected per D-05.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SELECT-01 | Tap any house in the list to set it as the active house | Pin-clear wrap pattern (§1), render-path test pattern (§5), existing `DoorListView.tsx:110` wiring already passes `onJump(index)` → `handleJumpToAddress` |
| SELECT-02 | Tap any house marker on the map to set it as active | react-leaflet `eventHandlers` API (§2), `useMap()` + `panTo()` pattern from `TurfOverviewMap.tsx` (§3), marker-hit-area strategy (§4), ARIA/keyboard path (§5) |
| SELECT-03 | Active-house state machine reviewed end-to-end so the same target is reachable from every entry point | Resume flow trace (§7), behavioral integration test skeleton (§8), Mermaid state diagram scope (§8) |

## Project Constraints (from CLAUDE.md)

These directives apply to every task in this phase:

| Constraint | Source | Phase 108 impact |
|---|---|---|
| Use `uv` for all Python — never system `python`/`python3` | global CLAUDE.md | No backend changes in phase 108, so n/a — but seed/fixture scripts (if any) must respect it |
| Always use `web/scripts/run-e2e.sh` for Playwright runs | project CLAUDE.md | The SELECT-01/02 E2E spec MUST be invoked via the wrapper. Never bare `npx playwright test` |
| Visually verify UI changes via Playwright MCP + screenshots in `screenshots/` (gitignored) | global CLAUDE.md | After map-tap wiring lands, capture a screenshot of the canvassing map with the active marker highlighted |
| Commit after each task, not at the end | global CLAUDE.md | Each of the planner's tasks commits independently (pin-clear wrap, map-tap handler, pan call, ARIA post-mount, render-path test, E2E spec, STATE-MACHINE.md, behavioral integration test) |
| Never push to GitHub unless asked | global CLAUDE.md | Phase exit does not push |
| Conventional commits | global CLAUDE.md | `feat(web/canvassing):`, `test(web/canvassing):`, `docs(108):` |
| Line length 88; Ruff rules E/F/I/N/UP/B/SIM/ASYNC | project CLAUDE.md | n/a for this phase (no Python changes) |
| Design principle 2: mobile-field parity — min 44px touch targets | project CLAUDE.md | LOCKED by UI-SPEC Contract 2b; the `::before` hit-area expansion is the concrete implementation |
| Design principle 4: AAA accessibility | project CLAUDE.md | LOCKED by UI-SPEC Contract 2c — marker keyboard + ARIA contract is non-negotiable |
| `asyncio_mode=auto` pytest | project CLAUDE.md | n/a for this phase |

## Standard Stack

**No new dependencies.** Phase 108 uses only libraries already in `web/package.json`.

### Core
| Library | Installed Version | Purpose | Why Standard |
|---|---|---|---|
| `leaflet` | `^1.9.4` | Low-level map engine | [VERIFIED: `web/package.json`] The Leaflet `L.Icon`, `L.Marker`, `L.Map.panTo`, and `L.Map` imperatively-accessed features this phase uses are all in 1.9.4 |
| `react-leaflet` | `^5.0.0` | React bindings over Leaflet | [VERIFIED: `npm view react-leaflet version` → `5.0.0`] Latest current. Exposes `Marker`, `Tooltip`, `MapContainer`, `useMap`, `eventHandlers` prop, marker `ref` |
| `@types/leaflet` | `^1.9.21` | Types | [VERIFIED: `web/package.json`] |
| `vitest` | `^4.0.18` | Unit + component test runner | [VERIFIED: `web/package.json`] Used by all existing tests |
| `happy-dom` | `^20.8.3` | DOM environment for vitest | [VERIFIED: `web/package.json`] Note: `jsdom` ^28 is also present; the existing `CanvassingMap.test.tsx` uses whichever the vitest config sets by default — Leaflet mocks bypass the DOM/canvas issue entirely |
| `@testing-library/react` | existing | Render-path assertions | [VERIFIED: used by `HouseholdCard.test.tsx` and `CanvassingMap.test.tsx`] |
| `@playwright/test` | `^1.58.2` | E2E runner | [VERIFIED: `web/package.json`] |
| `sonner` | existing | Toast system | [VERIFIED] NOT used for tap-to-activate per D-02 — already imported |

### Already in repo (no installation needed)
- `usePrefersReducedMotion` — `web/src/hooks/usePrefersReducedMotion.ts` (phase 107 D-20)
- `setupLeafletMocks()` — `web/src/components/canvassing/map/__mocks__/leaflet.ts`
- `WizardHarness` render-path test pattern — `web/src/components/field/HouseholdCard.test.tsx`
- `web/scripts/run-e2e.sh` wrapper — phase 106 D-13 mandate

**No new packages. No `uv add` / `npm install` commands in the plan.**

## Architecture Patterns

### Project Structure (unchanged)
```
web/src/
├── hooks/
│   ├── useCanvassingWizard.ts      # Wrap handleJumpToAddress here
│   └── useCanvassingWizard.test.ts # Hook tests (659 lines)
├── components/field/
│   ├── CanvassingMap.tsx           # Add eventHandlers, useMap panTo, ARIA
│   ├── CanvassingMap.test.tsx      # Add marker click wiring tests
│   ├── DoorListView.tsx            # NO visual change, locked by Contract 1
│   ├── HouseholdCard.tsx           # NO change
│   ├── HouseholdCard.test.tsx      # Extend render-path tests for jump path
│   └── ResumePrompt.tsx            # NO change — already correct
├── routes/field/$campaignId/
│   └── canvassing.tsx              # Pass handleJumpToAddress → CanvassingMap
└── stores/canvassingStore.ts       # NO change

web/e2e/
└── canvassing-wizard.spec.ts       # Extend with list-tap, map-tap, resume
                                    # (OR new canvassing-house-selection.spec.ts)

.planning/phases/108-house-selection-active-state/
├── 108-CONTEXT.md                  # Locked
├── 108-UI-SPEC.md                  # Locked
├── 108-RESEARCH.md                 # This file
├── 108-STATE-MACHINE.md            # NEW — SELECT-03 audit deliverable
└── 108-NN-PLAN.md                  # Planner output
```

### Pattern 1: Wrap-the-action for pin clear (from 107-08.1)
**What:** Destructure the store action under an alias and re-expose it as a
`useCallback` that calls `setPinnedHouseholdKey(null)` first.
**When to use:** Any hook-level navigation that must clear view state before
delegating to the store.
**Verified example (already in `web/src/hooks/useCanvassingWizard.ts:89-137`):**
```typescript
// [VERIFIED: useCanvassingWizard.ts:89-137]
const {
  // ...
  advanceAddress: storeAdvanceAddress,
  jumpToAddress,                         // NOT aliased yet — phase 108 change
  skipEntry: storeSkipEntry,
  // ...
} = useCanvassingStore()

const advanceAddress = useCallback(() => {
  setPinnedHouseholdKey(null)
  storeAdvanceAddress()
}, [storeAdvanceAddress])

const skipEntry = useCallback(
  (entryId: string) => {
    setPinnedHouseholdKey(null)
    storeSkipEntry(entryId)
  },
  [storeSkipEntry],
)
```

**Phase 108 shape for `handleJumpToAddress` (D-01):**
```typescript
// Destructuring change (around line 89):
//   jumpToAddress: storeJumpToAddress,

const handleJumpToAddress = useCallback(
  (index: number) => {
    setPinnedHouseholdKey(null)
    storeJumpToAddress(index)
  },
  [storeJumpToAddress],
)
```

**Important invariant:** the hook's `useLayoutEffect` at lines 199-209 also
calls `jumpToAddress(...)` for the clamp/sort-mode-change cases. Those
call-sites should continue using the **raw store action**, NOT the wrapped
hook-level callback, because the clamp path intentionally does not want to
clear the pin (see the existing 107-08.1 rationale comment at lines 120-125).
Therefore the destructure should keep `jumpToAddress` available as
`storeJumpToAddress` and the effect uses it directly — only the hook-exported
`handleJumpToAddress` returns the wrapped version.

**⚠️ Verification point the planner must lock:** after the rename, the
`useLayoutEffect` clamp at line 207 currently reads `jumpToAddress` from the
destructure scope. Change it to `storeJumpToAddress` in the same edit. Ruff
equivalent: `grep -c 'jumpToAddress' useCanvassingWizard.ts` should still be
the same count as before the edit (rename, not net-add).

### Pattern 2: react-leaflet v5 `eventHandlers` + `useMap()` + `panTo()`
**[VERIFIED: in-repo at `web/src/components/canvassing/map/TurfOverviewMap.tsx:32,85-87`]**

react-leaflet v5 (installed version) accepts an `eventHandlers` prop on
`<Marker>`, `<GeoJSON>`, `<Polygon>`, and `<Popup>`. The handlers receive
Leaflet `LeafletMouseEvent` objects. Click-on-marker does NOT trigger a
map pan or propagate as a map click — Leaflet's default behavior stops
propagation for marker clicks, so NO custom `stopPropagation` is needed
(UI-SPEC Contract 2b confirms this).

**Verified code (from `TurfOverviewMap.tsx:78-90`):**
```typescript
// [VERIFIED: TurfOverviewMap.tsx:78-90]
return (
  <>
    {turfs.map((turf) => (
      <GeoJSON
        key={turf.id}
        data={turf.boundary as unknown as GeoJSON.GeoJsonObject}
        style={turfStyles[turf.id]}
        eventHandlers={{
          click: () => setSelectedTurfId(turf.id),
        }}
      />
    ))}
```

`useMap()` works only inside a child component of `<MapContainer>`. In the
current `CanvassingMap.tsx`, markers are rendered as direct children of
`<MapProvider>` (which wraps `<MapContainer>` internally). A child component
sitting BELOW `<MapProvider>` can call `useMap()` safely:

**Verified code (from `TurfOverviewMap.tsx:28-32`):**
```typescript
// [VERIFIED: TurfOverviewMap.tsx:28-32]
function OverviewMapContent({ turfs, campaignId }: TurfOverviewMapProps) {
  const map = useMap()
  // ...
  map.fitBounds(allBounds, { padding: [20, 20] })
```

**Phase 108 pattern (for `CanvassingMap.tsx`):** extract the marker-rendering
section into a small inner component — e.g. `CanvassingMapMarkers` — that
calls `useMap()`, wires `eventHandlers.click` on each marker, and calls
`map.panTo([lat, lng], { animate: !prefersReducedMotion, duration: 0.5 })`.
The existing `<MapProvider>` call becomes a wrapper that renders
`<CanvassingMapMarkers .../>` as its only child.

**Code snippet the planner can embed:**
```typescript
// [CITED: react-leaflet v5 API, verified against TurfOverviewMap.tsx]
import { Marker, Tooltip, useMap } from "react-leaflet"
import { useCallback } from "react"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"

interface CanvassingMapMarkersProps {
  households: Household[]
  mappableHouseholds: Household[]
  activeHouseholdKey: string | null
  onHouseholdSelect: (index: number) => void
  volunteerLocation: CoordinatePoint | null
}

function CanvassingMapMarkers({
  households,
  mappableHouseholds,
  activeHouseholdKey,
  onHouseholdSelect,
  volunteerLocation,
}: CanvassingMapMarkersProps) {
  const map = useMap()
  const prefersReducedMotion = usePrefersReducedMotion()

  const handleMarkerClick = useCallback(
    (household: Household) => {
      // Resolve to the ORIGINAL households array index so handleJumpToAddress
      // aligns with the hook's ordering — NOT the mappableHouseholds index,
      // which may be shorter when some households lack coordinates.
      const index = households.findIndex(
        (h) => h.householdKey === household.householdKey,
      )
      if (index < 0) return

      onHouseholdSelect(index)
      map.panTo([household.latitude, household.longitude], {
        animate: !prefersReducedMotion,
        duration: 0.5,
      })
    },
    [households, onHouseholdSelect, map, prefersReducedMotion],
  )

  return (
    <>
      {volunteerLocation && (
        <Marker
          position={[volunteerLocation.latitude, volunteerLocation.longitude]}
          icon={volunteerIcon}
        >
          <Tooltip>Your saved location</Tooltip>
        </Marker>
      )}
      {mappableHouseholds.map((household) => {
        const isActive = household.householdKey === activeHouseholdKey
        return (
          <Marker
            key={household.householdKey}
            position={[household.latitude, household.longitude]}
            icon={isActive ? activeHouseholdIcon : householdIcon}
            zIndexOffset={isActive ? 1000 : 0}
            eventHandlers={{
              click: () => handleMarkerClick(household),
            }}
          >
            <Tooltip>
              {isActive
                ? `Current door: ${household.address}`
                : household.address}
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
```

**Critical index-mapping note:** `mappableHouseholds` is
`households.filter(isMappableHousehold)` (line 80-83 of current
`CanvassingMap.tsx`). Tapping marker at `mappableHouseholds[3]` is NOT
necessarily `households[3]` — unmapped households may have been filtered
out. The planner MUST lock the rule: **marker click resolves to the index
in the original `households` array, not the filtered mappable list**, because
`handleJumpToAddress(index)` is always indexed against the hook's
`households` memo (which is the unfiltered ordered list). Use
`households.findIndex(h => h.householdKey === household.householdKey)`.

### Pattern 3: Render-path regression-guard (from 107-08.1)
**Verified example:** `web/src/components/field/HouseholdCard.test.tsx:159-177`.
A tiny `WizardHarness` component mounts `useCanvassingWizard` directly and
renders `currentHousehold.address` + `householdKey` into `data-testid` divs.
Assertions target `screen.getByTestId(...).textContent` — the actual DOM.

**Phase 108 reuse (for SELECT-01 D-13):** extend `HouseholdCard.test.tsx`
with a third test `rendered address swaps to the next household after a
list-tap (jumpToAddress)`. Use the existing `multiVoterEntries` fixture
(3 voters at `house-multi` + 1 at `house-next`). Call
`wizardApi.handleJumpToAddress(1)` instead of `handleOutcome` / `handleSkipAddress`.
Assert the rendered `household-key` testid flips to `house-next`.

**Regression-guard verification procedure (mirrors 107-08.1):** after writing
the test and the fix, temporarily comment out the `setPinnedHouseholdKey(null)`
inside the new wrapped `handleJumpToAddress`, re-run the test, confirm it
goes red with "expected house-next to be house-multi", re-apply the fix,
confirm it goes green. The plan task MUST include this verification as an
acceptance criterion (not just "test passes").

### Anti-Patterns to Avoid
- **Don't use a `useLayoutEffect` to watch `currentAddressIndex`** for pin
  clearing. 107-08.1's key decision was wrap-the-action over watch-the-effect
  because incidental index changes (e.g., the clamp at line 206 that fires
  when household list shrinks) would spuriously clear the pin.
- **Don't call `setView` / `flyTo` / `setZoom`** on map-tap. Per D-05 the
  zoom level is preserved. Only `panTo`.
- **Don't add `stopPropagation` in the marker click handler.** Leaflet
  already stops propagation for marker clicks — adding our own can break
  hover/tooltip semantics (UI-SPEC Contract 2b).
- **Don't index into `mappableHouseholds`** when calling
  `handleJumpToAddress`. Always resolve to the full `households` array index.
- **Don't fire a sonner toast** on tap-to-activate. D-02 / D-06 are explicit.
- **Don't try to render real Leaflet in vitest.** Use the existing
  `setupLeafletMocks()` infrastructure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Map-marker click detection | DOM `addEventListener('click')` on marker root | `eventHandlers={{ click }}` prop on `<Marker>` | react-leaflet v5 already exposes the Leaflet event loop; manual DOM listeners double-fire and miss touch taps on iOS Safari |
| Animated map pan | `requestAnimationFrame` tween from current center to target | `map.panTo(latLng, { animate, duration })` | Leaflet's built-in easing respects inertia and DPR; hand-rolled tweens fight the map's own event loop |
| Reduced-motion detection | `window.matchMedia("(prefers-reduced-motion: reduce)")` directly | `usePrefersReducedMotion()` from phase 107 D-20 | Shared hook already handles hydration + SSR + fallback |
| Marker keyboard activation from scratch | Custom `<div>` overlay with `onKeyDown` | Leaflet's `keyboard: true` default + post-mount `setAttribute` via `markerRef.current.getElement()` | The marker root IS a real DOM element; hijacking the Leaflet instance is simpler than overlaying |
| Haptic feedback | Custom vibration utility | Existing `navigator.vibrate(50)` feature-detect pattern already in `announceAutoAdvance()` at `useCanvassingWizard.ts:61-73` | Reuse the 107 helper verbatim — same 50 ms duration |
| Leaflet test rendering | Building a canvas-backed happy-dom shim | Existing `setupLeafletMocks()` + passthrough `<Marker>` | The mock is a production-grade stub used by every existing canvassing map test |
| State machine modeling | XState / `useReducer` | Prose + Mermaid in `108-STATE-MACHINE.md` + 1 behavioral test | Explicitly rejected per D-08 |

**Key insight:** every "don't hand-roll" item above is already solved in the
repository by a previous phase (106/107) or by react-leaflet itself. The
plan's job is assembly, not authoring.

## Runtime State Inventory

> Phase 108 is a feature-addition + bug-fix phase, NOT a rename or migration.
> Runtime state inventory is not strictly required, but several state stores
> DO persist across sessions and the planner needs to know the semantics.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `canvassingStore` persists to `sessionStorage` under key `canvassing-wizard` (version 1) via zustand-persist: `walkListId`, `currentAddressIndex`, `completedEntries`, `skippedEntries`, `lastActiveAt`, `sortMode`, `locationStatus`, `locationSnapshot`. `pinnedHouseholdKey` is hook-local state (NOT persisted). | None — phase 108 does not change the shape. The wrapped `handleJumpToAddress` acts on in-memory state only; `jumpToAddress` in the store already updates `currentAddressIndex` + `lastActiveAt` which persists automatically. |
| Live service config | None — no external service state. | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None — pure TS/CSS additions to existing files + one new markdown doc | None |

**Resume semantics (critical for SELECT-03 D-09):**
`currentAddressIndex` is read from `sessionStorage` on mount via the zustand
`persist` middleware's `merge` function (see `canvassingStore.ts:237-240`).
The `ResumePrompt` toast at `canvassing.tsx:170-185` does NOT re-derive the
index from `lastActiveAt.householdKey` — there is no such field on the store.
It simply shows "Pick up where you left off at door N of M" and either
leaves `currentAddressIndex` alone (`onResume: () => {}`) or calls
`handleJumpToAddress(firstPendingIdx)` on Start Over.

**This means:** after resume, the household the volunteer sees is whatever
`households[currentAddressIndex]` resolves to — which depends on the CURRENT
ordered list (sequence or distance). If the volunteer switched sort modes
between sessions... actually, they can't: `sortMode` is also persisted and
`locationSnapshot` is also persisted, so the ordering is stable across
sessions as long as nothing else mutates.

**D-09 coverage for resume entry point:** the SELECT-03 behavioral test
should exercise resume by (a) seeding `sessionStorage` with a valid
`canvassing-wizard` state at `currentAddressIndex: 2`, (b) mounting
`WizardHarness` fresh, (c) asserting `currentHousehold.householdKey` matches
the household at index 2 in the expected ordering, (d) asserting
`pinnedHouseholdKey` is re-set to that household (via the "update state
during render" block at lines 189-195). The test exercises the resume
**path**, not the resume **toast** — the toast is a UI artifact and is
covered by E2E.

## Common Pitfalls

### Pitfall 1: Leaflet marker `ref` fires before DOM is attached
**What goes wrong:** Setting ARIA attributes via `markerRef.current.getElement()`
in the render body returns `null` because the marker's DOM element isn't
attached yet.
**Why it happens:** react-leaflet mounts markers asynchronously via Leaflet's
layer-add lifecycle.
**How to avoid:** Use a `useEffect` with the marker ref in the dependency
array, OR use the Leaflet `add` event: `marker.on("add", () => {...})`.
**Warning signs:** Silent failure — ARIA attributes missing but no error.
**Source:** Established Leaflet pattern; the UI-SPEC Contract 2c explicitly
calls out the `useEffect`-after-mount approach.

### Pitfall 2: Double `eventHandlers` re-creation triggers layer churn
**What goes wrong:** Passing `eventHandlers={{ click: () => ... }}` inline on
every render can cause react-leaflet to re-bind the handler, which in some
versions detaches/reattaches the underlying Leaflet event listener.
**Why it happens:** react-leaflet shallow-compares `eventHandlers` object
identity on update.
**How to avoid:** Either (a) use a stable `useCallback` shared across markers,
or (b) accept the churn since it's correctness-preserving (handlers still fire).
**Warning signs:** Flicker on the marker between clicks. In practice this is
not observable in v5 — the existing `TurfOverviewMap.tsx` uses inline
handlers without issue.

### Pitfall 3: Index mismatch between `mappableHouseholds` and `households`
**What goes wrong:** The marker click fires with a `mappableHouseholds` index
(or local loop counter), but `handleJumpToAddress` expects an index into the
full `households` array. If some households lack coordinates, the indices
diverge and the wrong house is activated.
**Why it happens:** `CanvassingMap.tsx:80-83` builds `mappableHouseholds` via
`filter(isMappableHousehold)`.
**How to avoid:** Always resolve by `householdKey`:
`households.findIndex(h => h.householdKey === clickedHouseholdKey)`.
**Warning signs:** Playwright test passes with all-mapped seed data but fails
with partially-mapped fixtures.
**Prevention at planning time:** the plan MUST include a task that adds a
component test with at least one unmapped household to prove the resolution
is by `householdKey`, not by loop index.

### Pitfall 4: `useMap()` called outside `<MapContainer>` throws
**What goes wrong:** If the marker-rendering code is lifted out of the
`<MapProvider>` child tree, `useMap()` returns `undefined` and the next
`map.panTo(...)` crashes.
**Why it happens:** `useMap` relies on the Leaflet map context provided by
`<MapContainer>`.
**How to avoid:** Keep the `CanvassingMapMarkers` component as a direct
child of `<MapProvider>` (which internally wraps `<MapContainer>`).
**Warning signs:** `Cannot read properties of undefined (reading 'panTo')` at
runtime in Playwright.

### Pitfall 5: React Strict Mode double-invokes marker `useEffect`
**What goes wrong:** ARIA attributes are set twice, or an event listener is
wired twice leading to double-fire.
**Why it happens:** Vite dev mode uses Strict Mode by default.
**How to avoid:** Make the effect idempotent — `setAttribute` is naturally
idempotent; for event listeners, return a cleanup from the effect.
**Warning signs:** Clicking a marker once activates and then immediately
deactivates via a second click. Not observed in `TurfOverviewMap.tsx` in
production, so likely a non-issue for `eventHandlers` but worth verifying.

### Pitfall 6: Vitest cannot click real Leaflet markers
**What goes wrong:** `fireEvent.click(screen.getByRole('button'))` doesn't
find the marker because `setupLeafletMocks()` stubs `<Marker>` as
`({ children }) => children` — the `eventHandlers` prop is discarded.
**Why it happens:** The mock was written for rendering correctness, not
interaction.
**How to avoid:** For unit/component tests, assert the **handler wiring**
by inspecting the props passed to a spy on `<Marker>`. For **real** click
behavior, use Playwright E2E — which runs the full Leaflet stack.
**Warning signs:** "Unable to find element with role button" when trying to
click a marker in vitest.
**Prevention strategy (RECOMMENDED):** the `CanvassingMap.test.tsx` tests
should NOT attempt real clicks. They should:
1. Extend `setupLeafletMocks()` to capture `<Marker>` props (easy: change
   the mock's `Marker` to a component that renders `{children}` AND stores
   props via `data-*` attributes or a module-level spy)
2. Assert that `eventHandlers.click` is a function on each rendered marker
3. Call that captured function directly and assert the `onHouseholdSelect`
   prop on `CanvassingMap` is invoked with the correct index
4. Leave real click flow + pan animation to the E2E spec

This matches the D-12 component-test layer spec and avoids the happy-dom/
canvas limitation entirely.

## Code Examples

### Wrapped `handleJumpToAddress` (SELECT-01 D-01)
```typescript
// web/src/hooks/useCanvassingWizard.ts — phase 108 changes
// [PATTERN: mirrors existing advanceAddress/skipEntry wraps at lines 126-137]

// Destructure rename:
const {
  // ...
  advanceAddress: storeAdvanceAddress,
  jumpToAddress: storeJumpToAddress,    // NEW: aliased
  skipEntry: storeSkipEntry,
  // ...
} = useCanvassingStore()

// New wrapped callback (replaces existing handleJumpToAddress at line 583):
const handleJumpToAddress = useCallback(
  (index: number) => {
    setPinnedHouseholdKey(null)
    storeJumpToAddress(index)
    // Phase 108 D-02: tap-to-activate haptic feedback (no toast)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(50)
      } catch {
        // Silent no-op
      }
    }
  },
  [storeJumpToAddress],
)

// Existing useLayoutEffect at lines 199-209: update the clamp/sort-change
// calls to use storeJumpToAddress directly (raw, unwrapped):
useLayoutEffect(() => {
  if (sortModeJustChanged) {
    if (households.length > 0) {
      storeJumpToAddress(0)               // was: jumpToAddress(0)
    }
    return
  }
  if (currentAddressIndex >= households.length && households.length > 0) {
    storeJumpToAddress(households.length - 1)  // was: jumpToAddress(households.length - 1)
  }
}, [currentAddressIndex, households, storeJumpToAddress, sortModeJustChanged])
```

**Why haptic goes in the hook, not the route:** both list-tap and map-tap
pass through `handleJumpToAddress`. Putting the haptic at the wrap site
means we fire exactly once per intentional navigation, regardless of the
entry point. This matches D-06 which says both entry points produce the
same in-wizard feedback.

**Haptic helper reuse option:** the existing `announceAutoAdvance()` helper
at lines 61-73 wraps toast + vibrate together. Phase 108 D-02 says NO toast
for tap — so we can't reuse that helper as-is. The cleanest path is to
extract a `vibrateIfSupported()` helper at module level and call it from
both `announceAutoAdvance()` AND the new `handleJumpToAddress`. The planner
decides whether to extract (cleaner) or inline (less diff churn). Either
satisfies D-02.

### Marker ARIA post-mount wiring (SELECT-02 Contract 2c)
```typescript
// Inside a <Marker> wrapper — uses marker ref to reach the DOM element
// [PATTERN: Leaflet Marker options + getElement() — standard Leaflet idiom]
import { useEffect, useRef } from "react"
import type { Marker as LeafletMarker } from "leaflet"

function InteractiveHouseholdMarker({
  household,
  isActive,
  icon,
  onClick,
}: {
  household: Household
  isActive: boolean
  icon: L.Icon
  onClick: (household: Household) => void
}) {
  const markerRef = useRef<LeafletMarker | null>(null)

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    // getElement() returns the marker's root DOM node (a <div>), or null
    // if the marker hasn't been added to the map yet.
    const el = marker.getElement()
    if (!el) return
    el.setAttribute("role", "button")
    el.setAttribute("aria-label", `Activate door: ${household.address}`)
    el.setAttribute("aria-pressed", isActive ? "true" : "false")
    el.setAttribute("tabindex", "0")
    el.classList.add("canvassing-map-household-marker")
  }, [household.address, isActive])

  return (
    <Marker
      ref={markerRef}
      position={[household.latitude, household.longitude]}
      icon={icon}
      zIndexOffset={isActive ? 1000 : 0}
      keyboard={true}           // Leaflet default — wires Enter/Space
      eventHandlers={{
        click: () => onClick(household),
        // Leaflet fires "keypress" events when keyboard: true is set, but
        // only on Enter. Space support requires a manual keydown listener
        // on the DOM element — add inside the useEffect above if needed.
      }}
    >
      <Tooltip>
        {isActive
          ? `Current door: ${household.address}`
          : household.address}
      </Tooltip>
    </Marker>
  )
}
```

**Key verification the planner must encode:** Leaflet's `keyboard: true`
option fires click on **Enter** but NOT on **Space**. UI-SPEC Contract 2c
requires BOTH. The planner's task for the marker ARIA effect should also
attach a `keydown` listener that checks `e.key === " "` and calls the same
handler. Source: Leaflet's source at `src/layer/marker/Marker.js` has the
`_onKeyPress` handler scoped to Enter.

**[ASSUMED — VERIFY BEFORE EXECUTING]:** Leaflet 1.9.4's marker `keyboard`
option handles Enter only. The planner's first task in the SELECT-02 wave
should do a 5-minute spike: render one marker, press Space with focus on
it, see if click fires. If YES, remove the keydown listener; if NO, keep
it. This is a known ambiguity — a documentation-vs-behavior check, not a
blocker.

### CSS for hit-area expansion + halo (Contract 2b + 2d)
```css
/* web/src/index.css (or a new canvassing-map.css) — phase 108 additions */

/* 2b: 44x44 minimum hit area via transparent ::before pseudo-element */
.leaflet-marker-icon.canvassing-map-household-marker::before,
.leaflet-marker-icon.canvassing-map-active-marker::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
  background: transparent;
  pointer-events: auto;
}

/* 2b: cursor hint on desktop — marker is tappable */
.leaflet-marker-icon.canvassing-map-household-marker,
.leaflet-marker-icon.canvassing-map-active-marker {
  cursor: pointer;
}

/* 2c: focus-visible outline — meets AAA focus indicator */
.leaflet-marker-icon.canvassing-map-household-marker:focus-visible,
.leaflet-marker-icon.canvassing-map-active-marker:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* 2d: active marker halo — drop-shadow around the PNG */
.leaflet-marker-icon.canvassing-map-active-marker {
  filter: drop-shadow(0 0 0 var(--primary))
          drop-shadow(0 0 4px var(--primary));
}
```

**Important:** `.leaflet-marker-icon` is the class Leaflet puts on the
marker's root `<img>`/`<div>` element. `L.Icon` renders an `<img>` — so
`::before` on an `<img>` will **NOT work** (pseudo-elements can't attach to
void elements). BUT: Leaflet wraps the icon inside a `<div class="leaflet-marker-icon">`
in some versions and uses the `<img>` directly in others. **[ASSUMED —
VERIFY BEFORE EXECUTING]:** in Leaflet 1.9.4 with `L.Icon` (not `L.DivIcon`),
the marker root IS an `<img>` element, and `::before` will silently fail.

**Recommended resolution (§4 Marker Hit Area below):** switch `householdIcon`
and `activeHouseholdIcon` from `L.Icon` to `L.DivIcon` with HTML content
that wraps an `<img>` inside a `<div>`. The `<div>` is a non-void element
and accepts pseudo-elements. The tradeoff is a slightly more verbose icon
definition but zero visible change. See §4 for the decision.

### Component-test marker click spy (D-12 unit layer)
```typescript
// web/src/components/field/CanvassingMap.test.tsx — phase 108 extension
// [PATTERN: extend the existing setupLeafletMocks() with a marker spy]

import { vi } from "vitest"

// Top-of-file — module-level spy that the mock writes into
const capturedMarkerProps: Array<{
  position: [number, number]
  eventHandlers?: { click?: () => void }
  icon?: unknown
  zIndexOffset?: number
}> = []

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => children,
  TileLayer: () => null,
  LayersControl: Object.assign(
    ({ children }: any) => children,
    { BaseLayer: ({ children }: any) => children },
  ),
  useMap: vi.fn(() => ({
    panTo: vi.fn(),
    fitBounds: vi.fn(),
    setView: vi.fn(),
  })),
  Marker: (props: any) => {
    capturedMarkerProps.push(props)
    return props.children ?? null
  },
  Tooltip: ({ children }: any) => children,
}))

// In a test:
test("marker click invokes onHouseholdSelect with the correct households-array index", () => {
  const onHouseholdSelect = vi.fn()
  render(
    <CanvassingMap
      households={[
        makeHousehold({ householdKey: "hh-1" }),
        makeHousehold({ householdKey: "hh-2", latitude: 32.85, longitude: -83.62 }),
      ]}
      activeHouseholdKey="hh-1"
      locationStatus="ready"
      locationSnapshot={{ latitude: 32.84, longitude: -83.63 }}
      onHouseholdSelect={onHouseholdSelect}
    />,
  )

  // Skip the volunteer marker (first entry) and click the second household.
  const secondHouseholdMarker = capturedMarkerProps.find(
    (p) => p.position[0] === 32.85,
  )
  secondHouseholdMarker?.eventHandlers?.click?.()

  expect(onHouseholdSelect).toHaveBeenCalledWith(1) // index in households[]
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| react-leaflet v3 imperative `L.marker()` calls | react-leaflet v4+ declarative `<Marker eventHandlers={...}>` | v4 (Sep 2022) | Clean React lifecycle; no manual mount/unmount |
| `onClick` as a React event | `eventHandlers={{ click: fn }}` object | v4+ | Matches Leaflet's multi-event API; supports any Leaflet event name |
| `L.Icon` (img) for markers | `L.DivIcon` (div-wrapped html) when interactivity needs pseudo-elements | v1.0+ | Enables CSS customization (halo, hit-area, ARIA on the root div) |

**Deprecated/outdated:**
- `whenCreated` prop on `<MapContainer>` — removed in v4+; use `useMap()` in
  a child component instead. This phase does NOT use `whenCreated`.
- Legacy `.on("click", fn)` wired via `ref.current.leafletElement` — pre-v4
  pattern. `eventHandlers` is the supported API.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Leaflet 1.9.4's marker `keyboard: true` handles Enter only (not Space) | §Code Examples / Marker ARIA | AAA contract 2c fails for Space. Verify with a 5-min spike before committing. If Leaflet handles Space natively, the keydown listener is redundant but harmless. |
| A2 | `L.Icon` renders the marker as an `<img>` element, which CANNOT host `::before` pseudo-elements | §Code Examples / CSS + §4 Marker Hit Area | The `::before` hit-area expansion silently fails on the idle `householdIcon` — clicks only register on the visible 25x41 PNG, breaking the 44px touch target. Resolution: switch to `L.DivIcon` (see §4). Verify first with a manual DOM inspection. |
| A3 | `useMap()` works for any child component below `<MapProvider>` regardless of nesting depth | §Pattern 2 | If the `CanvassingMapMarkers` component must be a direct child of `<MapContainer>` not `<MapProvider>`, refactor the provider to expose the map via a callback. Mitigated by: `TurfOverviewMap.tsx` already uses the same pattern successfully through a provider. |
| A4 | The canvassing wizard's `handleJumpToAddress` currently has ZERO test coverage in `useCanvassingWizard.test.ts` | §7 Test Coverage Gaps | Verified via grep — no matches for `handleJumpToAddress` or `jumpToAddress` in the test file. Low risk. |
| A5 | Resume flow does not mutate `pinnedHouseholdKey` or `currentAddressIndex` on its own — it relies entirely on the persisted store state | §Runtime State Inventory / Resume | If a future change adds resume-time migration of the index, the SELECT-03 behavioral test's resume step will need to account for it. Current code at `ResumePrompt.tsx` and `canvassing.tsx:170-185` confirms no mutation on Resume path (`onResume: () => {}`). Low risk. |
| A6 | The existing `setupLeafletMocks()` stubs `<Marker>` as a passthrough that discards `eventHandlers` — so real clicks can't be tested in vitest | §Pitfall 6 | If the mock is extended to capture props (recommended in §Code Examples above), the unit/component tests become feasible. If the extension is rejected, the component-test layer becomes shallow and E2E carries the full behavioral burden. |

**Action required on assumptions:** A1 and A2 need the 5-minute spikes called
out in the plan's first task ("spike: verify Space activation + DivIcon
pseudo-element support"). The outcomes decide whether to include a keydown
listener (A1) and whether to switch icons to `L.DivIcon` (A2). Both spikes
are low-cost and eliminate 100% of the risk.

## Open Questions (RESOLVED)

> All four open questions were resolved by adoption in the plans:
> Q1 → Plan 108-02 fires haptic in the hook (single fire point).
> Q2 → Plan 108-05 creates a new `useCanvassingWizard.state-machine.test.ts` file.
> Q3 → Plan 108-01 extends the existing E2E fixture with House C.
> Q4 → Plan 108-04 uses inline Mermaid in `108-STATE-MACHINE.md`.

1. **Should `handleJumpToAddress` fire the haptic pulse in the hook, or in
   the route (for symmetry with the current focus-move effect)?**
   - What we know: both list-tap and map-tap flow through `handleJumpToAddress`.
     Haptic in the hook = single firing point; haptic in the route =
     consistent with focus move (which lives in the route's `useEffect` at
     `canvassing.tsx:208-211`).
   - What's unclear: D-02 doesn't name the firing layer.
   - Recommendation: **hook**. The focus move is in the route because it
     needs the DOM ref; the haptic has no such dependency and fires exactly
     when the navigation intent is expressed. Fewer surfaces to reason about.

2. **Should the SELECT-03 behavioral test live in `useCanvassingWizard.test.ts`
   or a new file?**
   - What we know: existing file is 659 lines with 20+ tests.
   - What's unclear: the readability ceiling is subjective.
   - Recommendation: **new file** — `useCanvassingWizard.state-machine.test.ts`.
     659 lines is already at the practical edge for one describe block, and
     the state-machine test is a semantically distinct concern (cross-entry-point
     behavioral audit vs. per-handler unit test). Separation also makes
     D-08's audit doc cross-reference cleaner: "See
     `useCanvassingWizard.state-machine.test.ts` for the regression guard."

3. **Does the map-tap E2E test need real seeded coordinates or mocked
   route-level data?**
   - What we know: `canvassing-wizard.spec.ts` already mocks all API calls
     at the route level with 4 entries (House A 3-voter + House B 1-voter,
     lines 62-140) to sidestep the seed-data issue that Macon-Bibb voters
     are at random street numbers with no multi-voter households.
   - What's unclear: whether the existing fixture's coordinates are enough
     to trigger the map view (requires at least one mappable household).
   - Recommendation: **reuse the existing fixture, extend with a third
     household** (House C, single-voter, distinct coordinates) so SELECT-02
     has a "tap a non-current marker" target AND SELECT-03's "≥3 households"
     requirement from D-11 is satisfied in one fixture.

4. **Where does the Mermaid state diagram live — inline in
   `108-STATE-MACHINE.md` or a separate `.mmd` file?**
   - Recommendation: inline in a fenced ` ```mermaid ` block. GitHub renders
     mermaid natively in Markdown. The doc is read, not re-rendered to SVG.

## Environment Availability

> Phase 108 has NO new external dependencies. All capabilities already exist.

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node + npm (for `web/` dev) | vitest, tsc, playwright | ✓ | project-managed | — |
| Docker + compose | Dev server (per `CLAUDE.md` — web runs in docker compose, restart via `docker compose restart web`) | ✓ (assumed, user has run bootstrap) | — | If docker is down, local `npm run dev` is documented in docker-less dev path but NOT the standard |
| `web/scripts/run-e2e.sh` wrapper | Playwright runs (phase 106 D-13 mandate) | ✓ | — | — |
| `leaflet` 1.9.4 | Map rendering + `panTo` + marker ARIA getElement | ✓ | 1.9.4 | — |
| `react-leaflet` 5.0.0 | `<Marker>`, `<Tooltip>`, `useMap`, `eventHandlers` | ✓ | 5.0.0 | — |
| `usePrefersReducedMotion` hook | D-05 reduced-motion gate | ✓ | phase 107 D-20 | — |
| `setupLeafletMocks()` helper | vitest component tests for CanvassingMap | ✓ | already in-tree | Extend if marker-prop capture is needed |
| `WizardHarness` pattern | render-path regression test | ✓ | `HouseholdCard.test.tsx:159-177` | — |
| 107-08.1 wrap-the-action precedent | SELECT-01 D-01 pin-clear pattern | ✓ | `useCanvassingWizard.ts:126-137` | — |

**Missing dependencies:** None.

**Missing dependencies with fallback:** None.

**Blocking issues for execution:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | vitest ^4.0.18 (unit + component) + Playwright ^1.58.2 (E2E) |
| Config file | `web/vitest.config.ts` + `web/playwright.config.ts` |
| Quick run command | `cd web && npx vitest run src/hooks/useCanvassingWizard.test.ts src/components/field/HouseholdCard.test.tsx src/components/field/CanvassingMap.test.tsx` |
| Full suite command | `cd web && npx vitest run && ./scripts/run-e2e.sh canvassing-wizard.spec.ts` (or the new `canvassing-house-selection.spec.ts`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SELECT-01 | List-tap clears pin + swaps rendered card | unit (hook) | `cd web && npx vitest run src/hooks/useCanvassingWizard.test.ts -t "handleJumpToAddress"` | ✗ Wave 0 — add jumpToAddress tests to existing file |
| SELECT-01 | List-tap swaps the RENDERED HouseholdCard DOM (regression guard) | component render-path | `cd web && npx vitest run src/components/field/HouseholdCard.test.tsx -t "jump"` | ✗ Wave 0 — extend existing file with one new test |
| SELECT-01 | Tap a list row in the canvassing route → wizard advances, card visibly swaps | E2E | `cd web && ./scripts/run-e2e.sh canvassing-wizard.spec.ts -g "list-tap"` | ✗ Wave 0 — extend existing spec OR new file |
| SELECT-02 | Marker click handler is wired with the correct index | component (mock-props spy) | `cd web && npx vitest run src/components/field/CanvassingMap.test.tsx -t "marker click"` | ✗ Wave 0 — extend existing file; requires mock extension (see §6) |
| SELECT-02 | Marker click triggers `map.panTo` with reduced-motion gate | component | `cd web && npx vitest run src/components/field/CanvassingMap.test.tsx -t "panTo"` | ✗ Wave 0 |
| SELECT-02 | Marker ARIA attributes are set after mount (role/aria-label/aria-pressed/tabIndex) | component | `cd web && npx vitest run src/components/field/CanvassingMap.test.tsx -t "aria"` | ✗ Wave 0 |
| SELECT-02 | Tap a map marker in the running app → card advances, map pans, focus moves | E2E | `cd web && ./scripts/run-e2e.sh canvassing-wizard.spec.ts -g "map-tap"` | ✗ Wave 0 |
| SELECT-03 | All 5 entry points (list-tap, map-tap, auto-advance, skip, resume) reach the same target state | behavioral integration | `cd web && npx vitest run src/hooks/useCanvassingWizard.state-machine.test.ts` | ✗ Wave 0 — NEW FILE recommended |
| SELECT-03 | `108-STATE-MACHINE.md` exists with Mermaid diagram + transition table + reconciliation placeholder | docs | `ls .planning/phases/108-house-selection-active-state/108-STATE-MACHINE.md` | ✗ Wave 0 — NEW FILE |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run` on the touched file(s) +
  `cd web && npx tsc --noEmit`
- **Per wave merge:** `cd web && npx vitest run && ./scripts/run-e2e.sh canvassing-wizard.spec.ts`
- **Phase gate:** Full suite green (`cd web && npx vitest run` + 
  `./scripts/run-e2e.sh`) + `ruff check .` + `uv run pytest` (no Python
  changes, so pytest should be unchanged) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Extend `web/src/hooks/useCanvassingWizard.test.ts` — add ≥1 unit test
      for `handleJumpToAddress` covering pin-clear behavior. (Or skip this
      and rely on the render-path test — but D-12 unit layer asks for it.)
- [ ] Extend `web/src/components/field/HouseholdCard.test.tsx` — add ≥1
      render-path test for the list-tap (jumpToAddress) path, mirroring the
      existing 107-08.1 pattern.
- [ ] Extend `web/src/components/field/CanvassingMap.test.tsx` — extend
      `setupLeafletMocks()` to capture `<Marker>` props and expose a `useMap`
      spy that returns a `panTo` mock. Add ≥3 tests: click wiring, panTo
      with animate=true, panTo with animate=false under reduced motion.
- [ ] Create `web/src/hooks/useCanvassingWizard.state-machine.test.ts` —
      single comprehensive test for SELECT-03 D-11 (all 5 entry points).
- [ ] Extend (OR create new) `web/e2e/canvassing-wizard.spec.ts` OR
      `web/e2e/canvassing-house-selection.spec.ts` — add: list-tap test,
      map-tap test, resume test. Must use `run-e2e.sh` wrapper.
- [ ] Create `.planning/phases/108-house-selection-active-state/108-STATE-MACHINE.md` —
      Mermaid diagram + transition table + reconciliation placeholder.

**Framework install commands:** None needed — all tooling already present.

## Answers to the Planner's 8 Research Objectives

These are inline to match the planner's request, though the material is
also distributed across the standard sections above.

### 1. Leaflet marker `eventHandlers` pattern [VERIFIED: in-repo]
- **Shape:** `eventHandlers={{ click: (e?: L.LeafletMouseEvent) => void, ... }}`.
  Accepts any Leaflet event name (`click`, `mouseover`, `dragend`, etc.).
  Verified in `TurfOverviewMap.tsx:85-87` (used on `<GeoJSON>`, same shape
  applies to `<Marker>` per react-leaflet v5 docs).
- **Event payload:** Leaflet passes the event object (`LeafletMouseEvent`
  for click) to the handler. The marker instance is accessible via
  `e.target`. The `latLng` is `e.latlng`. For this phase we don't need
  the event — we capture the `household` by closing over the `.map()`
  iteration variable.
- **Mobile touch vs mouse click:** Leaflet normalizes both to `click` for
  markers. The UI-SPEC Contract 2b explicitly says no `stopPropagation`
  is needed because Leaflet marker click already doesn't propagate to
  the map's pan handler.
- **Concrete snippet:** see §Pattern 2 code block above — the
  `CanvassingMapMarkers` component and its `handleMarkerClick`.

### 2. `map.panTo` API [VERIFIED: in-repo useMap pattern]
- **Getting the map instance:** `const map = useMap()` inside any component
  rendered below `<MapContainer>`. Verified in `TurfOverviewMap.tsx:32`.
  `MapProvider` wraps `<MapContainer>` so marker children can call
  `useMap()` safely.
- **Signature:** `map.panTo(latLng: L.LatLngExpression, options?: { animate?: boolean; duration?: number; easeLinearity?: number; noMoveStart?: boolean })`.
  `latLng` accepts a `[lat, lng]` tuple.
- **`animate: false` = instant:** confirmed — no animation frames fire.
- **`animate: true, duration: 0.5` = 500ms smooth:** duration is in seconds
  per Leaflet docs.
- **Interaction with `<MapProvider>` `center` prop:** `center` is only
  consumed on initial mount (sets `MapContainer` `center`). After mount,
  `center` prop changes are IGNORED — Leaflet doesn't re-center on prop
  update. This is WHY `panTo` is necessary (and why there's no conflict).
- **Concrete snippet:** see the `handleMarkerClick` in §Pattern 2.

### 3. Marker hit-area expansion (Contract 2b) [NEEDS SPIKE]
- **DOM shape:** `L.Icon` produces an `<img class="leaflet-marker-icon">`
  element [ASSUMED A2]. `<img>` is a void element and cannot host
  `::before` pseudo-elements.
- **`L.DivIcon` alternative:** produces a `<div class="leaflet-marker-icon">`
  which CAN host pseudo-elements. The `<div>` can contain an inner `<img>`
  for the visible PNG — visible art unchanged.
- **Current icons:** `volunteerIcon`, `householdIcon`, and
  `activeHouseholdIcon` are ALL `L.Icon` (see `CanvassingMap.tsx:18-47`).
- **Recommended path:** convert `householdIcon` and `activeHouseholdIcon`
  to `L.DivIcon` with HTML:
  ```typescript
  const householdIcon = new L.DivIcon({
    html: '<img src="/leaflet/marker-icon.png" srcset="/leaflet/marker-icon-2x.png 2x" width="25" height="41" alt="" />',
    className: "canvassing-map-household-marker",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })
  ```
  Leave `volunteerIcon` as `L.Icon` since it's not interactive (Contract
  2c excludes it from keyboard activation).
- **Simplest alternative:** overlay an invisible 44x44 div on top of the
  marker using Leaflet's `L.Marker.options.riseOnHover` tricks. More
  complex, less clean. REJECT this path.
- **Recommendation:** `L.DivIcon` conversion, verified by a 5-minute spike
  before committing (assumption A2).

### 4. Marker keyboard accessibility (Contract 2c)
- **Leaflet defaults:** markers with `options.keyboard = true` (default)
  are focusable when the map has keyboard control, but Leaflet's built-in
  support is: Enter fires click, and markers are added to tab order via
  a `tabindex="0"` that Leaflet sets only when the marker is interactive.
  **[ASSUMED A1 — VERIFY]:** Space is NOT handled by Leaflet 1.9.4.
- **react-leaflet exposure:** the `<Marker>` component does not expose a
  prop for ARIA attributes. We reach them via `ref` + `useEffect` +
  `marker.getElement()`.
- **Recommended implementation path:** post-mount `useEffect` that
  sets `role`, `aria-label`, `aria-pressed`, `tabindex`, and adds a
  `keydown` listener for Space (if A1 is confirmed). See §Code Examples.
- **`canvassing.tsx` role:** the existing focus move at line 208-211 fires
  on `currentHousehold.householdKey` change — so keyboard Enter/Space on
  a marker → `onHouseholdSelect(index)` → `handleJumpToAddress` → index
  change → household change → focus moves to HouseholdCard heading. The
  chain already works; only the marker wiring is new.

### 5. Render-path test for map-tap (vitest vs Playwright split)
- **Can vitest render real Leaflet?** No — happy-dom and jsdom both lack
  canvas, and Leaflet's drag/tile code hits canvas APIs. The existing
  `setupLeafletMocks()` already sidesteps this by stubbing Leaflet entirely.
- **Recommended split (matches D-12 three-layer rule):**
  - **Unit (vitest):** prop-capture spy on `<Marker>` to assert
    `eventHandlers.click` is wired with the correct handler; spy on
    `useMap().panTo` to assert it was called with `animate: !reducedMotion`.
  - **Component (vitest):** render `CanvassingMap` with mocked
    `onHouseholdSelect`, trigger the captured click handler, assert the
    mock was called with the correct index.
  - **E2E (Playwright):** render the full canvassing route, click a real
    marker (Playwright does this by coordinate via
    `page.locator('.leaflet-marker-icon').nth(N).click()`), assert the
    HouseholdCard heading text changes.
- **Render-path regression guard:** the SELECT-01 render-path test in
  `HouseholdCard.test.tsx` uses the `WizardHarness` pattern and does NOT
  touch Leaflet at all — it exercises the HOOK (`handleJumpToAddress`)
  and asserts the DOM text swap. SELECT-02 can NOT use this pattern
  directly because the clickable surface IS a Leaflet marker. Instead,
  the hook-level render-path guard for SELECT-01 covers the full pin-clear
  chain, and the map click is proven in Playwright.

### 6. Resume flow code path trace [VERIFIED: in-repo]
- **`lastActiveAt` read from:** `useCanvassingStore` — persisted to
  `sessionStorage` via zustand-persist (`canvassingStore.ts:233-242`).
  Read in `canvassing.tsx:59` (`const lastActiveAt = useCanvassingStore((s) => s.lastActiveAt)`).
- **`ResumePrompt` trigger:** `useResumePrompt` hook at
  `ResumePrompt.tsx:14`. It fires a sonner toast if
  `walkListId === storedWalkListId && currentAddressIndex > 0 && lastActiveAt > 0`.
  Fires exactly once per mount (`hasShown.current` guard).
- **After resume, `currentAddressIndex` restoration:** the store is
  hydrated from `sessionStorage` BEFORE the React tree mounts (zustand
  persist runs synchronously during store initialization). So when
  `canvassing.tsx` mounts, `currentAddressIndex` is ALREADY whatever the
  previous session left it at. The `onResume: () => {}` callback is a
  no-op — there's no index mutation on Resume.
- **Matching against households array:** indirectly. The household at
  the resumed index is `households[currentAddressIndex]` — which depends
  on the current ordering. Since `sortMode` and `locationSnapshot` are
  ALSO persisted, the ordering is stable across sessions, so the
  resolved household is the same one the volunteer was on.
- **Does resume clear `pinnedHouseholdKey`?** No — `pinnedHouseholdKey`
  is hook-local `useState`, reset on every mount. On resume, the
  "update state during render" block at lines 189-195 re-records the pin
  to `households[currentAddressIndex].householdKey`. So post-resume, the
  pin is auto-set to the correct value within one render.
- **Does the resume path need modification for D-09?** NO. The SELECT-03
  audit only needs to DOCUMENT the resume flow in `108-STATE-MACHINE.md`
  and the behavioral test needs to SIMULATE a resume by seeding
  sessionStorage. No code changes.

### 7. Existing test coverage gaps [VERIFIED: grep in-tree]
- **`useCanvassingWizard.test.ts`:** 659 lines, 20+ tests. Zero matches
  for `handleJumpToAddress` or `jumpToAddress`. The pattern to copy is
  the existing `"switches to nearest door when enabling distance sort"`
  test at line 217.
- **`CanvassingMap.test.tsx`:** exists, 145 lines, 5 tests. Uses
  `setupLeafletMocks()`. No click-handler tests — phase 108 adds them.
  Existing `makeHousehold` factory is reusable.
- **`DoorListView.test.tsx`:** does NOT exist — would be net-new. Not
  required by D-12 because SELECT-01 coverage flows through
  `HouseholdCard.test.tsx` render-path (D-13) + the hook unit test.
  Claude's call: skip a dedicated DoorListView test unless the planner
  wants belt-and-suspenders.
- **`HouseholdCard.test.tsx`:** 271 lines, 2 tests (from 107-08.1). The
  `WizardHarness` harness + `multiVoterEntries` fixture is ready for
  reuse. Add 1 test: `"rendered address swaps to the next household after
  a list-tap (jumpToAddress)"`.
- **`canvassing-wizard.spec.ts`:** 474 lines, 5 E2E tests (CANV-01 two
  paths, CANV-02, CANV-03 two tests). Existing route-level mocks and
  fixture (`House A 3-voter + House B 1-voter`) are reusable. Phase 108
  adds: list-tap test, map-tap test, resume test. The planner should
  decide whether to extend the existing file or create a new
  `canvassing-house-selection.spec.ts`.

### 8. Risks/pitfalls for the planner
- **Leaflet map instance availability:** `useMap()` must be called in a
  child of `<MapContainer>`. The simplest path is to extract a
  `CanvassingMapMarkers` child component. Not a blocker — already
  proven in `TurfOverviewMap.tsx`.
- **React Strict Mode double-render:** react-leaflet marker `eventHandlers`
  are declarative and idempotent — no double-listener issue. The ARIA
  `useEffect` is idempotent via `setAttribute`. Safe under Strict Mode.
- **Test data fixture:** the existing `canvassing-wizard.spec.ts` mock
  fixture at lines 62-140 has 4 entries across 2 households (House A
  3-voter + House B 1-voter). D-11 requires ≥3 households for SELECT-03.
  **Extend the fixture** with a third household (House C, single-voter)
  at distinct coordinates. Same file, ~10 lines added.
- **Mock extension cost for `CanvassingMap.test.tsx`:** the existing
  `setupLeafletMocks()` is used by MULTIPLE files (not just canvassing).
  Modifying it globally is risky. Recommended: override the
  `vi.mock("react-leaflet", ...)` call locally in `CanvassingMap.test.tsx`
  to add prop-capture, leaving the shared helper untouched. Cost: ~30
  lines of per-file mock override.
- **Leaflet 1.9.4 Space-activation ambiguity (A1):** 5-minute spike to
  confirm before the plan locks the keydown listener task.
- **`L.Icon` vs `L.DivIcon` pseudo-element ambiguity (A2):** 5-minute
  spike to confirm before committing to the DivIcon conversion. Risk is
  low because converting is easy and contained.
- **`zIndexOffset` for active marker (UI-SPEC 2d):** `<Marker>` accepts
  `zIndexOffset={1000}` directly — verified against react-leaflet v5
  docs. No extra wiring needed beyond adding the prop.

## Sources

### Primary (HIGH confidence)
- `web/src/components/canvassing/map/TurfOverviewMap.tsx:28-89` — in-repo
  verified pattern for `useMap()`, `eventHandlers`, `map.fitBounds`. Same
  semantics as `map.panTo`.
- `web/src/hooks/useCanvassingWizard.ts:89-137, 583-588` — current
  `handleJumpToAddress` implementation and the 107-08.1 wrap-the-action
  pattern to mirror.
- `web/src/components/field/CanvassingMap.tsx:18-206` — full current
  marker-rendering code; no click handlers, three `L.Icon` definitions.
- `web/src/components/field/DoorListView.tsx:108-162` — list-tap UI
  already wired to `onJump(index)`.
- `web/src/components/field/HouseholdCard.test.tsx:159-271` — `WizardHarness`
  render-path regression-guard pattern from 107-08.1.
- `web/src/components/canvassing/map/__mocks__/leaflet.ts:42-92` — existing
  Leaflet mock infrastructure.
- `web/src/components/field/ResumePrompt.tsx` — resume flow entry point.
- `web/src/routes/field/$campaignId/canvassing.tsx:170-211` — resume
  wiring + focus-move effect.
- `web/src/stores/canvassingStore.ts:157-243` — zustand persist configuration.
- `web/e2e/canvassing-wizard.spec.ts:62-474` — existing E2E spec + fixture.
- `.planning/phases/107-canvassing-wizard-fixes/107-08.1-SUMMARY.md` —
  regression-guard verification procedure template.
- `.planning/phases/108-house-selection-active-state/108-CONTEXT.md` —
  all 13 locked decisions.
- `.planning/phases/108-house-selection-active-state/108-UI-SPEC.md` —
  approved UI contract with the 5 new contracts.
- `./CLAUDE.md` (project) + `~/.claude/CLAUDE.md` (global) — project
  conventions.

### Secondary (MEDIUM confidence)
- react-leaflet v5 public docs (conceptual — `useMap`, `eventHandlers`,
  `<Marker ref>`, `zIndexOffset`). Verified against the in-repo usage
  which is the source of truth for this codebase.
- Leaflet 1.9.4 docs on `L.Map.panTo`, `L.Icon` vs `L.DivIcon`,
  `L.Marker.keyboard`. Assumption A1 (Space handling) and A2 (`::before`
  on `<img>`) flagged for spike.

### Tertiary (LOW confidence)
- None — everything was verifiable in-tree or with a 5-minute spike.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against `web/package.json`,
  `TurfOverviewMap.tsx` proves react-leaflet v5 API in-tree.
- Architecture: HIGH — wrap-the-action pattern verified, `useMap()`
  pattern verified, render-path harness verified.
- Pitfalls: MEDIUM — A1 (Space activation) and A2 (`L.Icon` ::before)
  flagged as spikes. Everything else verified.
- Testing strategy: HIGH — three-layer split is clean given the existing
  mock infrastructure; Playwright carries the real-click burden.
- Resume flow: HIGH — traced end-to-end in the current route code.
- SELECT-03 audit shape: HIGH — D-08/D-11 fully specify the deliverable.

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30 days — stable surface, no pending
dependency upgrades identified)
