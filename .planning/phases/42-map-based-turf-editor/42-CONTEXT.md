# Phase 42: Map-Based Turf Editor - Context

**Gathered:** 2026-03-24
**Updated:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Campaign managers can draw, edit, and manage turf boundaries visually on an interactive map instead of pasting raw GeoJSON. Delivers: Geoman polygon draw/edit, overview map with all turfs color-coded by status, voter markers on selected turf, GeoJSON file import with preview, GeoJSON export download, raw JSON advanced toggle, address geocoding search, overlap visual highlighting, and satellite tile toggle.

</domain>

<decisions>
## Implementation Decisions

### Map interaction UX
- **D-01:** Draw-then-confirm flow — user draws polygon on the map, sees it rendered with area stats, then clicks "Save Turf" button. Can redraw before saving. Matches existing TurfForm submit pattern
- **D-02:** Replace existing TurfForm textarea with the map component — same routes (`/turfs/new`, `/turfs/$turfId`). Minimal routing changes. The map component becomes the new TurfForm
- **D-03:** Advanced raw JSON toggle is a collapsible section below the map. Small "Advanced" toggle reveals the raw JSON textarea. Edits in either direction sync bidirectionally (map <-> JSON)

### Overview map display
- **D-04:** Overview map renders at the top of the existing turf list page (`/canvassing`). Shows all campaign turfs as colored polygons. Click a turf polygon to navigate to its detail page
- **D-05:** Turfs color-coded by status: draft, active, completed — three distinct colors (MAP-03)
- **D-06:** Voter locations shown only on the selected turf — click a turf polygon to load its voters as clustered markers. Avoids loading all campaign voters at once (MAP-04)
- **D-07:** Turf popup on click shows: name, color-coded status badge, voter count (from `get_voter_count()`), and a link to the turf detail page (MAP-05)

### GeoJSON import/export
- **D-08:** Import flow: file picker on new turf page -> uploaded .geojson renders on the map as a preview -> user confirms name/description -> saves. Reuses existing TurfForm flow (MAP-06)
- **D-09:** Export is per-turf only — download button on turf detail page. Client-side blob download of the boundary as a `.geojson` file. No backend changes needed (MAP-07)

### Overlap detection
- **D-10:** Visual highlight only — overlapping areas highlighted in a different color on the map when drawing/editing. No warning dialog or save blocking. Purely visual feedback (MAP-10)

### Address geocoding
- **D-11:** Both auto-center and manual search — map auto-centers on bounding box of existing turfs (or voter locations if no turfs), plus a search bar above the map for address lookup via Nominatim. Free, no API key, OSM-based (MAP-09)

### Satellite imagery
- **D-12:** Standard Leaflet layers control in top-right corner. Toggle between OpenStreetMap street tiles and satellite imagery (e.g., Esri World Imagery free tiles) (MAP-11)

### Map component architecture
- **D-13:** Single `TurfMapEditor` component with subcomponents for draw/view modes. The editor wraps react-leaflet's `MapContainer` and conditionally enables Geoman controls based on edit vs. view mode. Separate `TurfOverviewMap` component for the canvassing index page. Both share a common `MapProvider` for tile layer and base configuration
- **D-14:** Map components live in `web/src/components/canvassing/map/` directory — grouped under canvassing since maps are turf-specific, not app-wide. Files: `TurfMapEditor.tsx`, `TurfOverviewMap.tsx`, `MapProvider.tsx`, `GeoJsonImport.tsx`

### Backend voter_count integration
- **D-15:** Add `voter_count` as a computed field on the turf list endpoint response. Use a correlated subquery (`SELECT COUNT(*) FROM voters WHERE ST_Contains(turf.boundary, voters.geom)`) joined in the list query to avoid N+1. The existing `get_voter_count()` method in TurfService handles the single-turf case; list endpoint needs a batch-optimized version

### Error handling & edge cases
- **D-16:** Client-side GeoJSON validation via Geoman's built-in polygon validation (no self-intersections) plus zod schema refinement on the boundary field before submit. Invalid polygons show inline error below the map, consistent with existing react-hook-form error pattern. Backend `_validate_polygon()` in TurfService is the final guard

### Mobile/responsive behavior
- **D-17:** Full-width map with reduced height on mobile (h-64 on mobile, h-96 on desktop). Geoman toolbar stays standard size — touch targets already meet 44px minimum from Geoman defaults. Overview map on canvassing index is collapsible on mobile to preserve scroll space for the turf card grid

### Claude's Discretion
- Geoman toolbar configuration and placement
- Marker clustering library choice (react-leaflet-cluster or alternatives)
- Exact color scheme for turf status polygons
- Nominatim debounce/rate limiting approach
- Overlap detection query implementation (PostGIS ST_Intersects or client-side)
- Map default zoom level and bounds padding
- Loading states for voter markers and voter count
- MapProvider implementation details (context vs props)
- Batch voter_count subquery optimization approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md MAP-01 through MAP-11.

### Requirements
- `.planning/REQUIREMENTS.md` §MAP — MAP-01 through MAP-11 define all acceptance criteria for this phase

### Prior phase decisions
- `.planning/phases/39-rls-fix-multi-campaign-foundation/39-CONTEXT.md` — RLS context pattern (get_campaign_db) that turf endpoints use
- `.planning/phases/41-organization-data-model-auth/41-CONTEXT.md` — Org role resolution affects who can manage turfs (manager+ role)

### Existing code (must read before implementing)
- `web/src/components/canvassing/TurfForm.tsx` — Current textarea form being replaced (react-hook-form + zod pattern)
- `web/src/hooks/useTurfs.ts` — All TanStack Query hooks (useTurfs, useTurf, useCreateTurf, useUpdateTurf, useDeleteTurf)
- `web/src/routes/campaigns/$campaignId/canvassing/index.tsx` — Canvassing index page where overview map is inserted
- `web/src/routes/campaigns/$campaignId/canvassing/turfs/new.tsx` — New turf route (map editor replaces textarea)
- `web/src/routes/campaigns/$campaignId/canvassing/turfs/$turfId.tsx` — Edit turf route (map editor replaces textarea)
- `app/services/turf.py` — TurfService with `_validate_polygon()`, `_wkb_to_geojson()`, `get_voter_count()` via ST_Contains
- `app/api/v1/turfs.py` — Complete CRUD endpoints (needs voter_count field added to list response)
- `web/src/types/turf.ts` — TypeScript types for TurfCreate, TurfUpdate, TurfResponse

### Research notes
- `.planning/STATE.md` §Decisions — "Use `@geoman-io/leaflet-geoman-free` for map editor (not abandoned `leaflet-draw`)"
- `.planning/STATE.md` §Blockers — "react-leaflet-cluster compatibility with react-leaflet 5 (Phase 42)" — researcher should verify

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/turf.py` — Full TurfService with `_validate_polygon()`, `_wkb_to_geojson()`, `get_voter_count()` via ST_Contains. Core backend ready
- `app/api/v1/turfs.py` — Complete CRUD endpoints (create, list, get, update, delete). Need to wire `get_voter_count()` into list response
- `web/src/hooks/useTurfs.ts` — All TanStack Query hooks (useTurfs, useTurf, useCreateTurf, useUpdateTurf, useDeleteTurf) ready
- `web/src/components/canvassing/TurfForm.tsx` — Current textarea form (74 lines) to replace with map component. Uses react-hook-form + zod + Button/Input/Label/Textarea from shadcn
- `web/src/types/turf.ts` — TypeScript types for TurfCreate, TurfUpdate, TurfResponse
- `web/package.json` — `react-leaflet` 5.0 and `leaflet` 1.9 already installed. Geoman and clustering libraries need to be added
- `web/src/components/shared/EmptyState.tsx` — Reusable empty state component (used on canvassing index)
- `web/src/components/shared/ConfirmDialog.tsx` — Reusable confirm dialog (used for turf delete)

### Established Patterns
- react-hook-form + zod validation for all forms (TurfForm uses this pattern)
- TanStack Query for data fetching with cache invalidation on mutations
- shadcn/ui components (Button, Input, Label, Textarea, Skeleton, Badge, Card)
- `sonner` toast notifications for mutation success/error
- `ConfirmDialog` for dangerous actions (delete turf)
- Cursor-based pagination for list endpoints
- Card grid layout for turf list on canvassing index (md:grid-cols-2 lg:grid-cols-3)
- `EmptyState` component with icon, title, description, and action button
- Lucide icons throughout (Map, Plus, Trash2, List used on canvassing page)

### Integration Points
- `/campaigns/$campaignId/canvassing` route — overview map inserts above existing turf card grid (line 48)
- `/campaigns/$campaignId/canvassing/turfs/new` — map editor replaces textarea
- `/campaigns/$campaignId/canvassing/turfs/$turfId` — edit map replaces textarea
- Backend `GET /campaigns/{campaign_id}/turfs` — needs voter_count field added to response
- New backend query needed for overlap detection (ST_Intersects against active turfs)
- Nominatim external API call for address geocoding (client-side fetch)
- Turf cards already link to detail page via `Link` component with `absolute inset-0 z-10` overlay pattern

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 42-map-based-turf-editor*
*Context gathered: 2026-03-24*
