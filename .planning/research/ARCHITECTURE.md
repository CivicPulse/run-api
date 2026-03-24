# Architecture Research: v1.5

**Domain:** Map-based turf editor + Organization-level UI integration
**Researched:** 2026-03-24
**Overall confidence:** HIGH (based on thorough codebase analysis)

## Map-Based Turf Editor

### Data Flow (draw -> GeoJSON -> API -> PostGIS -> render)

The complete data flow for the map-based turf editor:

```
User draws polygon on Leaflet map
  |
  v
Leaflet.Draw fires `draw:created` event with L.Layer
  |
  v
layer.toGeoJSON() -> GeoJSON Feature with geometry
  |
  v
Extract geometry object: { type: "Polygon", coordinates: [...] }
  |
  v
TanStack Query mutation (useCreateTurf / useUpdateTurf)
  sends POST/PATCH with { name, boundary: geojsonGeometry }
  |
  v
FastAPI endpoint receives TurfCreate/TurfUpdate schema
  boundary field: dict[str, Any] (already correct)
  |
  v
TurfService._validate_polygon(geojson)
  shapely.geometry.shape(geojson) -> Shapely Polygon
  validates: is Polygon, is_valid, area > 0
  geoalchemy2.shape.from_shape(geom, srid=4326) -> WKBElement
  |
  v
SQLAlchemy stores WKBElement in PostGIS Geometry(POLYGON, 4326) column
  |
  v
On read: _wkb_to_geojson(turf.boundary)
  geoalchemy2.shape.to_shape(wkb) -> Shapely geometry
  shapely.geometry.mapping(geom) -> GeoJSON dict
  |
  v
TurfResponse.boundary = geojson dict
  |
  v
Frontend receives GeoJSON, renders on Leaflet via L.geoJSON(boundary)
```

### Backend Changes Needed

**The serialization layer already works correctly.** This is the key finding: the existing TurfService already handles the full GeoJSON-to-PostGIS round trip.

**What exists and requires NO changes:**

| Component | File | Status |
|-----------|------|--------|
| Turf model with PostGIS Geometry column | `app/models/turf.py` | Complete |
| GeoJSON -> WKBElement validation | `app/services/turf.py:_validate_polygon()` | Complete |
| WKBElement -> GeoJSON serialization | `app/services/turf.py:_wkb_to_geojson()` | Complete |
| Pydantic schemas (boundary: dict[str,Any]) | `app/schemas/turf.py` | Complete |
| CRUD endpoints with proper RLS | `app/api/v1/turfs.py` | Complete |
| `_turf_to_response()` converter | `app/api/v1/turfs.py` | Complete |
| ST_Contains spatial voter queries | `app/services/turf.py:get_voter_count()` | Complete |

**Potential backend enhancement (NEW, not required for MVP):**

1. **Voter count on turf list response** -- `get_voter_count()` exists but is not called in the list or detail endpoints. Add `voter_count` to `TurfResponse` for map UI display:
   - Add `voter_count: int | None = None` to `TurfResponse` schema
   - Call `_service.get_voter_count()` in `get_turf()` endpoint
   - Optional: batch voter counts for list endpoint (N+1 query risk if done naively)

2. **MultiPolygon support** -- Current validation only accepts `Polygon`. For complex districts, consider also accepting `MultiPolygon`. This requires changing `_validate_polygon()` to allow both types and updating the PostGIS column type from `POLYGON` to `GEOMETRY` or `MULTIPOLYGON`. **Defer this** unless user feedback demands it.

3. **GeoJSON Feature vs Geometry** -- Leaflet.Draw's `toGeoJSON()` returns a GeoJSON Feature (with `type: "Feature"`, `geometry: {...}`, `properties: {...}`), not a bare geometry. The frontend must extract `.geometry` before sending to the API. The current schema expects a geometry dict, not a Feature.

### Frontend Component Structure

**Existing components that need MODIFICATION:**

| Component | File | Change |
|-----------|------|--------|
| `TurfForm` | `web/src/components/canvassing/TurfForm.tsx` | Replace raw JSON textarea with Leaflet map + draw controls |
| `NewTurfPage` | `web/src/routes/.../turfs/new.tsx` | Minor: may need layout adjustment for map height |
| `TurfDetailPage` | `web/src/routes/.../turfs/$turfId.tsx` | Add map rendering of existing boundary + edit mode |
| `CanvassingIndex` | `web/src/routes/.../canvassing/index.tsx` | Add overview map showing all turfs as rendered polygons |

**New components to BUILD:**

| Component | Purpose |
|-----------|---------|
| `TurfMap.tsx` | Wrapper around react-leaflet MapContainer with tile layer, configurable center/zoom |
| `TurfDrawControl.tsx` | Leaflet.Draw integration: polygon draw tool, edit tool, delete tool |
| `TurfPolygonLayer.tsx` | Renders a single turf boundary as a GeoJSON layer with click handler |
| `TurfOverviewMap.tsx` | Renders all campaign turfs on a single map, used in canvassing index |

**Dependencies already installed:**

| Package | Version | Status |
|---------|---------|--------|
| `leaflet` | ^1.9.4 | In package.json |
| `react-leaflet` | ^5.0.0 | In package.json |
| `@types/leaflet` | ^1.9.21 | In devDependencies |

**New dependency needed:**

| Package | Purpose | Confidence |
|---------|---------|------------|
| `leaflet-draw` | Draw/edit polygon controls | HIGH |

Note: `leaflet-draw` is the standard Leaflet draw plugin. While `leaflet-geoman` is a newer alternative, `leaflet-draw` is simpler for polygon-only use and has wider community support. Use it directly via react-leaflet's `useMap()` hook rather than through a React wrapper (avoids stale wrapper dependencies with react-leaflet v5).

**Recommended approach: Use leaflet-draw directly via useMap() hook.**

```typescript
// TurfDrawControl.tsx (conceptual)
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import { useEffect } from 'react';

function TurfDrawControl({ onCreated, onEdited }: Props) {
  const map = useMap();

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: { allowIntersections: false, showArea: true },
        polyline: false, rectangle: false, circle: false,
        marker: false, circlemarker: false,
      },
      edit: { featureGroup: drawnItems },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      drawnItems.addLayer(layer);
      const geojson = layer.toGeoJSON();
      onCreated(geojson.geometry); // Extract geometry, not Feature
    });

    return () => { map.removeControl(drawControl); };
  }, [map, onCreated, onEdited]);

  return null;
}
```

### Integration with Existing TanStack Query Patterns

The existing `useTurfs.ts` hooks are already well-structured. Integration points:

**No changes needed to existing hooks.** The mutation functions already accept `TurfCreate` and `TurfUpdate` types with `boundary: Record<string, unknown>` which accepts GeoJSON geometry objects.

**Data flow through existing hooks:**

```
TurfDrawControl fires onCreated(geometry)
  |
  v
TurfForm (modified) stores geometry in form state
  |
  v
onSubmit({ name, description, boundary: geometry })
  |
  v
useCreateTurf.mutate(data) -- existing hook, no changes
  |
  v
api.post('api/v1/campaigns/{id}/turfs', { json: data })
  |
  v
Invalidates ["turfs", campaignId] query key -- existing pattern
  |
  v
useTurfs refetches list, TurfOverviewMap re-renders with new polygon
```

**For the edit flow:**

```
TurfDetailPage loads turf via useTurf(campaignId, turfId)
  |
  v
turf.boundary (GeoJSON dict) -> passed to TurfMap as initial polygon
  |
  v
L.geoJSON(turf.boundary).addTo(drawnItems) on mount
  |
  v
User edits polygon via draw:edited event
  |
  v
useUpdateTurf.mutate({ boundary: editedGeometry })
```

**Leaflet CSS import** -- Must be added to the app entry point or the map component:
```typescript
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
```

**Leaflet marker icon workaround** -- Leaflet's default marker icons break with bundlers (Vite). This is a well-known issue. For polygon-only usage, markers are not needed, but if used:
```typescript
import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});
```

---

## Organization-Level UI

### Auth Flow (Org Admin vs Campaign-Level RLS)

The current auth architecture has a clear separation:

**Current model:**
```
ZITADEL JWT carries:
  - sub: user ID
  - urn:zitadel:iam:user:resourceowner:id: ZITADEL org ID
  - urn:zitadel:iam:org:project:{pid}:roles: { "admin": { "org-id": "domain" } }

Backend resolves:
  1. get_current_user() extracts org_id and role from JWT
  2. require_role() checks campaign_id in path -> resolve_campaign_role()
  3. resolve_campaign_role() checks CampaignMember.role first, falls back to JWT role
  4. set_campaign_context() sets RLS session variable for DB queries
```

**The gap for org-level UI:** The existing `require_role()` dependency resolves roles per-campaign. Org-level endpoints need a different authorization path:

**Org admin must:**
1. See all campaigns belonging to their organization (bypass per-campaign RLS)
2. Manage org members via ZITADEL Management API
3. Create new campaigns under their org
4. NOT bypass RLS when operating within a specific campaign

**Proposed auth extension:**

```python
# New dependency: require_org_role()
# Unlike require_role() which resolves per-campaign,
# this checks org-level authorization.

def require_org_role(minimum: str):
    """Enforce minimum org-level role (from JWT, not per-campaign)."""
    min_level = CampaignRole[minimum.upper()]

    async def _check_org_role(
        request: Request,
        current_user: AuthenticatedUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> AuthenticatedUser:
        # JWT role IS the org-level role (ZITADEL project roles are org-scoped)
        if current_user.role < min_level:
            raise HTTPException(403, "Insufficient permissions")
        return current_user

    return _check_org_role
```

**Key insight:** The JWT role claim IS already the org-level role. ZITADEL project roles are assigned per-org (via project grants). The `resolve_campaign_role()` function resolves a potentially different per-campaign role from `CampaignMember.role`. For org-level endpoints, the JWT role is authoritative -- no additional resolution needed.

**RLS bypass for org admin listing campaigns:**

The org admin needs to list all campaigns for their org. Current RLS is `campaign_id`-scoped, which does not apply to the campaigns table itself (campaigns are not filtered by `app.current_campaign_id` -- they are looked up by Organization or zitadel_org_id). Looking at `list_campaigns()` in `CampaignService`, it already queries campaigns WITHOUT RLS context. So **no RLS bypass is needed** for listing campaigns.

However, the current `list_campaigns()` returns ALL non-deleted campaigns, not filtered by org. This needs filtering:

```python
# New method: list_org_campaigns()
async def list_org_campaigns(
    self,
    db: AsyncSession,
    org_id: str,  # ZITADEL org_id from JWT
    limit: int = 20,
    cursor: str | None = None,
) -> tuple[list[Campaign], PaginationResponse]:
    """List campaigns belonging to the user's organization."""
    org = await db.scalar(
        select(Organization).where(Organization.zitadel_org_id == org_id)
    )
    query = (
        select(Campaign)
        .where(
            Campaign.status != CampaignStatus.DELETED,
            Campaign.organization_id == org.id if org else Campaign.zitadel_org_id == org_id,
        )
        .order_by(Campaign.created_at.desc(), Campaign.id.desc())
    )
    # ... pagination as before
```

### New Backend Routes

**New API module: `app/api/v1/organizations.py`**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/org` | `require_org_role("admin")` | Get current user's organization details |
| GET | `/api/v1/org/campaigns` | `require_org_role("admin")` | List all campaigns in org |
| POST | `/api/v1/org/campaigns` | `require_org_role("admin")` | Create campaign under current org |
| GET | `/api/v1/org/members` | `require_org_role("admin")` | List org members (proxies to ZITADEL) |
| POST | `/api/v1/org/members/{user_id}/role` | `require_org_role("admin")` | Change member's org role via ZITADEL |
| DELETE | `/api/v1/org/members/{user_id}` | `require_org_role("owner")` | Remove member from org via ZITADEL |

**Route design rationale:** Use `/api/v1/org` (singular, no ID) because the org is determined from the JWT's `org_id` claim. The user's current org context is implicit, matching ZITADEL's model where the JWT carries the active org. This avoids exposing org UUIDs in URLs and prevents cross-org access attempts.

**New service: `app/services/organization.py`**

| Method | Purpose |
|--------|---------|
| `get_org_for_user(db, org_id)` | Resolve Organization from zitadel_org_id |
| `list_org_campaigns(db, org_id, ...)` | Campaigns filtered by org |
| `list_org_members(zitadel, org_id)` | Proxy to ZITADEL Management API |
| `change_member_role(zitadel, org_id, user_id, role)` | Update role via ZITADEL |
| `remove_member(zitadel, org_id, user_id)` | Remove from org via ZITADEL |

**ZitadelService additions needed:**

| Method | ZITADEL API | Purpose |
|--------|-------------|---------|
| `list_org_users(org_id)` | `POST /v2/users` with x-zitadel-orgid header | List users belonging to org |
| `list_user_grants(org_id, project_id)` | `POST /management/v1/users/grants/_search` | Get role assignments for org members |

### Frontend Route Structure

**New route tree for org-level pages:**

```
web/src/routes/
  org/
    index.tsx              -- Org dashboard: summary stats, campaign list
    campaigns.tsx          -- Full campaign list for org (admin view)
    members.tsx            -- Org member management
    settings.tsx           -- Org settings (name, etc.)
```

**TanStack Router file-based routing means:**

| File | URL | Purpose |
|------|-----|---------|
| `routes/org/index.tsx` | `/org` | Org dashboard |
| `routes/org/campaigns.tsx` | `/org/campaigns` | Campaign list for org |
| `routes/org/members.tsx` | `/org/members` | Member management |
| `routes/org/settings.tsx` | `/org/settings` | Org settings |

**Sidebar integration:** Add "Organization" group to `__root.tsx` AppSidebar, visible only when user has admin+ role:

```tsx
// In AppSidebar, add new group above the existing "Overview" group:
<RequireRole minimum="admin">
  <SidebarGroup>
    <SidebarGroupLabel>Organization</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={location.pathname.startsWith("/org")}>
            <Link to="/org"><Building2 /><span>Organization</span></Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</RequireRole>
```

**New hooks needed:**

| Hook | File | Purpose |
|------|------|---------|
| `useOrg()` | `hooks/useOrg.ts` | Fetch org details for current user |
| `useOrgCampaigns()` | `hooks/useOrgCampaigns.ts` | List campaigns in org |
| `useOrgMembers()` | `hooks/useOrgMembers.ts` | List/manage org members |

### Integration Points with Existing ZITADEL Auth Middleware

**What already works:**

1. **JWT extraction** -- `get_current_user()` already extracts `org_id` from the JWT (`urn:zitadel:iam:user:resourceowner:id`)
2. **Role extraction** -- `_extract_role()` already reads org-level role from JWT claims
3. **ZitadelService** -- Already has `create_organization()`, `assign_project_role()`, `remove_project_role()`, `create_project_grant()`, `ensure_project_grant()`
4. **Organization model** -- Already exists with `zitadel_org_id` mapping
5. **Campaign.organization_id** -- Already links campaigns to organizations
6. **ensure_user_synced()** -- Already handles the Organization -> Campaign lookup path
7. **CampaignService.create_campaign()** -- Already accepts `organization_id` param to reuse existing org

**What needs to be ADDED to ZitadelService:**

```python
async def list_org_users(self, org_id: str) -> list[dict]:
    """List users belonging to an organization.

    Uses ZITADEL's user search with org context header.
    """
    token = await self._get_token()
    headers = self._auth_headers(token)
    headers["x-zitadel-orgid"] = org_id
    async with httpx.AsyncClient(verify=self._verify_tls) as client:
        response = await client.post(
            f"{self.base_url}/v2/users",
            headers=headers,
            json={"queries": []},  # All users in org context
        )
        response.raise_for_status()
        return response.json().get("result", [])

async def list_user_grants(self, org_id: str, project_id: str) -> list[dict]:
    """List all user grants for a project within an org.

    This tells us which users have which roles.
    """
    token = await self._get_token()
    headers = self._auth_headers(token)
    headers["x-zitadel-orgid"] = org_id
    async with httpx.AsyncClient(verify=self._verify_tls) as client:
        response = await client.post(
            f"{self.base_url}/management/v1/users/grants/_search",
            headers=headers,
            json={"queries": [{"projectIdQuery": {"projectId": project_id}}]},
        )
        response.raise_for_status()
        return response.json().get("result", [])
```

---

## Summary of New vs Modified Components

### Backend -- Modified

| File | Change |
|------|--------|
| `app/api/v1/router.py` | Add `organizations` router include |
| `app/services/zitadel.py` | Add `list_org_users()`, `list_user_grants()` |
| `app/core/security.py` | Add `require_org_role()` dependency factory |
| `app/schemas/turf.py` | Optionally add `voter_count` field |
| `app/api/v1/turfs.py` | Optionally include voter count in detail response |

### Backend -- New

| File | Purpose |
|------|---------|
| `app/api/v1/organizations.py` | Org-level API endpoints |
| `app/services/organization.py` | Org business logic |
| `app/schemas/organization.py` | Org request/response schemas |

### Frontend -- Modified

| File | Change |
|------|--------|
| `web/src/components/canvassing/TurfForm.tsx` | Replace textarea with Leaflet map + draw controls |
| `web/src/routes/.../canvassing/index.tsx` | Add overview map rendering all turfs |
| `web/src/routes/.../turfs/new.tsx` | Layout adjustments for map component |
| `web/src/routes/.../turfs/$turfId.tsx` | Map rendering of existing boundary + edit controls |
| `web/src/routes/__root.tsx` | Add "Organization" sidebar group |

### Frontend -- New

| File | Purpose |
|------|---------|
| `web/src/components/map/TurfMap.tsx` | Base map component with react-leaflet |
| `web/src/components/map/TurfDrawControl.tsx` | Leaflet.Draw polygon tool integration |
| `web/src/components/map/TurfPolygonLayer.tsx` | Single turf GeoJSON rendering |
| `web/src/components/map/TurfOverviewMap.tsx` | All-turfs overview map |
| `web/src/routes/org/index.tsx` | Org dashboard page |
| `web/src/routes/org/campaigns.tsx` | Org campaign list page |
| `web/src/routes/org/members.tsx` | Org member management page |
| `web/src/routes/org/settings.tsx` | Org settings page |
| `web/src/hooks/useOrg.ts` | Org data hooks |
| `web/src/hooks/useOrgCampaigns.ts` | Org campaign hooks |
| `web/src/hooks/useOrgMembers.ts` | Org member hooks |
| `web/src/types/organization.ts` | Org TypeScript types |

---

## Build Order Recommendation

### Phase 1: Map-Based Turf Editor (build FIRST)

**Why first:**
1. The backend serialization layer is already complete -- zero backend changes needed for basic map editor
2. This is purely a frontend feature: replace TurfForm textarea with a Leaflet map
3. No new API routes, no auth changes, no migrations
4. Immediately testable with existing turf data
5. Lower integration risk -- stays within the existing campaign-scoped route tree

**Build sequence within this phase:**
1. Install `leaflet-draw` package (and `@types/leaflet-draw` if available)
2. Create `TurfMap.tsx` base component (MapContainer + TileLayer)
3. Create `TurfDrawControl.tsx` (draw polygon tool)
4. Modify `TurfForm.tsx` to use map instead of textarea
5. Verify create flow works end-to-end (draw -> API -> re-render)
6. Add `TurfPolygonLayer.tsx` for edit page (render existing boundary)
7. Modify `TurfDetailPage` to show boundary on map with edit capability
8. Create `TurfOverviewMap.tsx` for canvassing index page
9. Add Leaflet CSS imports and fix any bundler issues (marker icons)

### Phase 2: Organization-Level UI (build SECOND)

**Why second:**
1. Requires new backend routes, new service layer, and ZitadelService additions
2. Touches the auth middleware (new `require_org_role` dependency)
3. Requires new frontend route tree (`/org/*`)
4. More integration points = more risk of regressions
5. Depends on understanding how ZITADEL Management API responds in production (live testing needed)

**Build sequence within this phase:**
1. Add `require_org_role()` to security module
2. Add `list_org_users()` and `list_user_grants()` to ZitadelService
3. Create `OrganizationService` with `get_org_for_user()`, `list_org_campaigns()`
4. Create org API endpoints (start with GET `/org` and GET `/org/campaigns`)
5. Create frontend types and hooks (`useOrg`, `useOrgCampaigns`)
6. Create `/org` route pages (dashboard first, then campaigns list)
7. Add sidebar "Organization" nav item with RequireRole gate
8. Add member management (GET/POST/DELETE `/org/members/*`)
9. Create member management UI

### Dependency Chain

```
Phase 1 (Map Editor):
  leaflet-draw install
    -> TurfMap component
      -> TurfDrawControl component
        -> TurfForm modification
          -> TurfPolygonLayer component
            -> TurfDetailPage modification
              -> TurfOverviewMap
                -> CanvassingIndex modification

Phase 2 (Org UI):
  require_org_role() security dependency
    -> ZitadelService additions
      -> OrganizationService
        -> Org API endpoints
          -> Frontend hooks
            -> Route pages
              -> Sidebar integration
                -> Member management
```

**No cross-dependencies between phases** -- they can be built independently and in parallel if desired. However, building the map editor first is lower risk and provides immediate user value with minimal code changes.

## Sources

- Codebase analysis: `app/services/turf.py`, `app/api/v1/turfs.py`, `app/schemas/turf.py` (serialization layer)
- Codebase analysis: `app/core/security.py` (auth/role resolution)
- Codebase analysis: `app/api/deps.py` (RLS setup, user sync)
- Codebase analysis: `app/services/zitadel.py` (existing ZITADEL Management API methods)
- Codebase analysis: `app/models/organization.py`, `app/models/campaign.py` (data model)
- Codebase analysis: `web/package.json` (leaflet, react-leaflet already installed)
- Codebase analysis: `web/src/hooks/useTurfs.ts` (existing mutation patterns)
- Training data: Leaflet.Draw API, react-leaflet v5 patterns (MEDIUM confidence -- verify against current docs)
- Training data: ZITADEL Management API v1 endpoints (MEDIUM confidence -- verify against ZITADEL docs)
