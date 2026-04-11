---
phase: 108
phase_name: house-selection-active-state
reviewed: 2026-04-11
depth: standard
diff_base: 0d9d55f80e459d3c34d1617f8bfa77ba4f3e4931
status: issues_found
files_reviewed: 11
findings:
  critical: 0
  warning: 5
  info: 7
  total: 12
---

# Phase 108 Code Review

## Summary

Phase 108 ships SELECT-01/02/03 cleanly. L.DivIcon migration, post-mount ARIA application, and Space-key keydown listener in `InteractiveHouseholdMarker` are implemented per the SPIKES.md decisions and covered by unit + E2E tests. The render-path regression guard in `HouseholdCard.test.tsx` closes the hook-state vs. DOM-render gap that bit phase 107.

No critical or security issues. Five warnings (one real a11y gap + four code-churn/quality items) and seven info-level notes.

## Warnings

### WR-01: Redundant classList manipulation in marker effect

**File:** `web/src/components/field/CanvassingMap.tsx:75-101`

The `useEffect` calls `el.classList.add/remove("canvassing-map-active-marker")` but the DivIcon `className` constructor already renders the correct class for each icon variant. When `isActive` toggles, react-leaflet swaps the DOM element via `marker.setIcon(newIcon)`, so classList manipulation runs against elements that already have the right classes. Delete lines 84-89 to eliminate the redundancy and subtle element-identity risk.

### WR-02: Keydown listener re-attaches on every `onClick` identity change

**File:** `web/src/components/field/CanvassingMap.tsx:75-101, 142-159`

`handleMarkerClick` in `CanvassingMapMarkers` depends on `[households, onHouseholdSelect, map, prefersReducedMotion]`. `households` is a fresh array from the wizard hook's distance-sort memo, so `onClick` identity churns on every upstream update, tearing down/re-attaching keydown listeners needlessly. Fix: stash `onClick` in a ref updated via `useLayoutEffect`, then drop `onClick` from the main effect's deps so the listener only re-binds when the element identity or `household`/`isActive` changes.

### WR-03: Enter key not handled — SELECT-02 Contract 2c keyboard activation is half-met

**File:** `web/src/components/field/CanvassingMap.tsx:91-96`

The listener handles `event.key === " "` but not Enter. The code comment claims Leaflet's `role="button"` synthetic-click routes Enter, but `tabindex="0"` on a `<div role="button">` does NOT dispatch `click` on Enter in any modern browser — only native `<button>` elements do. The E2E spec explicitly skips Enter (`canvassing-house-selection.spec.ts:399-401`), confirming the gap.

**Fix:**
```ts
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === " " || e.code === "Space" || e.key === "Enter") {
    e.preventDefault();
    onClick(household);
  }
};
```

Then un-skip the Enter E2E case. This closes Contract 2c properly.

### WR-04: Variable shadowing: `key` in route file

**File:** `web/src/routes/field/$campaignId/canvassing.tsx:80, 200`

Outer `const key = userId ? tourKey(campaignId, userId) : ""` (tour store key) is shadowed inside a `useEffect` by `const key = \`milestones-fired-canvassing-${walkListId}\``. Block-scoped so not a bug, but a future refactor that hoists the inner block could silently clobber the tour key. Rename inner to `milestoneKey`.

### WR-05: Misleading `exhaustive-deps` disable in tour session increment

**File:** `web/src/routes/field/$campaignId/canvassing.tsx:122-126`

The effect guards on `!currentHousehold` but depends only on `[key]`, so on the first render where `key` is set but the wizard hasn't hydrated `currentHousehold`, the counter is never incremented. Minor analytics under-count. Fix: gate via `!!currentHousehold` in deps or use a ref-based "fire once per page visit" guard.

## Info

### IN-01: CanvassingMap test uses minimal inline leaflet mock

**File:** `web/src/components/field/CanvassingMap.test.tsx:9-16`

Top-level `vi.mock("leaflet", ...)` returns only `Icon`/`DivIcon`. Works because `react-leaflet` is also mocked, but future tests importing CanvassingMap alongside a real react-leaflet would break. Documented in 108-03 summary as deliberate — informational only.

### IN-02: Module-level `capturedMarkerProps` could leak across test files

**File:** `web/src/components/field/CanvassingMap.test.tsx:29-30`

Vitest may share a module across files in the same worker. No current collision (nobody else imports this test's mock). Informational.

### IN-03: E2E uses `dispatchEvent("click")` to bypass hit-test failures

**File:** `web/e2e/canvassing-house-selection.spec.ts:303-305, 360-363, 432-433`

Marker `::before` hit area overlaps neighboring markers at default viewport, so real `.click()` fails Playwright actionability checks. Documented deviation in the plan. Suggest adding grep-able `// TODO(phase-109): real click path once marker layering fixed` markers so the debt is trackable.

### IN-04: Unchecked string → DoorKnockResultCode cast

**File:** `web/src/routes/field/$campaignId/canvassing.tsx:225-227`

`(result as DoorKnockResultCode)` accepts any string from `onOutcomeSelect`. Low risk today because HouseholdCard enforces outcome types, but tighten `HouseholdCard.onOutcomeSelect`'s signature to `DoorKnockResultCode` so no cast is needed.

### IN-05: Redundant Extract cast in draftOutcome

**File:** `web/src/routes/field/$campaignId/canvassing.tsx:233`

`outcome as Extract<DoorKnockResultCode, "supporter" | "undecided" | "opposed" | "refused">` — optional cleanup via a `SURVEY_TRIGGER_OUTCOMES.has(result)` type narrow helper.

### IN-06: Map-tap state-machine test duplicates list-tap

**File:** `web/src/hooks/useCanvassingWizard.state-machine.test.ts:221-247`

Intentional defensive coverage (catches day someone splits the two entry points). Documented — informational only.

### IN-07: `setupLeafletMocks()` has no teardown pair

**File:** `web/src/components/canvassing/map/__mocks__/leaflet.ts:42-95`

Name implies setup/teardown pair but no teardown exists. Vitest handles `vi.mock` hoisting, so happy-path is fine. Informational.

## Accessibility Verdict

| Contract | Status |
|----------|--------|
| 2b — 44×44 hit area via `::before` on DivIcon root | ✅ shipped |
| 2c — Enter + Space keyboard activation | ⚠️ partial (Space only, Enter gap — see WR-03) |
| 2d — Non-hue-only active state (size + shadow + zIndex + aria-pressed) | ✅ shipped |
| ARIA (role, aria-label, aria-pressed, tabindex) | ✅ shipped |
| Focus-visible outline | ✅ shipped |

## Recommended Action

Fix **WR-03** before merge (real a11y gap + docs inaccuracy). WR-01/02/04/05 are cleanups that reduce churn and improve clarity; fix opportunistically. Info-level items are notes for future phases.
