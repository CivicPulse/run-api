---
phase: 109
phase_name: map-rendering-asset-pipeline
reviewed: 2026-04-11
depth: standard
status: issues_found
files_reviewed: 9
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
---

# Phase 109 Code Review

## Summary

Phase 109 delivers MAP-01 asset fix, MAP-02 inert wrapper, and z-index stack correction cleanly. The Vite ES-module import pattern for Leaflet PNGs is correct and production-safe (asset audit confirmed base64 inlining for the three small marker files). The Radix popper z-index bump to 1200 is a thoughtful companion to the Sheet bump to 1100. Unit tests use real prop-capture assertions; no mock-only coverage.

No critical issues. Two warnings (one cosmetic filter bug, one test-quality observation) plus 5 info-level notes.

## Warnings

### WR-01: `activeHouseholdIcon` drop-shadow filter has a no-op first shadow

**File:** `web/src/index.css:312`

The filter is `drop-shadow(0 0 0 var(--primary)) drop-shadow(0 0 4px var(--primary))`. The first shadow has zero blur and zero offset — it renders nothing visible. The comment promises a "stacked halo" for color-blindness fallback; code delivers a single 4px glow. AAA conformance isn't broken (size delta + aria-pressed provide non-hue channels), but the visual spec doesn't match.

**Fix:**
```css
filter: drop-shadow(0 0 2px var(--primary)) drop-shadow(0 0 6px var(--primary));
```

### WR-02: `canvassing.test.tsx` "preserves CanvassingMap DOM instance" test doesn't prove what its name claims

**File:** `web/src/routes/field/$campaignId/canvassing.test.tsx:333-351`

Test captures `mapBefore`, opens the sheet, captures `mapDuring`, and asserts `toBe(mapBefore)` twice. The close-and-reopen branch is commented out — the test never toggles the sheet closed. `CanvassingMap` is also mocked as a static `<div>Map</div>`, so React would preserve node identity even if the real component unmounted. The real runtime-survival proof lives in `canvassing-map-rendering.spec.ts:444-510` (E2E). The unit test is redundant rather than broken.

**Fix:** Wire `DoorListView`'s `onOpenChange` mock to flip `listViewOpen` false and reassert identity — catches regressions where someone wraps the map in `{listViewOpen ? null : <CanvassingMap/>}`.

## Info

### IN-01: `voterIcon` and `volunteerIcon` are structurally identical

**File:** `web/src/components/canvassing/map/leafletIcons.ts:11-29`

Same asset URLs, sizes, and anchors. Test `leafletIcons.test.ts:139-143` asserts they share `iconUrl`. If the intent is eventual differentiation, add a TODO comment; otherwise alias.

### IN-02: `InteractiveHouseholdMarker` re-binds keydown listener on every `isActive` flip

**File:** `web/src/components/field/CanvassingMap.tsx:61-85`

Effect deps `[household, isActive]` cause the whole setup (role/aria/keydown) to re-run when `aria-pressed` flips. Wasteful but harmless. Could split into two effects: one-time setup keyed on `household.address`, aria-pressed update keyed on `isActive`.

### IN-03: `VoterMarkerLayer` tooltip treats empty-string names as "Unknown"

**File:** `web/src/components/canvassing/map/VoterMarkerLayer.tsx:26`

`{voter.name || "Unknown"}` — likely intentional but `?? "Unknown"` would be more precise if `VoterLocation.name` is `string | null | undefined`.

### IN-04: E2E spec `dispatchEvent("click")` inherits phase 108's pointer-geometry coverage gap

**File:** `web/e2e/canvassing-map-rendering.spec.ts:427`

`dispatchEvent` bypasses Playwright hit-testing, so the E2E does NOT prove that a real finger tap at those coordinates hits the list item rather than the map. The unit tests mock both the Sheet and the map, so neither layer empirically proves the real tap geometry. Not a phase 109 regression — inherited from 108-06. Worth a follow-up ticket for a `locator.tap()` test with explicit coordinates.

### IN-05: `canvassing-map-wrapper--inert` uses `!important` and doesn't block keyboard focus

**File:** `web/src/index.css:208-211`

Two concerns:
1. `* { pointer-events: none !important }` covers all descendants — if a future non-Leaflet interactive child lands inside the wrapper, it will be silently disabled. Consider scoping to `.leaflet-container, .leaflet-container *`.
2. `pointer-events: none` + `aria-hidden="true"` does not remove Tab focusability. A sighted keyboard user tabbing through the page could still land on a focusable marker child even though the sheet is "on top". The HTML `inert` attribute (universal browser support as of 2023) would remove focusability too. Not a MAP-02 blocker (original bug was pointer-based) but worth tracking.

## Focus-Area Notes

**Vite asset imports:** correct and production-safe. The three marker PNGs (< 4KB each) are base64-inlined at build time per Vite's default threshold. Confirmed in `109-ASSET-AUDIT.md`.

**Z-index stack:** 1000 (leaflet-control) < 1100 (Sheet) < 1200 (Radix popper). Sonner toasts use z-index 9999999 — no conflict. No Radix Toast in the app. Stack is clean.

**Inert wrapper keyboard nav:** see IN-05 — pointer-only fix. Native `inert` attribute is the stricter solution.

**Test quality:** Unit tests for `leafletIcons` and `VoterMarkerLayer` are solid (real prop capture + remote-CDN regression guard). E2E spec has real runtime assertions (`naturalWidth > 0`, `failedRequests === []`). WR-02 is the one weak spot.

**Phase 108 regression check:** DivIcon contract, keydown Enter+Space handling, and `onClickRef` stash are all preserved in `CanvassingMap.tsx`. No regressions.

## Recommended Action

WR-01 is a 2-line CSS fix. WR-02 is optional cleanup — delete the redundant assertions OR wire the close-and-reopen branch. Info items are tracking notes for future phases.
