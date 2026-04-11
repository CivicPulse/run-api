# Phase 109: Map Rendering & Asset Pipeline - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous run — Claude's Discretion per workflow.skip_discuss pattern)

<domain>
## Phase Boundary

Fix map rendering bugs across all field-mode map views (canvassing, walk list, volunteer hub) so that:

1. Every Leaflet marker icon renders correctly (no broken-image placeholders).
2. In list view the household list is fully visible and interactable — the map no longer occludes it via layout or z-index.
3. An asset pipeline audit document confirms every Leaflet icon, sprite, and tile asset resolves under dev, preview, and production build/serve.

Out of scope: new map features, new marker styles, map performance optimization.

</domain>

<decisions>
## Implementation Decisions

### MAP-01 — Marker Icon Rendering

- **Root cause hypothesis:** Leaflet's default `L.Icon.Default` ships with webpack/Vite-unfriendly image URLs. Phase 108 migrated household markers to `L.DivIcon` (no image assets), but `volunteerIcon` and any remaining `L.Icon` uses (walk list map, volunteer hub map) still reference images via default CSS-relative paths that break under Vite's hashed asset pipeline.
- **Approach:** Audit every `L.Icon` / `L.icon()` construction site. For each, explicitly import the asset via ES module import so Vite fingerprints and bundles it. Prefer `L.DivIcon` with inline SVG or CSS-based styling where the asset is purely decorative (volunteer pin, walk list start/end markers). Keep real bitmap icons only when there is a design reason.
- **Verification:** Unit test each marker factory asserts `getIconUrl()` (or DivIcon html) returns a truthy non-empty value. Playwright test navigates to each map view, waits for map load, and asserts `img[src$=".png"]` inside the map container either resolves (no broken-image 0×0 natural size) or is absent by design.

### MAP-02 — List View Layout / Z-Index Fix

- **Root cause hypothesis:** The canvassing field route renders both the map container and the household list inside the same layout. In list-mode the list should take full viewport but the map container is still mounted (for panTo state) and its z-index or absolute positioning covers the list area, blocking taps.
- **Approach:** Mount the map conditionally per view mode (list vs map), OR keep it mounted but use `display: none` / `visibility: hidden` + `pointer-events: none` so it cannot intercept events. Prefer the latter to preserve Leaflet instance state across mode toggles (avoids re-initialization cost per phase-108 panTo wiring).
- **Verification:** Playwright test in list view taps a household card near the screen edge where the map previously overlapped and asserts the HouseholdCard click handler fires (not the map click handler). Unit test asserts the map container has `pointer-events: none` in list mode.

### MAP-03 — Asset Pipeline Audit Document

- **Scope:** Create `.planning/phases/109-map-rendering-asset-pipeline/109-ASSET-AUDIT.md` that tables every Leaflet-related asset (icon images, sprite sheets, CSS images, tile URLs) and its resolution status under `npm run dev`, `npm run build && npm run preview`, and the production Docker image build.
- **Method:** Grep the codebase for leaflet icon imports, CSS `url()` references to marker images, and tile layer URL templates. For each entry, document the asset path, how it's imported (ES import vs CSS url vs external URL), and the verification result per environment.
- **Deliverable:** Audit table + open issues section for any asset that fails to resolve in any environment.

### Claude's Discretion

All tactical implementation choices (file organization, helper function names, test structure) are at Claude's discretion — discuss phase was skipped per autonomous workflow. Apply the same patterns as phase 108:
- Unit tests mirror `CanvassingMap.test.tsx` — `vi.mock('leaflet')` + `vi.mock('react-leaflet')` with `forwardRef` Marker mock.
- E2E tests extend `canvassing-house-selection.spec.ts` patterns and log runs via `web/scripts/run-e2e.sh`.
- Commits use `fix(109-XX): ...` / `test(109-XX): ...` / `docs(109-XX): ...` prefixes.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/src/components/field/CanvassingMap.tsx` — canvassing map with `InteractiveHouseholdMarker` (DivIcon, ARIA, keydown) — established pattern to replicate.
- `web/src/components/canvassing/map/__mocks__/leaflet.ts` — shared Leaflet mock (now includes DivIcon + divIcon from phase 108).
- `web/src/hooks/useCanvassingWizard.ts` — wizard state shared across list/map views.

### Established Patterns
- DivIcon-first for interactive markers (phase 108 SPIKES A2 decision).
- Vitest + top-level `vi.mock('leaflet')` with `forwardRef` Marker mock that exposes `getElement()`.
- Playwright E2E runs via `web/scripts/run-e2e.sh` which logs to `web/e2e-runs.jsonl`.

### Integration Points
- Route `web/src/routes/field/$campaignId/canvassing.tsx` — hosts both map and list view toggles.
- Walk list view (find in `web/src/routes/field/...`) — likely second consumer of L.Icon.
- Volunteer hub map — third consumer.
- `web/src/index.css` — phase 108 added `.canvassing-map-household-marker` styles; may need sibling classes for other markers.

</code_context>

<specifics>
## Specific Ideas

- Phase 108 deliberately left volunteer marker as `L.Icon` because it is non-interactive and doesn't need pseudo-element hit areas. MAP-01 may prove that choice needs revisiting if the L.Icon asset pipeline is the broken path.
- The 108-REVIEW IN-03 finding (Playwright tests use `dispatchEvent('click')` because marker `::before` hit areas overlap neighbors at default viewport) is directly related to MAP-02. A real layout fix in 109 may let those E2E tests drop the dispatchEvent workaround.

</specifics>

<deferred>
## Deferred Ideas

- Map performance optimization (bundle size, tile caching, deferred marker rendering) — out of scope for this hardening phase.
- Offline tile caching — belongs to phase 110 (OFFLINE-01).

</deferred>
