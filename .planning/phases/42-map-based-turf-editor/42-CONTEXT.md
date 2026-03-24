# Phase 42: Map-Based Turf Editor - Context

**Gathered:** 2026-03-24
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
- **D-03:** Advanced raw JSON toggle is a collapsible section below the map. Small "Advanced" toggle reveals the raw JSON textarea. Edits in either direction sync bidirectionally (map ↔ JSON)

### Overview map display
- **D-04:** Overview map renders at the top of the existing turf list page (`/canvassing`). Shows all campaign turfs as colored polygons. Click a turf polygon to navigate to its detail page
- **D-05:** Turfs color-coded by status: draft, active, completed — three distinct colors (MAP-03)
- **D-06:** Voter locations shown only on the selected turf — click a turf polygon to load its voters as clustered markers. Avoids loading all campaign voters at once (MAP-04)
- **D-07:** Turf popup on click shows: name, color-coded status badge, voter count (from `get_voter_count()`), and a link to the turf detail page (MAP-05)

### GeoJSON import/export
- **D-08:** Import flow: file picker on new turf page → uploaded .geojson renders on the map as a preview → user confirms name/description → saves. Reuses existing TurfForm flow (MAP-06)
- **D-09:** Export is per-turf only — download button on turf detail page. Client-side blob download of the boundary as a `.geojson` file. No backend changes needed (MAP-07)

### Overlap detection
- **D-10:** Visual highlight only — overlapping areas highlighted in a different color on the map when drawing/editing. No warning dialog or save blocking. Purely visual feedback (MAP-10)

### Address geocoding
- **D-11:** Both auto-center and manual search — map auto-centers on bounding box of existing turfs (or voter locations if no turfs), plus a search bar above the map for address lookup via Nominatim. Free, no API key, OSM-based (MAP-09)

### Satellite imagery
- **D-12:** Standard Leaflet layers control in top-right corner. Toggle between OpenStreetMap street tiles and satellite imagery (e.g., Esri World Imagery free tiles) (MAP-11)

### Claude's Discretion
- Geoman toolbar configuration and placement
- Marker clustering library choice (react-leaflet-cluster or alternatives)
- Exact color scheme for turf status polygons
- Nominatim debounce/rate limiting approach
- Overlap detection query implementation (PostGIS ST_Intersects or client-side)
- Map default zoom level and bounds padding
- Loading states for voter markers and voter count

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
- `web/src/components/canvassing/TurfForm.tsx` — Current textarea form to replace with map component
- `web/src/types/turf.ts` — TypeScript types for TurfCreate, TurfUpdate, TurfResponse
- `web/package.json` — `react-leaflet` 5.0 and `leaflet` 1.9 already installed

### Established Patterns
- react-hook-form + zod validation for all forms (TurfForm uses this pattern)
- TanStack Query for data fetching with cache invalidation on mutations
- shadcn/ui components (Button, Input, Label, Textarea, Skeleton)
- `sonner` toast notifications for mutation success/error
- `DestructiveConfirmDialog` for dangerous actions (delete turf)
- Cursor-based pagination for list endpoints

### Integration Points
- `/campaigns/$campaignId/canvassing` route — overview map goes here above turf list
- `/campaigns/$campaignId/canvassing/turfs/new` — map editor replaces textarea
- `/campaigns/$campaignId/canvassing/turfs/$turfId` — edit map replaces textarea
- Backend `GET /campaigns/{campaign_id}/turfs` — needs voter_count field added to response
- New backend query needed for overlap detection (ST_Intersects against active turfs)
- Nominatim external API call for address geocoding (client-side fetch)

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
