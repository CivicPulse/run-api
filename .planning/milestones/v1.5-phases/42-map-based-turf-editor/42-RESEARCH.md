# Phase 42: Map-Based Turf Editor - Research

**Researched:** 2026-03-24
**Domain:** Interactive map editing (Leaflet/Geoman), GeoJSON handling, PostGIS spatial queries
**Confidence:** HIGH

## Summary

This phase replaces the raw GeoJSON textarea in TurfForm with an interactive Leaflet map editor powered by `@geoman-io/leaflet-geoman-free`. The project already has `react-leaflet` 5.0.0 and `leaflet` 1.9.4 installed. Geoman (2.19.2) is the standard choice for polygon drawing/editing on Leaflet maps -- it is actively maintained and replaces the abandoned `leaflet-draw`. The `react-leaflet-cluster` 4.0.0 package is confirmed compatible with react-leaflet 5 and React 19 (resolving the STATE.md blocker).

The backend is nearly complete: `TurfService` already has `_validate_polygon()`, `_wkb_to_geojson()`, and `get_voter_count()`. The main backend work is (1) wiring `voter_count` into the list endpoint response via a batch subquery, (2) adding a new endpoint or filter to fetch voters within a turf boundary for map markers, and (3) adding an `ST_Intersects` query for overlap detection.

**Primary recommendation:** Use `@geoman-io/leaflet-geoman-free` with a `createControlComponent` wrapper for react-leaflet integration. Use `react-leaflet-cluster` for voter marker clustering. Use Nominatim for geocoding with 300ms debounce. Keep all map components under `web/src/components/canvassing/map/`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Draw-then-confirm flow -- user draws polygon, sees area stats, clicks "Save Turf". Can redraw before saving
- **D-02:** Replace existing TurfForm textarea with map component -- same routes (`/turfs/new`, `/turfs/$turfId`)
- **D-03:** Advanced raw JSON toggle is collapsible section below map with bidirectional sync (map <-> JSON)
- **D-04:** Overview map at top of canvassing index page (`/canvassing`), turfs as colored polygons, click to navigate
- **D-05:** Color-coded by status: draft, active, completed -- three distinct colors
- **D-06:** Voter locations shown only on selected turf via clustered markers. No loading all campaign voters
- **D-07:** Turf popup: name, status badge, voter count (from `get_voter_count()`), link to detail
- **D-08:** Import: file picker -> preview on map -> confirm name/description -> save
- **D-09:** Export: per-turf client-side blob download as `.geojson`
- **D-10:** Overlap detection: visual highlight only, no warning dialog or save blocking
- **D-11:** Nominatim for geocoding (free, no API key, OSM-based). Auto-center + manual search bar
- **D-12:** Leaflet layers control for street/satellite toggle (Esri World Imagery free tiles)
- **D-13:** Single `TurfMapEditor` + `TurfOverviewMap` + shared `MapProvider`. Edit/view modes via conditional Geoman controls
- **D-14:** Components in `web/src/components/canvassing/map/` directory
- **D-15:** `voter_count` as computed field on turf list endpoint via correlated subquery
- **D-16:** Client-side validation via Geoman + zod refinement. Backend `_validate_polygon()` is final guard
- **D-17:** Full-width map, h-64 mobile / h-96 desktop. Overview collapsible on mobile

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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-01 | Draw polygon boundaries using Geoman controls | Geoman `createControlComponent` wrapper pattern verified; `pm:create` event returns layer with GeoJSON |
| MAP-02 | Edit existing turf by dragging vertices | Geoman edit mode (`pm.enableLayerDrag()`, `pm:edit` event) built-in |
| MAP-03 | Overview map with turfs color-coded by status | react-leaflet `GeoJSON` component with `style` callback per status |
| MAP-04 | Selected turf shows clustered voter markers | `react-leaflet-cluster` 4.0.0 confirmed compatible; new backend endpoint needed |
| MAP-05 | Voter count badge on list and map popup | Backend `get_voter_count()` exists; wire into list response via subquery |
| MAP-06 | Import `.geojson` file with preview | Client-side `FileReader` + JSON.parse + render as `GeoJSON` layer |
| MAP-07 | Export turf as `.geojson` file | Client-side `Blob` + `URL.createObjectURL` download |
| MAP-08 | Raw JSON textarea as "Advanced" toggle | Collapsible section with `watch`/`setValue` bidirectional sync |
| MAP-09 | Address geocoding via Nominatim | Nominatim `/search` endpoint, 1 req/sec rate limit, 300ms debounce |
| MAP-10 | Overlap detection (visual highlight) | PostGIS `ST_Intersects` query recommended for accuracy; client-side fallback possible with Turf.js |
| MAP-11 | Satellite/aerial imagery toggle | Esri World Imagery free tiles via Leaflet layers control |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` for Python, never system python
- **Frontend tests:** `vitest` with happy-dom, 95% coverage thresholds
- **Python linting:** `uv run ruff check .` / `uv run ruff format .`
- **Commits:** Conventional Commits format
- **Docs lookup:** Use Context7 MCP for library documentation
- **Line length:** 88 chars

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| react-leaflet | 5.0.0 | React wrapper for Leaflet | Installed |
| leaflet | 1.9.4 | Map rendering engine | Installed |
| @types/leaflet | 1.9.21 | TypeScript types for Leaflet | Installed |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @geoman-io/leaflet-geoman-free | 2.19.2 | Polygon draw/edit controls | Official free version, replaces abandoned leaflet-draw, built-in validation |
| react-leaflet-cluster | 4.0.0 | Marker clustering | Only maintained react-leaflet 5 compatible cluster lib, wraps Leaflet.markercluster |

### Not Needed
| Library | Why Not |
|---------|---------|
| @turf/turf | Client-side spatial ops -- only needed if overlap detection is done client-side. PostGIS `ST_Intersects` is more accurate and already available |
| react-leaflet-geoman-v2 | Third-party wrapper with maintenance risk; `createControlComponent` pattern is 15 lines and official |
| leaflet-draw | Abandoned, no TypeScript support, Geoman is the successor |

**Installation:**
```bash
cd web && npm install @geoman-io/leaflet-geoman-free@^2.19.2 react-leaflet-cluster@^4.0.0
```

## Architecture Patterns

### Recommended Component Structure
```
web/src/components/canvassing/map/
  MapProvider.tsx           # Shared tile layer config, default center/zoom
  TurfMapEditor.tsx         # Draw/edit polygon (used on new/edit pages)
  TurfOverviewMap.tsx       # All turfs rendered, click to navigate
  GeoJsonImport.tsx         # File input + preview layer
  GeomanControl.tsx         # createControlComponent wrapper for Geoman
  VoterMarkerLayer.tsx      # Clustered voter markers for selected turf
  AddressSearch.tsx         # Nominatim geocoding search bar
  OverlapHighlight.tsx      # Visual overlap layer (fetched via API)
```

### Pattern 1: Geoman Integration via createControlComponent

**What:** Wrap Geoman as a react-leaflet control using the official `createControlComponent` API.
**When to use:** Always -- this is the standard way to integrate imperative Leaflet plugins with react-leaflet.

```typescript
// web/src/components/canvassing/map/GeomanControl.tsx
import { createControlComponent } from "@react-leaflet/core"
import * as L from "leaflet"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"

interface GeomanOptions extends L.ControlOptions {
  position: L.ControlPosition
  drawPolygon?: boolean
  drawMarker?: boolean
  drawCircle?: boolean
  drawPolyline?: boolean
  drawRectangle?: boolean
  drawCircleMarker?: boolean
  drawText?: boolean
  editMode?: boolean
  dragMode?: boolean
  cutPolygon?: boolean
  removalMode?: boolean
  rotateMode?: boolean
}

const Geoman = L.Control.extend({
  options: {} as GeomanOptions,
  initialize(options: GeomanOptions) {
    L.setOptions(this, options)
  },
  addTo(map: L.Map) {
    if (!map.pm) return this
    map.pm.addControls({
      ...this.options,
      // Disable everything except polygon drawing and editing
      drawMarker: false,
      drawCircle: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircleMarker: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    })
    return this
  },
})

export const GeomanControl = createControlComponent(
  (props: GeomanOptions) => new Geoman(props)
)
```

### Pattern 2: Bidirectional Map <-> JSON Sync

**What:** Map draws update the form's boundary field; textarea edits re-render the map layer.
**When to use:** For the Advanced JSON toggle (D-03).

```typescript
// In TurfMapEditor, use react-hook-form's watch/setValue:
const boundary = watch("boundary")

// Map -> Form: on Geoman pm:create / pm:edit event
map.on("pm:create", (e) => {
  const geojson = e.layer.toGeoJSON().geometry
  setValue("boundary", JSON.stringify(geojson, null, 2), { shouldValidate: true })
})

// Form -> Map: useEffect watching boundary string
useEffect(() => {
  try {
    const parsed = JSON.parse(boundary)
    // Clear existing layers, add new GeoJSON layer
    editLayerRef.current?.clearLayers()
    L.geoJSON(parsed).addTo(editLayerRef.current)
  } catch { /* invalid JSON, ignore */ }
}, [boundary])
```

### Pattern 3: Turf Status Color Scheme

**What:** Consistent color coding for turf polygons by status.
**Recommended colors:**

```typescript
const TURF_STATUS_COLORS: Record<string, { fill: string; stroke: string }> = {
  draft:     { fill: "#fbbf24", stroke: "#d97706" },  // amber
  active:    { fill: "#34d399", stroke: "#059669" },  // emerald
  completed: { fill: "#93c5fd", stroke: "#2563eb" },  // blue
}
```

### Pattern 4: Nominatim Search with Debounce

**What:** Address geocoding with rate-limiting per Nominatim usage policy.
**Key constraints:** Max 1 request/second, must set User-Agent/Referer, no autocomplete.

```typescript
// Use a 300ms debounce on form submit (NOT on keystroke -- Nominatim prohibits autocomplete)
const searchAddress = async (query: string) => {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(query)}&format=json&limit=5`,
    { headers: { "User-Agent": "CivicPulse/1.5 (campaign-tool)" } }
  )
  return res.json()
}
// Trigger on Enter key or Search button click, NOT on every keystroke
```

### Pattern 5: Batch voter_count Subquery

**What:** Add voter_count to list response without N+1 queries.

```python
# In app/api/v1/turfs.py list_turfs endpoint:
from sqlalchemy import func, select
from app.models.voter import Voter

# Option A: lateral subquery (recommended for PostgreSQL)
voter_count_subq = (
    select(func.count(Voter.id))
    .where(
        Voter.geom.is_not(None),
        func.ST_Contains(Turf.boundary, Voter.geom),
    )
    .correlate(Turf)
    .scalar_subquery()
    .label("voter_count")
)

query = select(Turf, voter_count_subq).where(Turf.campaign_id == campaign_id)
```

### Anti-Patterns to Avoid
- **Importing all Geoman CSS globally:** Import only in the GeomanControl component to avoid side effects
- **Loading all campaign voters at once:** Always scope to selected turf boundary (D-06)
- **Using Nominatim for autocomplete:** Explicitly prohibited by Nominatim usage policy. Use search-on-submit instead
- **Client-side polygon validation only:** Backend `_validate_polygon()` must remain the authoritative check
- **Mutating Leaflet map state in React render:** Always use refs or useEffect for imperative map operations

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polygon drawing UI | Custom SVG canvas drawing tool | Geoman `pm.addControls()` | Handles vertex snapping, self-intersection detection, undo/redo, touch support |
| Marker clustering | Custom clustering algorithm | react-leaflet-cluster | Handles zoom-based aggregation, spiderfy, animation, viewport culling |
| Geocoding | Custom geocoding service | Nominatim API (client-side fetch) | Free, no API key, OSM data. Per D-11 |
| GeoJSON validation | Custom coordinate validation | Shapely (backend) + Geoman (frontend) | Handles ring closure, winding order, self-intersection. Backend `_validate_polygon()` already exists |
| Spatial containment query | Custom point-in-polygon JS | PostGIS ST_Contains / ST_Intersects | Uses spatial index, handles edge cases (dateline, poles), already in TurfService |
| Tile layer switching | Custom tile management | Leaflet L.control.layers | Built-in control, handles attribution, remembers selection |

## Common Pitfalls

### Pitfall 1: Leaflet CSS Not Loading
**What goes wrong:** Map tiles render but controls, popups, and markers look broken or invisible.
**Why it happens:** Leaflet CSS must be explicitly imported; it's not bundled by react-leaflet.
**How to avoid:** Import `leaflet/dist/leaflet.css` in the MapProvider or map component. Also import Geoman CSS and react-leaflet-cluster CSS.
**Warning signs:** Map container renders but has no zoom controls; markers are invisible or giant.

### Pitfall 2: Geoman Events Fire Multiple Times
**What goes wrong:** `pm:create` or `pm:edit` events fire duplicate callbacks after component re-renders.
**Why it happens:** Event listeners added in useEffect without cleanup, or component remounts.
**How to avoid:** Use a ref to track the map instance, add listeners in useEffect with proper cleanup (`map.off("pm:create")`). Use a stable callback ref.
**Warning signs:** Boundary field updates twice per draw action; duplicate API calls.

### Pitfall 3: GeoJSON Coordinate Order
**What goes wrong:** Polygons render in wrong location or server rejects them.
**Why it happens:** GeoJSON uses `[longitude, latitude]` but many geocoders return `[lat, lng]`. Leaflet internally uses `[lat, lng]` for LatLng objects but `[lng, lat]` for GeoJSON.
**How to avoid:** Always use `layer.toGeoJSON()` to get GeoJSON from Leaflet (correct order). Never manually construct coordinate arrays from LatLng objects without swapping.
**Warning signs:** Polygons appear in the ocean or at wrong coordinates.

### Pitfall 4: Large Voter Datasets Freezing the Map
**What goes wrong:** Rendering 10,000+ voter markers causes the map to freeze.
**Why it happens:** Each Leaflet marker is a DOM element; too many causes browser jank.
**How to avoid:** Use react-leaflet-cluster with `chunkedLoading: true`. Set `disableClusteringAtZoom` to a reasonable level (e.g., 17). Consider paginating the voter fetch endpoint.
**Warning signs:** Map becomes unresponsive after loading voters; browser memory spikes.

### Pitfall 5: Map Container Height Zero
**What goes wrong:** Map renders as invisible (0px height).
**Why it happens:** Leaflet `MapContainer` needs explicit height. CSS `h-full` doesn't work if parent has no height.
**How to avoid:** Use explicit height classes: `h-64` (mobile) / `h-96` (desktop) per D-17. Avoid percentage-based heights without a sized parent.
**Warning signs:** Map container is in DOM but invisible; no tile requests in Network tab.

### Pitfall 6: Nominatim Rate Limiting / Blocking
**What goes wrong:** Nominatim returns 429 or blocks the app's requests.
**Why it happens:** Exceeding 1 request/second, missing User-Agent, or implementing autocomplete.
**How to avoid:** Debounce search to 300ms minimum; set proper User-Agent header; trigger search on submit only (not keystroke). Per Nominatim policy.
**Warning signs:** 429 responses; "Usage limit reached" error message.

### Pitfall 7: Stale Map After React Re-render
**What goes wrong:** Map shows stale tiles, wrong position, or doesn't resize properly.
**Why it happens:** React re-render doesn't trigger Leaflet's `invalidateSize()`.
**How to avoid:** Call `map.invalidateSize()` after any layout change (e.g., collapsible panel open/close, tab switch). Use `useMap()` hook from react-leaflet.
**Warning signs:** Map shows gray tiles; map doesn't fill container after resize.

## Code Examples

### GeoJSON File Import
```typescript
// web/src/components/canvassing/map/GeoJsonImport.tsx
const handleFileImport = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const geojson = JSON.parse(e.target?.result as string)
      // Handle both Feature and FeatureCollection
      const geometry = geojson.type === "FeatureCollection"
        ? geojson.features[0]?.geometry
        : geojson.type === "Feature"
          ? geojson.geometry
          : geojson
      if (geometry?.type !== "Polygon") {
        toast.error("Only Polygon geometries are supported")
        return
      }
      // Set on map as preview layer + update form
      setValue("boundary", JSON.stringify(geometry, null, 2))
    } catch {
      toast.error("Invalid GeoJSON file")
    }
  }
  reader.readAsText(file)
}
```

### GeoJSON Export (Client-Side Download)
```typescript
// Per D-09: client-side blob download, no backend changes
const exportGeoJson = (boundary: Record<string, unknown>, turfName: string) => {
  const feature = {
    type: "Feature",
    properties: { name: turfName },
    geometry: boundary,
  }
  const blob = new Blob([JSON.stringify(feature, null, 2)], { type: "application/geo+json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${turfName.replace(/\s+/g, "-").toLowerCase()}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}
```

### Backend: Voters by Turf Endpoint
```python
# New endpoint or filter addition to app/api/v1/turfs.py
@router.get(
    "/campaigns/{campaign_id}/turfs/{turf_id}/voters",
    response_model=list[VoterLocationResponse],
)
async def get_turf_voters(
    campaign_id: uuid.UUID,
    turf_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Get voter locations within a turf boundary for map display."""
    turf = await _service.get_turf(db, turf_id)
    if turf is None:
        return problem.ProblemResponse(...)

    # Lightweight response -- only id, lat, lng, name for markers
    query = (
        select(Voter.id, Voter.latitude, Voter.longitude, Voter.first_name, Voter.last_name)
        .where(
            Voter.geom.is_not(None),
            func.ST_Contains(turf.boundary, Voter.geom),
        )
    )
    result = await db.execute(query)
    return [
        VoterLocationResponse(
            id=row.id, latitude=row.latitude, longitude=row.longitude,
            name=f"{row.first_name or ''} {row.last_name or ''}".strip(),
        )
        for row in result.all()
    ]
```

### Backend: Overlap Detection Endpoint
```python
# New endpoint in app/api/v1/turfs.py
@router.get(
    "/campaigns/{campaign_id}/turfs/overlaps",
)
async def get_turf_overlaps(
    campaign_id: uuid.UUID,
    boundary: str = Query(..., description="GeoJSON geometry string"),
    exclude_turf_id: uuid.UUID | None = Query(None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Find active turfs that intersect a given boundary."""
    geojson = json.loads(boundary)
    wkb = _validate_polygon(geojson)
    query = (
        select(Turf.id, Turf.name, Turf.boundary)
        .where(
            Turf.campaign_id == campaign_id,
            Turf.status == TurfStatus.ACTIVE,
            func.ST_Intersects(Turf.boundary, wkb),
        )
    )
    if exclude_turf_id:
        query = query.where(Turf.id != exclude_turf_id)
    # Return overlapping turfs for client to render intersection
    ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| leaflet-draw | @geoman-io/leaflet-geoman-free | 2021+ | leaflet-draw unmaintained since 2020; Geoman is the standard replacement |
| react-leaflet-markercluster | react-leaflet-cluster | 2023 (v4.0) | Old package didn't support react-leaflet 5; react-leaflet-cluster 4.0 does |
| Google Maps Geocoding API | Nominatim | Always available | Free, no API key, sufficient for search-on-submit use case |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + happy-dom |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01 | Geoman draw creates polygon GeoJSON | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "draw"` | Wave 0 |
| MAP-02 | Edit mode updates boundary on vertex drag | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "edit"` | Wave 0 |
| MAP-03 | Overview map renders turfs with status colors | unit | `cd web && npx vitest run src/components/canvassing/map/TurfOverviewMap.test.tsx` | Wave 0 |
| MAP-04 | Voter markers cluster on selected turf | unit | `cd web && npx vitest run src/components/canvassing/map/VoterMarkerLayer.test.tsx` | Wave 0 |
| MAP-05 | voter_count field in turf list response | unit (backend) | `cd /home/kwhatcher/projects/civicpulse/run-api && uv run pytest tests/ -k "voter_count" -x` | Wave 0 |
| MAP-06 | Import .geojson renders preview | unit | `cd web && npx vitest run src/components/canvassing/map/GeoJsonImport.test.tsx` | Wave 0 |
| MAP-07 | Export downloads .geojson blob | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "export"` | Wave 0 |
| MAP-08 | Advanced JSON toggle syncs bidirectionally | unit | `cd web && npx vitest run src/components/canvassing/map/TurfMapEditor.test.tsx -t "json"` | Wave 0 |
| MAP-09 | Address search calls Nominatim and pans map | unit | `cd web && npx vitest run src/components/canvassing/map/AddressSearch.test.tsx` | Wave 0 |
| MAP-10 | Overlap highlight renders intersection | unit | `cd web && npx vitest run src/components/canvassing/map/OverlapHighlight.test.tsx` | Wave 0 |
| MAP-11 | Tile layer toggle switches between street/satellite | unit | `cd web && npx vitest run src/components/canvassing/map/MapProvider.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/components/canvassing/map/TurfMapEditor.test.tsx` -- covers MAP-01, MAP-02, MAP-07, MAP-08
- [ ] `web/src/components/canvassing/map/TurfOverviewMap.test.tsx` -- covers MAP-03
- [ ] `web/src/components/canvassing/map/VoterMarkerLayer.test.tsx` -- covers MAP-04
- [ ] `web/src/components/canvassing/map/GeoJsonImport.test.tsx` -- covers MAP-06
- [ ] `web/src/components/canvassing/map/AddressSearch.test.tsx` -- covers MAP-09
- [ ] `web/src/components/canvassing/map/OverlapHighlight.test.tsx` -- covers MAP-10
- [ ] `web/src/components/canvassing/map/MapProvider.test.tsx` -- covers MAP-11
- [ ] Mock setup for Leaflet in happy-dom (Leaflet requires DOM APIs that happy-dom may not fully support -- may need `vi.mock("leaflet")` and `vi.mock("react-leaflet")`)

### Test Challenges for Map Components
Map components are inherently difficult to unit test because Leaflet requires a real DOM with CSS layout. The recommended approach:

1. **Mock Leaflet and react-leaflet** for component-level tests (verify props/callbacks, not map rendering)
2. **Test GeoJSON logic separately** in pure function tests (import/export, coordinate handling, validation)
3. **Use Playwright E2E tests** for actual map interaction testing (Phase 46 scope)

## Open Questions

1. **Voters by turf endpoint design**
   - What we know: Need to fetch voter lat/lng within a turf boundary for map markers (MAP-04). No existing endpoint.
   - What's unclear: Should this be a new `/turfs/{turf_id}/voters` endpoint or a filter parameter on the existing voters search endpoint?
   - Recommendation: New dedicated endpoint returning lightweight `VoterLocationResponse` (id, lat, lng, name only). Avoids polluting the full voter search with spatial concerns.

2. **Overlap detection: server-side vs client-side**
   - What we know: PostGIS `ST_Intersects` is more accurate. Client-side Turf.js would avoid a network round-trip.
   - What's unclear: How responsive does overlap feedback need to be during drawing?
   - Recommendation: Server-side `ST_Intersects` via a dedicated endpoint, called after polygon draw completes (not during). Debounce 500ms. More accurate and no extra dependency.

3. **Voter count performance at scale**
   - What we know: Correlated subquery with `ST_Contains` on every turf in the list could be slow with many voters.
   - What's unclear: Actual dataset sizes in production.
   - Recommendation: Start with correlated subquery (D-15). Add a materialized `voter_count` column or cache if performance degrades. Seed data has 50 voters -- sufficient for initial development.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| react-leaflet | Map rendering | Yes | 5.0.0 | -- |
| leaflet | Map rendering | Yes | 1.9.4 | -- |
| PostGIS | Spatial queries | Yes | (via Docker) | -- |
| Nominatim API | Geocoding (MAP-09) | Yes (external) | -- | -- |
| Esri World Imagery tiles | Satellite view (MAP-11) | Yes (external) | -- | Other free satellite tile providers |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

## Sources

### Primary (HIGH confidence)
- [Geoman official Vite integration guide](https://geoman.io/blog/using-geoman-with-vite) -- createControlComponent pattern
- [react-leaflet-cluster npm](https://www.npmjs.com/package/react-leaflet-cluster) -- version 4.0.0, peer deps verified
- [react-leaflet-cluster API docs](https://akursat.gitbook.io/marker-cluster/api) -- full props/events reference
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) -- rate limits and prohibited uses
- Existing codebase: `app/services/turf.py`, `app/api/v1/turfs.py`, `web/src/components/canvassing/TurfForm.tsx`

### Secondary (MEDIUM confidence)
- [Geoman GitHub](https://github.com/geoman-io/leaflet-geoman) -- react-leaflet integration discussion #860
- npm registry version checks (verified 2026-03-24): geoman 2.19.2, react-leaflet-cluster 4.0.0

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- packages verified on npm, peer deps confirmed compatible
- Architecture: HIGH -- patterns from official docs and existing codebase conventions
- Pitfalls: HIGH -- well-documented Leaflet/react-leaflet gotchas, verified via multiple sources

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable ecosystem, no major releases expected)
