---
phase: 108-house-selection-active-state
plan: 03
subsystem: canvassing-map
tags: [select-02, map, marker, a11y, leaflet, tdd]
requires: [108-01, 108-02]
provides:
  - CanvassingMap.onHouseholdSelect prop wired through route to handleJumpToAddress
  - CanvassingMapMarkers inner component owning useMap() + panTo + ARIA
  - InteractiveHouseholdMarker with post-mount role/aria-label/aria-pressed/tabindex + Space keydown
  - L.DivIcon hosts for household icons (enables ::before hit area)
  - 44x44 ::before hit area, focus-visible outline, drop-shadow halo CSS
affects:
  - web/src/components/field/CanvassingMap.tsx
  - web/src/routes/field/$campaignId/canvassing.tsx
  - web/src/components/field/CanvassingMap.test.tsx
  - web/src/components/canvassing/map/__mocks__/leaflet.ts (test mock extension)
  - web/src/index.css
tech-stack:
  added: []
  patterns:
    - "react-leaflet child component calling useMap() (TurfOverviewMap template)"
    - "marker ref + useEffect for post-mount ARIA attribute application"
    - "L.DivIcon to gain a <div> root capable of hosting ::before pseudo-elements"
key-files:
  created:
    - .planning/phases/108-house-selection-active-state/108-03-SUMMARY.md
  modified:
    - web/src/components/field/CanvassingMap.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/components/field/CanvassingMap.test.tsx
    - web/src/components/canvassing/map/__mocks__/leaflet.ts
    - web/src/index.css
decisions:
  - "Applied Spike A1 verbatim: keydown listener on each marker root matching event.key === ' ' with preventDefault()"
  - "Applied Spike A2 verbatim: householdIcon + activeHouseholdIcon converted to L.DivIcon; volunteerIcon stays L.Icon"
  - "::before 44x44 hit area shipped (NOT the outline fallback) — Spike A2 confirmed the DivIcon <div> root supports it"
  - "panTo invoked with literal [lat, lng] tuple (not LatLng instance) to keep tests simple and avoid L.latLng import"
  - "Extended shared leaflet mock with DivIcon + divIcon so module-level new L.DivIcon() runs under any test importing the shared mock"
  - "Dropped setupLeafletMocks() from CanvassingMap.test.tsx in favor of a top-level hoisted react-leaflet mock that captures marker props"
metrics:
  duration_minutes: ~25
  tasks_completed: 3
  files_modified: 5
  completed: 2026-04-11
---

# Phase 108 Plan 03: SELECT-02 wire map marker tap-to-activate — Summary

Wires map marker tap, Enter, and Space to the same `handleJumpToAddress`
entry point as list-tap from Plan 108-02, with Leaflet/ARIA contracts
(role=button, aria-label, aria-pressed, tabindex), a 44x44 `::before`
hit area, focus-visible outline, drop-shadow active halo, and a reduced-
motion-aware `map.panTo` that never changes zoom (D-05).

## Tasks Completed

| # | Task | Commit | Result |
|---|---|---|---|
| 1 | Extract CanvassingMapMarkers + wire click/panTo/icons + ARIA | `2df86b5` | TS clean, RED->GREEN test passes |
| 2 | CSS — hit area + focus ring + active halo | `50f4900` | Contract 2b/2c/2d rules in index.css |
| 3 | Component tests — panTo animate, volunteer, zIndex | `9aae694` | 10/10 tests pass |

## Spike Application

Both spike outcomes from `108-SPIKES.md` were applied **verbatim**.

### A1 — Space key activation

Decision: **Leaflet does NOT handle Space natively.** Applied as: a
post-mount `useEffect` on `InteractiveHouseholdMarker` attaches a
`keydown` listener to `marker.getElement()` that matches
`event.key === " " || event.code === "Space"`, calls
`event.preventDefault()` to suppress the default page-scroll, and
invokes the same `onClick(household)` callback as the `click` event
handler. Enter continues to work through the browser's
`role="button"` synthetic click path that Leaflet's `keyboard: true`
sets up.

### A2 — L.Icon -> L.DivIcon conversion

Decision: **L.Icon produces an `<img>` root that cannot host `::before`.**
Applied as: `householdIcon` and `activeHouseholdIcon` are now
`new L.DivIcon({ html: '<img ...>', className: "...", iconSize, iconAnchor, popupAnchor })`
with the PNG art wrapped in an inner `<img>`. The visible art is
unchanged. The wrapping root is now a `<div>` that supports
`::before`. `volunteerIcon` stays as `L.Icon` because it is
non-interactive (Contract 2c exclusion) and has no hit-area
requirement.

## Hit Area — ::before shipped (NOT fallback)

The `::before` pseudo-element rule shipped because Spike A2 confirmed
the DivIcon `<div>` root supports it. The fallback `outline`/`padding`
path documented in A2 was **not** needed. CSS applied:

```css
.leaflet-marker-icon.canvassing-map-household-marker::before {
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
```

This satisfies Contract 2b's AAA minimum 44x44 touch target without
changing the visible marker art.

## Active halo contrast notes

The active marker gets:

1. **Size delta** — `iconSize: [30, 49]` vs idle `[25, 41]` (20% larger)
2. **`aria-pressed="true"`** — screen-reader affordance
3. **Drop-shadow halo** — `filter: drop-shadow(0 0 0 var(--primary)) drop-shadow(0 0 4px var(--primary))`
4. **zIndexOffset: 1000** — drawn above all idle markers

The drop-shadow uses `var(--primary)` which is the civic-blue token.
Because the visual delta combines three channels (size, position via
z-index, halo), it is **not** hue-only and passes WCAG 2.1 SC 1.4.1
"Use of Color" (color-blindness rule). Exact halo contrast against
map tiles will be spot-checked during the Plan 108-06 visual
verification pass; the token-based approach ensures both light and
dark themes get theme-appropriate halos automatically.

## Test Coverage (10 tests, all pass)

Existing phase 107 tests retained:

1. Saved location + active emphasis + mapped count summary
2. Denied geolocation copy
3. Unavailable geolocation copy
4. Partial-coverage copy
5. Zero-mappable fallback card

New Plan 108-03 tests:

6. **Click wiring** — clicking the third-household marker (with the
   second household unmapped) passes `2` to `onHouseholdSelect`, not
   `1`. Locks research Pitfall 3 (index resolution via `householdKey`
   lookup, not loop counter).
7. **panTo animate=true** — when `usePrefersReducedMotion` returns
   false, `map.panTo` is called with `{ animate: true, duration: 0.5 }`.
8. **panTo animate=false** — when `usePrefersReducedMotion` returns
   true, `map.panTo` is called with `{ animate: false, duration: 0.5 }`.
9. **Volunteer marker non-interactive** — captured props show
   `interactive: false`, `keyboard: false`, no click handler.
10. **Active zIndexOffset** — active marker has `zIndexOffset: 1000`,
    idle marker has `0`.

Full run: `npx vitest run src/components/field/CanvassingMap.test.tsx src/hooks/useCanvassingWizard.test.ts src/components/field/HouseholdCard.test.tsx` → **34 passed**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Top-level react-leaflet mock ordering**

- **Found during:** Task 1 test run after adding the capturing mock
- **Issue:** The RED test called the capturing `Marker` mock defined
  at the top of `CanvassingMap.test.tsx`, but the shared
  `setupLeafletMocks()` helper (invoked inside `beforeEach`) registered
  its own non-capturing `Marker` mock that overrode mine, so
  `capturedMarkerProps` was empty.
- **Fix:** Removed `setupLeafletMocks()` from `beforeEach` and moved
  the `leaflet` module mock (with `Icon`, `DivIcon`) to the top of the
  file alongside the capturing `react-leaflet` mock. Both are now
  hoisted by Vitest's transformer and capture everything uniformly.
- **Files modified:** `web/src/components/field/CanvassingMap.test.tsx`
- **Commit:** `2df86b5`

**2. [Rule 3 - Blocking] Shared leaflet mock missing `DivIcon`**

- **Found during:** Task 1 test run after converting icons to L.DivIcon
- **Issue:** `new L.DivIcon(...)` at module load time threw
  `DivIcon is not a constructor` in any test file still using the
  shared `setupLeafletMocks()` helper. Other test files (not part of
  this plan) also import `CanvassingMap` indirectly and would break.
- **Fix:** Added `DivIcon: vi.fn()` and `divIcon: vi.fn()` to both the
  `default` export and the named exports in
  `web/src/components/canvassing/map/__mocks__/leaflet.ts`. Future
  tests that import CanvassingMap via `setupLeafletMocks()` will not
  regress.
- **Files modified:** `web/src/components/canvassing/map/__mocks__/leaflet.ts`
- **Commit:** `2df86b5`

Both fixes were Rule 3 (blocking) because they prevented the current
task from completing verification. No architectural change; no user
permission needed.

## Success Criteria

- [x] D-04: single tap activates immediately (no popup, no long-press)
- [x] D-05: map pans but does NOT zoom — `grep -cE "setView|flyTo|setZoom" web/src/components/field/CanvassingMap.tsx` == 0
- [x] D-06: triple feedback channel via `handleJumpToAddress` (card swap + haptic + icon swap)
- [x] D-07: map-tap flows through the same `handleJumpToAddress` as list-tap
- [x] Contract 2a-e locked in tests + CSS
- [x] Phase 107 canvassing tests still pass (3 files, 34 tests)
- [x] `cd web && npx tsc --noEmit` clean
- [x] No `stopPropagation`, no `toast(` in CanvassingMap.tsx

## Commits

- `2df86b5` feat(108-03): wire map marker tap-to-activate (SELECT-02)
- `50f4900` feat(108-03): map marker hit area + focus ring + active halo (SELECT-02)
- `9aae694` test(108-03): component coverage for panTo, volunteer marker, active zIndex

## Self-Check: PASSED

- FOUND: web/src/components/field/CanvassingMap.tsx
- FOUND: web/src/components/field/CanvassingMap.test.tsx
- FOUND: web/src/routes/field/$campaignId/canvassing.tsx
- FOUND: web/src/index.css
- FOUND: web/src/components/canvassing/map/__mocks__/leaflet.ts
- FOUND commit: 2df86b5
- FOUND commit: 50f4900
- FOUND commit: 9aae694
