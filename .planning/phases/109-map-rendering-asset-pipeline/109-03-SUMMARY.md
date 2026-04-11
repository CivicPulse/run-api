---
phase: 109-map-rendering-asset-pipeline
plan: 03
plan_id: 109-03
subsystem: web/field-canvassing
tags: [maps, leaflet, radix, sheet, z-index, MAP-02, accessibility]
requirements: [MAP-02]
dependency_graph:
  requires: [109-02]
  provides:
    - "Inert map wrapper pattern: Leaflet map stays mounted but stops intercepting taps while DoorListView sheet is open"
    - "Radix Sheet z-index override (1100) that sits above .leaflet-control (1000) on every field map route"
  affects:
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/components/field/DoorListView.tsx
    - web/src/index.css
tech-stack:
  added: []
  patterns:
    - "pointer-events suppression wrapper (preserves Leaflet instance state) instead of conditional unmount"
    - "Radix data-slot selectors for global z-index overrides of shadcn primitives"
key-files:
  created: []
  modified:
    - web/src/index.css
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/routes/field/$campaignId/canvassing.test.tsx
    - .planning/phases/109-map-rendering-asset-pipeline/109-ASSET-AUDIT.md
decisions:
  - "Used pointer-events: none on the wrapper (not display:none / visibility:hidden) to preserve the phase 108-03 panTo state — Leaflet caches its map-size on a ResizeObserver that breaks when the container goes 0x0 and back"
  - "Bumped Radix Sheet overlay AND content to z-index 1100 — 100 units above .leaflet-control (1000) — via [data-slot='sheet-overlay'] and [data-slot='sheet-content'] selectors (confirmed present in web/src/components/ui/sheet.tsx)"
  - "Second unit test asserts DOM identity of the canvassing-map-container mock across a sheet-open toggle; this is a regression guard for the wrapper being conditionally mounted (would fail the must-have that Leaflet survives the toggle)"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-11"
  tasks: 2
  files_created: 0
  files_modified: 4
---

# Phase 109 Plan 03: Map List-View Interaction Fix Summary

**One-liner:** MAP-02 closed — the CanvassingMap is wrapped in a div
that gets `canvassing-map-wrapper--inert` + `aria-hidden="true"` when
the DoorListView sheet is open, and Radix Sheet overlay/content
z-index is bumped to 1100 so it sits above `.leaflet-control` (1000).
Leaflet instance (and the phase 108-03 `panTo` state) survives every
open/close toggle because nothing is unmounted.

## What shipped

- **`web/src/index.css`** — added two CSS rule blocks right before the
  `@keyframes field-shimmer` block:
  - `.canvassing-map-wrapper--inert, .canvassing-map-wrapper--inert *`
    sets `pointer-events: none !important`. Applies to the wrapper and
    every descendant — no Leaflet control, no marker `::before` hit
    area, no tile, can intercept a tap while the sheet is open.
  - `[data-slot="sheet-overlay"], [data-slot="sheet-content"] { z-index:
    1100 }`. Confirmed those `data-slot` attributes are the ones shipped
    by `web/src/components/ui/sheet.tsx` before writing the selector.
- **`web/src/routes/field/$campaignId/canvassing.tsx`** — wrapped the
  existing `<CanvassingMap />` render in a new div:
  ```tsx
  <div
    data-testid="canvassing-map-wrapper"
    className={listViewOpen ? "canvassing-map-wrapper--inert" : undefined}
    aria-hidden={listViewOpen || undefined}
  >
    <CanvassingMap ... />
  </div>
  ```
  The wrapper stays mounted for the entire lifetime of the canvassing
  route — the className and aria-hidden toggle on state only. No other
  render tree changes.
- **`web/src/routes/field/$campaignId/canvassing.test.tsx`** — two new
  tests under `describe("field canvassing route", ...)`:
  1. `"MAP-02: marks the map wrapper inert + aria-hidden only while the
     list view sheet is open"` — asserts default state has no inert
     class and no aria-hidden, clicks "All Doors", asserts wrapper now
     carries both attributes.
  2. `"MAP-02: preserves the CanvassingMap DOM instance across
     list-view open/close toggles"` — captures the
     `canvassing-map-container` testid from the mocked CanvassingMap,
     opens the sheet, re-captures the node, and asserts object identity
     (`toBe`). A regression guard that would fail if a future refactor
     wraps the map in a `listViewOpen ? null : <map/>` conditional.
  The `CanvassingMap` vi.mock was updated to return a div with
  `data-testid="canvassing-map-container"` so the identity test has
  something to grab.
- **`.planning/phases/109-map-rendering-asset-pipeline/109-ASSET-AUDIT.md`**
  — appended a new `## MAP-02 layout decision` section covering the
  Leaflet z-index pane table (tile 200 → control 1000), Radix Sheet
  z-50 default, the two CSS rules, the rationale for `pointer-events`
  over `display:none`, and forward links to plans 109-04 (unit) and
  109-05 (E2E) for future test coverage.

## Commits

- `742f784` — `test(109-03): add failing tests for list-view map-inert wrapper (MAP-02)` (RED)
- `2811a50` — `fix(109-03): mark map wrapper inert while DoorListView is open (MAP-02)` (GREEN)
- `82add26` — `docs(109-03): document MAP-02 z-index + inert wrapper fix` (audit doc update)

## Verification

- **Vitest (canvassing.test.tsx):** 6/6 passed — 4 pre-existing tests
  + 2 new MAP-02 tests. RED proved before GREEN by running the new
  tests against the pre-fix codebase: test 1 failed on
  `getByTestId("canvassing-map-wrapper")` because the wrapper didn't
  exist yet.
- **Typecheck (`npx tsc --noEmit`):** clean — no errors, no new warnings.
- **Audit doc verification:** `grep "MAP-02 layout decision"
  109-ASSET-AUDIT.md` → match; `grep "canvassing-map-wrapper--inert"
  109-ASSET-AUDIT.md` → match. Matches the plan's automated verify
  string.

## Deviations from Plan

### Adjusted

**1. [Rule 3 — Blocking] Plan described pre-existing `onHouseholdSelect` prop accurately**

- **Found during:** Task 1 GREEN.
- **Issue:** Plan `<interfaces>` block showed `<CanvassingMap ...
  onHouseholdSelect={handleJumpToAddress} />` while an earlier session
  read of canvassing.tsx (lines 500–505) did not show the prop. On
  re-read during the edit, the prop WAS present on the real file at
  line 522.
- **Fix:** Simply preserved the prop in the wrapped render. No code
  change beyond wrapping. Matches plan intent.
- **Commit:** `2811a50`.

### No scope creep

- Did not touch DoorListView.tsx — plan listed it under
  `files_modified` in the frontmatter but all four must-haves were
  solved from the canvassing route + `index.css` alone. No behavior
  change to DoorListView is required to close MAP-02.
- Did not delete `web/public/leaflet/` (Issue #2 in 109-ASSET-AUDIT) —
  out of scope for MAP-02 and already tracked in the audit as
  partially-resolved.

## Deferred items

None. MAP-02 closes fully with this plan. The forward references to
plans 109-04 (unit) and 109-05 (E2E) in the ASSET-AUDIT are tracked
there, not deferred here.

## Known Stubs

None. The wrapper is wired to real state (`listViewOpen`), the CSS
rules are live, the audit doc reflects the shipped fix, and the unit
tests exercise the real render tree (not mocks of the wrapper).

## Self-Check: PASSED

- `web/src/index.css` contains `.canvassing-map-wrapper--inert` rule
  with `pointer-events: none !important` — verified via Grep.
- `web/src/index.css` contains `[data-slot="sheet-overlay"],
  [data-slot="sheet-content"] { z-index: 1100 }` — verified via Grep.
- `web/src/routes/field/$campaignId/canvassing.tsx` contains
  `data-testid="canvassing-map-wrapper"` and `aria-hidden={listViewOpen
  || undefined}` — verified via Read.
- `web/src/routes/field/$campaignId/canvassing.test.tsx` contains the
  two new `MAP-02:` describe strings — verified via Read.
- `.planning/phases/109-map-rendering-asset-pipeline/109-ASSET-AUDIT.md`
  contains `## MAP-02 layout decision` — verified via Grep.
- Commit `742f784` exists in `git log` — verified.
- Commit `2811a50` exists in `git log` — verified.
- Commit `82add26` exists in `git log` — verified.
- `cd web && npx vitest run src/routes/field/$campaignId/canvassing.test.tsx`
  → 6/6 passed — verified.
- `cd web && npx tsc --noEmit` → clean — verified.
