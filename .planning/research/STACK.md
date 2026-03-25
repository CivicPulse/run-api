# Stack Research: v1.5 — Map-Based Turf Editor + Organization-Level UI

**Researched:** 2026-03-24
**Overall confidence:** MEDIUM-HIGH (npm registry verified, codebase analysis complete, WebSearch unavailable)

---

## Map-Based Turf Editor

### Current State

The frontend already has `leaflet` 1.9.4 and `react-leaflet` 5.0.0 installed (package.json lines 29-37), with `@types/leaflet` 1.9.21 for TypeScript support. However, **no react-leaflet components exist anywhere in `web/src/`** — MapContainer, TileLayer, etc. are not used yet. The current `TurfForm.tsx` uses a raw `<Textarea>` for GeoJSON input (users paste JSON manually).

The backend is fully ready: `app/services/turf.py` validates GeoJSON with Shapely, converts to/from WKBElement via geoalchemy2, and the API accepts/returns `dict[str, Any]` boundary objects (GeoJSON Polygon format).

### Recommended Library: `@geoman-io/leaflet-geoman-free` v2.19.2

**Install:** `npm install @geoman-io/leaflet-geoman-free`

| Criterion | leaflet-draw 1.0.4 | react-leaflet-draw 0.21.0 | @geoman-io/leaflet-geoman-free 2.19.2 |
|-----------|--------------------|--------------------------|-----------------------------------------|
| Last updated | 2022-06-19 (abandoned) | 2025-09-15 | 2026-02-02 (active) |
| Leaflet 1.9 support | Partial (no updates) | Yes (wraps leaflet-draw) | Yes (peer dep: leaflet ^1.2.0) |
| React 19 / react-leaflet 5 | N/A (vanilla only) | Yes (peer dep matches) | N/A (vanilla, needs wrapper) |
| Polygon editing | Basic draw + edit | Basic (wraps leaflet-draw) | Draw, edit, drag, cut, rotate, snap |
| GeoJSON export | Manual layer conversion | Via leaflet-draw events | Built-in `.toGeoJSON()` on layers |
| Vertex editing UX | Dated controls | Dated (inherits from leaflet-draw) | Modern drag handles, midpoint insertion |
| TypeScript types | @types/leaflet-draw (stale) | Bundled | Bundled |
| Maintenance | Abandoned since 2022 | Thin wrapper over abandoned lib | Active development, regular releases |
| Bundle size | ~50KB | ~55KB (includes leaflet-draw) | ~120KB |

### Why Geoman Over Alternatives

1. **leaflet-draw is abandoned.** Last npm publish was June 2022. Known bugs with Leaflet 1.9 go unfixed. Building on abandoned infrastructure creates tech debt immediately.

2. **react-leaflet-draw is a thin wrapper over leaflet-draw.** It inherits all of leaflet-draw's bugs and limitations. The wrapper adds React-friendly props but does not fix underlying issues.

3. **Geoman is actively maintained** with a release as recent as February 2026. It supports snap-to-vertex (critical for adjacent turf boundaries that share edges), vertex editing with midpoint insertion, and produces clean GeoJSON output.

4. **The "free" version covers all turf editor needs.** Drawing polygons, editing vertices, deleting shapes — all in the free tier. Pro features (split, scale, measurement) are not needed for v1.5.

5. **No react-leaflet wrapper needed.** Geoman attaches to the Leaflet map instance via `map.pm.addControls()`. With react-leaflet v5, access the map instance via `useMap()` hook inside a `MapContainer`, then call Geoman's imperative API in a `useEffect`. This is actually cleaner than the react-leaflet-draw approach because it avoids wrapper abstraction leaks.

### Integration Pattern with react-leaflet + TanStack Query

```typescript
// TurfMapEditor.tsx — component pattern
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"

function GeomanControls({ onBoundaryChange }: { onBoundaryChange: (geojson: GeoJSON) => void }) {
  const map = useMap()

  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawText: false,
      // Only polygon drawing + editing
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
    })

    map.on("pm:create", (e) => {
      const geojson = e.layer.toGeoJSON()
      onBoundaryChange(geojson.geometry)
    })

    map.on("pm:edit", (e) => {
      const geojson = e.layer.toGeoJSON()
      onBoundaryChange(geojson.geometry)
    })

    return () => {
      map.pm.removeControls()
      map.off("pm:create")
      map.off("pm:edit")
    }
  }, [map, onBoundaryChange])

  return null
}
```

**TanStack Query integration:** The existing `useTurfs.ts` hook already handles turf CRUD via TanStack Query. The map editor component produces a GeoJSON object, which replaces the current `<Textarea>` value in `TurfForm.tsx`. The mutation payload shape (`{ name, description, boundary }`) stays identical — only the input method changes from paste-JSON to draw-on-map.

**Rendering existing turfs:** Use react-leaflet's built-in `<GeoJSON>` component to render turf boundaries returned by the list/detail endpoints. The API already returns `boundary` as a GeoJSON dict. No conversion needed.

### Backend Changes Needed: NONE

The backend is fully ready:
- `app/services/turf.py` already validates GeoJSON polygons with Shapely
- `app/schemas/turf.py` accepts `boundary: dict[str, Any]` (GeoJSON)
- `app/api/v1/turfs.py` converts WKB to GeoJSON for responses
- PostGIS stores boundaries as `Geometry(POLYGON, 4326)` with spatial index
- `geoalchemy2` and `shapely` are already installed

No new Python packages, no schema changes, no migration needed.

### Tile Provider

Use OpenStreetMap tiles (free, no API key): `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`

For a more polished look, consider adding `VITE_MAP_TILE_URL` to config for swappable tile providers (Mapbox, Stadia, etc.) later. Not needed for v1.5.

---

## Organization-Level UI

### Current State

**Backend:** Organization model exists (`app/models/organization.py`) with `zitadel_org_id` and `zitadel_project_grant_id`. `ZitadelService` (`app/services/zitadel.py`) already handles:
- `create_organization()` / `delete_organization()` / `deactivate_organization()`
- `assign_project_role()` / `remove_project_role()` / `remove_all_project_roles()`
- `create_project_grant()` / `ensure_project_grant()`

Campaign creation already supports `organization_id` parameter to reuse an existing org.

**Frontend:** Auth uses `oidc-client-ts` 3.1.0 with ZITADEL. The OIDC scope already requests `urn:zitadel:iam:user:resourceowner` (returns user's org ID) and `urn:zitadel:iam:org:projects:roles` (returns roles across all orgs). JWT claims already contain org context.

### ZITADEL SDK Recommendation: DO NOT ADD ONE

**Do not install `@zitadel/client` or `@zitadel/node`.** Here is why:

1. **All ZITADEL org management is server-side.** The existing `ZitadelService` Python class handles org CRUD via ZITADEL's REST Management API using `httpx` with a service account (client_credentials grant). This is the correct pattern — org management requires elevated privileges that must not be exposed to the browser.

2. **The frontend already has org context via JWT claims.** The OIDC token includes `urn:zitadel:iam:user:resourceowner` (the user's org ID) and project role claims scoped by org. No additional SDK is needed to read this data.

3. **`@zitadel/client` is designed for server-side Node.js.** It uses `createServerTransport` with service account tokens. Adding it to a React SPA would expose service credentials.

4. **The frontend needs API endpoints, not an SDK.** The org admin dashboard will call your own FastAPI endpoints (e.g., `GET /api/v1/organizations`, `GET /api/v1/organizations/{id}/campaigns`), which internally call `ZitadelService` methods. This maintains the existing architecture pattern.

### What the Backend Needs

New API endpoints to expose organization data (the model and ZITADEL integration exist, but no org-specific REST routes):

| Endpoint | Purpose | Exists? |
|----------|---------|---------|
| `GET /api/v1/organizations` | List user's organizations | NO — needs new route |
| `GET /api/v1/organizations/{id}` | Org detail with campaigns | NO — needs new route |
| `GET /api/v1/organizations/{id}/members` | Org member list | NO — needs new route |
| `POST /api/v1/organizations/{id}/campaigns` | Create campaign under org | PARTIAL — campaign create exists but org association is a parameter, not a route |
| `GET /api/v1/me/organizations` | Current user's org memberships | NO — needs new route |

These endpoints will call existing `ZitadelService` methods and query the `organizations` table. No new Python packages needed.

**New backend service needed:** `OrganizationService` to handle:
- Listing orgs where user has membership (query ZITADEL grants or local `campaign_members` table grouped by `organization_id`)
- Org admin role checking (extend existing role hierarchy)
- Org-scoped campaign listing

### Frontend Additions Needed

| Addition | Purpose | Complexity |
|----------|---------|------------|
| Org dashboard page (`/organizations/{orgId}`) | Campaigns list, member management | Medium |
| Org switcher component | Multi-org membership navigation | Low |
| `useOrganizations` hook | TanStack Query for org endpoints | Low |
| Org admin gate | Extend `usePermissions` / `RequireRole` for org-level roles | Low |
| Campaign creation update | Org selector when user has multiple orgs | Low |

**No new frontend packages needed.** All UI can be built with existing shadcn/ui components (DataTable, Card, Dialog, Command for org switcher).

### Extending Existing ZITADEL Patterns

The `urn:zitadel:iam:user:resourceowner` claim in the JWT provides the user's primary org. For multi-org support:

1. **JWT already includes `urn:zitadel:iam:org:projects:roles`** — this returns roles across ALL projects/orgs the user has grants for. Parse this in `usePermissions` to determine org-level admin status.

2. **Backend role resolution** (`app/core/security.py` + `app/api/deps.py`) already extracts `sub` and role claims. Extend to also extract the `urn:zitadel:iam:user:resourceowner` claim for org context.

3. **`x-zitadel-orgid` header pattern** is already used in `ZitadelService` for org-scoped API calls. The org UI endpoints will follow this same pattern.

---

## What NOT to Add

| Library | Why Not |
|---------|---------|
| `@zitadel/client` / `@zitadel/node` | All ZITADEL management is server-side via existing Python `ZitadelService` + httpx |
| `leaflet-draw` | Abandoned since 2022, known bugs with Leaflet 1.9 |
| `react-leaflet-draw` | Thin wrapper over abandoned leaflet-draw |
| `mapbox-gl` / `react-map-gl` | Requires Mapbox API key, overkill for polygon editing; Leaflet already installed |
| `@turf/turf` (Turf.js) | Server-side PostGIS handles all spatial queries; no client-side geo computation needed |
| `geojson` npm package | TypeScript GeoJSON types available from `@types/geojson`; no runtime lib needed |
| Any new Python geo packages | `geoalchemy2` + `shapely` already handle all GeoJSON/PostGIS operations |
| Any new auth packages | `oidc-client-ts` (frontend) + `authlib` + `httpx` (backend) cover everything |

---

## Summary of Changes

### New Frontend Dependencies (1 package)

```bash
cd web && npm install @geoman-io/leaflet-geoman-free
```

Optionally for stricter GeoJSON typing:
```bash
cd web && npm install -D @types/geojson
```

### New Backend Dependencies: NONE

### New Backend Code Needed

1. **`app/api/v1/organizations.py`** — New router with org list/detail/member endpoints
2. **`app/services/organization.py`** — New service for org queries (model already exists)
3. **`app/schemas/organization.py`** — New Pydantic schemas for org responses

### Frontend Components to Build

1. **`TurfMapEditor.tsx`** — MapContainer + Geoman controls + GeoJSON render
2. **`TurfMapView.tsx`** — Read-only map with turf boundary overlay (for detail/list views)
3. Update **`TurfForm.tsx`** — Replace `<Textarea>` with `<TurfMapEditor>`
4. **Org dashboard page** — `/organizations/{orgId}` route
5. **Org switcher** — Component in sidebar/header for multi-org navigation
6. **`useOrganizations.ts`** — TanStack Query hooks for org endpoints

### Versions Summary

| Package | Version | Status | Confidence |
|---------|---------|--------|------------|
| `@geoman-io/leaflet-geoman-free` | 2.19.2 | Add new | HIGH (npm verified, Feb 2026 release) |
| `leaflet` | 1.9.4 | Already installed | HIGH |
| `react-leaflet` | 5.0.0 | Already installed | HIGH |
| `@types/leaflet` | 1.9.21 | Already installed | HIGH |
| `@types/geojson` | latest | Optional dev dep for stricter types | MEDIUM |
| `geoalchemy2` | 0.18.4+ | Already installed | HIGH |
| `shapely` | 2.1.2+ | Already installed | HIGH |
| `oidc-client-ts` | 3.1.0 | Already installed, sufficient for org claims | HIGH |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Geoman recommendation | HIGH | npm registry verified (version, dates, peer deps), well-known library, active maintenance |
| leaflet-draw rejection | HIGH | npm confirmed last publish June 2022, 4+ years without updates |
| No ZITADEL JS SDK needed | HIGH | Codebase analysis confirms all ZITADEL calls are backend-side with service account |
| No backend package additions | HIGH | Full codebase review of turf service + ZITADEL service confirms existing deps cover all needs |
| Org API endpoint design | MEDIUM | Endpoint list is based on feature requirements; may need iteration during implementation |
| JWT org claim parsing | MEDIUM | OIDC scopes already request org claims, but multi-org grant structure may need testing against live ZITADEL |

---

*Stack research: 2026-03-24*
