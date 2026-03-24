# Features Research: v1.5 — Map-Based Turf Editor & Organization-Level UI

**Domain:** Political field operations platform
**Researched:** 2026-03-24
**Overall confidence:** MEDIUM-HIGH (based on domain expertise with VAN/VoteBuilder, EveryAction, PDI, Organizer, Reach patterns; web search unavailable to verify latest 2026 competitor changes)

---

## Map-Based Turf Editor

### Existing Foundation

The codebase already has:
- `Turf` model with PostGIS `POLYGON` boundary (SRID 4326, spatial index)
- `TurfService` with full CRUD, GeoJSON validation via Shapely, `ST_Contains` voter queries
- `TurfStatus` enum: DRAFT -> ACTIVE -> COMPLETED with enforced transitions
- `_validate_polygon()` using Shapely for geometry validation (type check, validity check, zero-area check)
- `get_voter_count()` using `ST_Contains` subquery against `Voter.geom`
- `household_key()` and `parse_address_sort_key()` for walk list ordering
- Voter model with `geom` point column (lat/lng already geocoded during import)
- Walk list generation with household clustering and street-name sorting
- `leaflet` ^1.9.4 and `react-leaflet` ^5.0.0 in package.json (installed, not yet used in any component)
- Current UI: raw JSON textarea for GeoJSON input (`TurfForm.tsx` -- `<Textarea id="boundary" rows={6}>`)

### Table Stakes (must have for go-live)

These are features every turf management tool in the political space provides. Without them, the product is unusable compared to VAN's turf cutter.

| Feature | Why Expected | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| **Interactive polygon draw** | Core purpose of replacing raw JSON textarea. User clicks points on map to draw a polygon boundary. VAN, PDI, Organizer all provide map-based drawing. No campaign manager will paste raw GeoJSON. | Medium | Install `@geoman-io/leaflet-geoman-free` (MIT). Create `useGeoman` hook wrapping `useMap()`. leaflet-draw is effectively abandoned since 2020; Geoman is actively maintained with better touch support. |
| **Vertex editing** | After drawing, user must drag vertices to adjust the boundary. Standard in every GIS editor. VAN allows this; it is the primary turf refinement workflow. | Low | Comes free with Geoman's edit mode (`pm:enableEdit()`). No backend changes -- existing `TurfUpdate` schema accepts new boundary dict. |
| **Map tile base layer** | Display a street-level map as context for drawing. Without it, users draw blind polygons over a white void. | Low | react-leaflet `TileLayer` with OpenStreetMap tiles (free, no API key needed). Default zoom to campaign jurisdiction coordinates. |
| **Render saved turfs on map** | Campaign's existing turfs displayed as colored polygons on an overview map. This is how VAN/EveryAction present turf inventory -- color-coded by status. Without it, users have no spatial context for where their turfs are. | Medium | New `TurfMap` component rendering `GeoJSON` layers per turf. Backend already returns boundary as GeoJSON dict in `TurfResponse`. Need a batch endpoint (`GET /turfs/geojson` returning FeatureCollection) to avoid N+1 requests. |
| **Turf overview map page** | A dedicated page showing all turfs for the campaign on one map, color-coded by status (DRAFT=gray, ACTIVE=blue, COMPLETED=green). Replaces the current table-only turf list as the primary view. | Medium | New route component at `/campaigns/{id}/canvassing/map`. Combine turf list data with `TurfMap` rendering. Turf list table should still exist alongside for users who prefer list view. |
| **Voter dots within selected turf** | When viewing/editing a single turf, show voter locations as point markers on the map. Critical for verifying turf coverage and density. VAN shows voter pins inside turf boundaries. | Medium | New backend endpoint: `GET /turfs/{id}/voters/points` returning simplified `[{lat, lng, name}]` array (not full voter objects). Frontend: use `react-leaflet-cluster` (or `leaflet.markercluster`) for performance -- turfs can have 500-2000 voters. Only load voter points when a single turf is selected. |
| **Voter count badge** | Display voter count for each turf on the map popup and in the list view. Backend `get_voter_count()` already exists. This is the primary feedback mechanism for turf sizing -- campaign managers aim for 50-150 doors per turf. | Low | Wire existing `TurfService.get_voter_count()` into `TurfResponse` (add `voter_count` field). Compute during list queries via lateral join or batch subquery. Display in turf popup tooltip and list table column. |
| **GeoJSON file import** | Upload a .geojson file to create a turf boundary. Campaigns commonly receive precinct/district shapes from county GIS offices as GeoJSON. VAN and PDI both support boundary file import. | Medium | Client-side: file upload component, parse JSON, validate geometry type, preview on map before submit. Must handle `FeatureCollection` (extract first Polygon feature) and `Feature` (unwrap to Geometry). Server-side: existing `TurfCreate` endpoint handles the validated GeoJSON -- no backend changes. |
| **GeoJSON export** | Download a turf boundary as a .geojson file. Needed for sharing with GIS tools, other platforms, or county officials. | Low | Pure client-side: `JSON.stringify(boundary)` -> Blob -> download link. Wrap in proper Feature with properties (turf name, status). Zero backend work. |
| **Turf name/status labels on map** | Popup or tooltip showing turf name, status, voter count, and assignee when clicking/hovering a polygon on the overview map. | Low | Leaflet popup/tooltip bound to each GeoJSON feature layer via `onEachFeature` callback. |
| **Tablet-responsive map** | Map must work on tablets (iPad) -- campaign managers commonly do turf work on tablets during planning meetings. Not phone-sized; this is an admin function, not field volunteer. | Low | Leaflet is responsive by default. Ensure touch-drag and pinch-zoom work. Test Geoman draw interaction on touch -- Geoman has explicit touch support. |
| **Preserve JSON editor as fallback** | Keep the existing raw GeoJSON textarea as an "Advanced" toggle on the turf editor. Power users and developers paste GeoJSON from external tools. | Low | Existing `TurfForm.tsx` stays. Add a toggle: "Draw on Map" (default) vs "Paste GeoJSON" (advanced). Both produce the same `boundary` dict for submission. |

### Differentiators (nice to have, defer if time-constrained)

These separate professional tools from basic ones. VAN has most of these; smaller tools like Reach do not.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Turf splitting** | Draw a line across an existing turf to split it into two child turfs. VAN supports this for precinct subdivision when a turf is too large. | High | Backend: Shapely `split()` with `LineString` geometry, transaction creating 2 new turfs and soft-deleting original. Frontend: Geoman line-draw mode. Edge cases: line must fully bisect polygon, handle resulting MultiPolygon from imprecise cuts, reassign walk lists. |
| **Overlap detection/warning** | Warn when a new turf overlaps an existing active turf (double-canvassing risk). | Medium | Backend: `ST_Intersects` query against existing active turfs during create/update. Return warning (not block) since some overlap is intentional at turf edges. Frontend: highlight overlapping area in red. |
| **Address geocoding search** | Type an address to center/zoom the map. Campaign managers think in addresses ("Center on City Hall"), not lat/lng. | Low-Medium | Nominatim (free OSM geocoder, no API key) or Mapbox Geocoding API. Search box above map. Low complexity but introduces external API dependency. |
| **Turf assignment to canvasser** | Assign a canvasser/volunteer directly from the turf map popup, with a member picker. VAN shows assigned canvasser on the turf. | Medium | Currently assignment happens through walk list generation (turf -> walk list -> assign canvasser). Direct turf assignment could add `assigned_to` FK on Turf model or a `TurfAssignment` junction table. Walk list generation is the functional equivalent for launch. |
| **Census/precinct boundary overlay** | Display census tract, voting precinct, or county boundaries as semi-transparent reference layers that users can snap turfs to. | High | Requires sourcing TIGER/Line shapefiles or state precinct boundary data, storing as reference layers, rendering as additional GeoJSON layers. Major data pipeline. Defer to post-launch. |
| **Multi-polygon support** | Turf boundaries with holes (excluding a park) or multiple disjoint pieces (both sides of a highway). | Medium | Backend `_validate_polygon()` currently rejects non-Polygon types. Would need to accept `MultiPolygon`. Geoman supports polygon hole cutting natively. |
| **Satellite/aerial imagery toggle** | Switch between street map and satellite view. Useful for identifying physical barriers (rivers, highways, railroad tracks) that affect canvassing routes. | Low | Add ESRI World Imagery tile layer as secondary option. No API key needed for ESRI tiles. Or Mapbox Satellite (requires key). |
| **Turf print/PDF export** | Print a turf map with boundary, voter dots, and address list for canvassers who want paper backup. | Medium | html2canvas or Leaflet print plugin. Niche but some campaigns still use paper as fallback. |
| **Undo/redo during draw** | Undo last vertex while drawing a polygon. | Low | Geoman supports this natively via Ctrl+Z keyboard shortcut and programmatic API. Just needs documentation/tooltip. |
| **Turf merge** | Combine two adjacent turfs into one. Inverse of splitting. | High | Backend: Shapely `unary_union()`. Must handle non-adjacent turfs (reject), walk list reassignment. |

### Anti-Features (don't build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Real-time collaborative editing** | CRDT/OT for geometry editing is extremely complex. Near-zero demand -- turf cutting is a planning activity done by 1-2 people, not collaborative like a Google Doc. VAN does not have this. | Optimistic locking via `updated_at` timestamp. Show "This turf was modified by someone else" warning on save conflict. |
| **Custom map style builder** | Campaign branding on map tiles serves no operational purpose. Design time for zero value. | Ship with OSM default tiles. Satellite toggle at most. |
| **Street-level routing within turf** | Walking route optimization (Traveling Salesman Problem) is a separate, hard problem. MiniVAN delegates to Google Maps. CivicPulse already has Google Maps walking direction links in v1.4. | Continue using Google Maps navigation links from field mode. Walk list ordering by street name + house number is the sequencing mechanism. |
| **3D terrain/building rendering** | No campaign operational use case. WebGL complexity for zero value. | Flat 2D map is correct for turf management. |
| **Freehand polygon drawing** | Produces messy, self-intersecting polygons with hundreds of excess vertices. Every professional GIS tool uses click-to-place for a reason. Shapely will reject most freehand polygons as invalid. | Use Geoman's standard polygon draw (click vertices, double-click to close). Provides clean, valid polygons. |
| **Auto-turf generation** | Automatically dividing a campaign district into equal-sized turfs (by voter count or area). Sounds useful but produces terrible results without human judgment about natural boundaries (streets, rivers, neighborhoods, safety concerns). VAN does not auto-generate turfs. | Let users draw manually. Provide voter count feedback in real-time so they can balance by hand. Suggest in docs: "Aim for 50-150 doors per turf." |
| **Shapefile (.shp) import** | Shapefiles are a multi-file format (.shp + .shx + .dbf + .prj minimum) requiring complex server-side parsing with GDAL/OGR. GeoJSON is the modern standard and every GIS tool can export to it. | Support GeoJSON import only. Document the conversion: "Use mapshaper.org or QGIS to convert .shp to .geojson before uploading." |
| **KML/KMZ import** | Google Earth format. Less common than GeoJSON in political data, adds parsing complexity. | GeoJSON only. Users can convert KML to GeoJSON with free tools. |

### Notes on Complexity

**Drawing library choice:** Use `@geoman-io/leaflet-geoman-free` (MIT license) over `leaflet-draw`.
- leaflet-draw: last meaningful release ~2020, open issues with Leaflet 1.9+, no active maintainer
- Geoman Free: actively maintained (releases in 2025), better touch/mobile support, built-in vertex editing/snapping/polygon cutting, MIT license
- No official `react-leaflet-geoman` wrapper exists -- create a `useGeoman` hook that:
  1. Gets map instance via react-leaflet's `useMap()`
  2. Calls `map.pm.addControls()` to add draw toolbar
  3. Listens for `pm:create`, `pm:edit`, `pm:remove` events
  4. Converts drawn layer to GeoJSON via `layer.toGeoJSON()`
  5. Passes GeoJSON to form state

**Performance considerations:**
- Rendering 50+ turf polygons: no issue for Leaflet (handles thousands of features)
- Voter point markers at 500-2000 per turf: MUST use marker clustering (`leaflet.markercluster`). Without clustering, 1000+ DOM elements causes jank on mid-range devices.
- Lazy-load voter points only when viewing a single turf, never on overview map
- For overview map with 100+ turfs, consider `ST_Simplify(boundary, tolerance)` server-side to reduce coordinate count at zoom levels where full precision is not needed

**Backend additions needed:**
1. `GET /campaigns/{id}/turfs/geojson` -- returns GeoJSON FeatureCollection of all turfs with properties (id, name, status, voter_count). Single request replaces N turf fetches for map rendering.
2. `GET /campaigns/{id}/turfs/{id}/voters/points` -- returns `[{lat, lng, voter_id, name}]` array. Lightweight projection -- not full voter objects. Filter to voters where `geom IS NOT NULL`.
3. Add `voter_count` to `TurfResponse` schema -- compute during list queries via subquery `SELECT COUNT(*) FROM voters WHERE ST_Contains(turf.boundary, voter.geom)` as a lateral join.

**Frontend additions needed:**
1. `TurfMap` component -- renders all turfs on Leaflet map with color-coded polygons
2. `TurfDrawer` component -- Geoman-powered polygon draw/edit with `useGeoman` hook
3. `TurfEditor` page -- map-based create/edit replacing TurfForm as default, with "Advanced" JSON toggle
4. `GeoJSONImport` dialog -- file upload, parse, validate, preview polygon on map before submit
5. `VoterMarkers` component -- clustered voter point markers within selected turf
6. `TurfOverviewPage` -- new route at `/campaigns/{id}/canvassing/map`

**Leaflet CSS requirement:** Leaflet requires its CSS file imported globally (`leaflet/dist/leaflet.css`). Add to `index.html` or app root. Missing CSS causes invisible tiles -- a common gotcha.

---

## Organization-Level UI

### Existing Foundation

The codebase already has:
- `Organization` model: `id`, `zitadel_org_id`, `zitadel_project_grant_id`, `name`, `created_by`
- `Campaign.organization_id` FK (nullable) linking campaigns to orgs
- `Campaign.zitadel_org_id` on every campaign
- `CampaignService.create_campaign()` supports `organization_id` param to reuse existing org
- Compensating transaction pattern: new org creation rolls back on DB failure; existing org reuse revokes grant on failure
- `ZitadelService` with: `create_organization()`, `deactivate_organization()`, `delete_organization()`, `assign_project_role()`, `remove_project_role()`, `remove_all_project_roles()`, `create_project_grant()`, `ensure_project_grant()`
- `CampaignRole` enum: VIEWER(0), VOLUNTEER(1), MANAGER(2), ADMIN(3), OWNER(4)
- `CampaignMember` table: `(user_id, campaign_id, role)`
- Role resolution in `resolve_campaign_role()` via campaign_member lookup
- `RequireRole` component and `usePermissions` hook for frontend gating
- Campaign list page shows all campaigns user can see (no org grouping)
- Campaign settings page with edit/delete/ownership-transfer

### Table Stakes (must have for go-live)

What every multi-campaign political platform provides at the organization level. Without these, orgs running multiple campaigns (party committees, PACs, consulting firms, multi-race candidates) cannot manage their operations.

| Feature | Why Expected | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| **Organization dashboard** | Org admins need a single page showing all campaigns in their org with status, election date, and member counts. Currently campaigns are a flat list with no org context. VAN's "Committee Admin" view provides exactly this. | Medium | New route: `/org` (or `/organizations/{id}` if multi-org). Backend: `GET /organizations/{id}/campaigns` (filter existing `list_campaigns` by `organization_id`). Frontend: card grid grouped by status (active/suspended/archived). |
| **Campaign creation gated to org admin** | Currently any authenticated user can create a campaign. For orgs managing multiple races, only org admins should create campaigns. Prevents unauthorized campaign creation. This is standard in VAN (only committee admins create committees). | Medium | Requires org-level roles (see below). Backend: check org-level role in `create_campaign` endpoint. Frontend: conditionally show "New Campaign" button based on org role. |
| **Org member directory** | List all users who have access to any campaign in the org, with their roles per campaign. Org admin needs a single view of "who has access to what." VAN's committee admin view shows this. | Medium | New endpoint: `GET /organizations/{id}/members` -- aggregate `CampaignMember` records grouped by `user_id` across all campaigns with `organization_id = X`. Returns `[{user_id, display_name, email, campaigns: [{campaign_name, role}]}]`. Join through `campaigns.organization_id -> campaign_members`. |
| **Org-level role model** | Two org-level roles: `org_owner` (full control, can delete org) and `org_admin` (manage campaigns and members, cannot delete org). Distinct from per-campaign roles. Required for campaign creation gating and org member management. | High | New `OrganizationMember` model/table: `(user_id, organization_id, role)`. Migration to create table and seed org_owner for existing org creators. Auth middleware update: effective_role = max(org_role_equivalent, campaign_role). `org_owner` maps to OWNER in all campaigns; `org_admin` maps to ADMIN in all campaigns. |
| **Org-level role resolution in auth** | Auth middleware must check both `CampaignMember.role` AND `OrganizationMember.role`, taking the higher privilege. An org_admin should automatically have ADMIN access in every campaign under their org without explicit per-campaign membership. | High | Modify `resolve_campaign_role()`: (1) check campaign_members for explicit role, (2) if not found or lower, check organization_members for the campaign's org, (3) return max. Must not break existing campaign-level role checks. |
| **Cross-campaign member visibility** | Org admin can see which campaigns each person belongs to and their role in each. Table view: rows = members, columns = campaigns. Essential for orgs running 5+ races. | Medium | Builds directly on org member directory endpoint. Frontend: matrix/table view. Low additional complexity once directory endpoint exists. |
| **Add existing member to campaign** | Org admin can assign an org member to a new campaign with a specific role directly, without sending a new invite email. The person is already in the ZITADEL org. | Medium | Extend member management: if user already exists in the org (check `OrganizationMember` or any `CampaignMember` in the org), create `CampaignMember` directly + assign ZITADEL role. Skip invite email flow. |
| **Org settings page** | View/edit org name. Read-only display of ZITADEL org ID. Placeholder sections for future features. | Low | Simple form page. New `PATCH /organizations/{id}` endpoint (update name). Only org_owner can edit. |
| **Campaign creation wizard** | Multi-step form for creating a campaign within the org. Step 1: name, type, jurisdiction, election date, candidate. Step 2: confirm org association. Step 3: invite initial team (optional, can skip). Better than current single-page form. | Medium | Multi-step form using shadcn components or custom stepper. Calls existing `create_campaign` with `organization_id`. Step 3 reuses existing invite flow. |

### Differentiators (nice to have)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multi-org membership** | A user belongs to multiple orgs (consultant managing campaigns for different clients). Org switcher in UI header. | Medium | ZITADEL already supports multi-org via project grants per org. Frontend: org selector dropdown in sidebar/header. Backend: scope all queries by selected org. Cookie or URL param for active org. |
| **Org-level dashboards** | Aggregate canvassing/phone banking/volunteer metrics across all campaigns. "How is the party committee doing overall?" | Medium | Roll up existing per-campaign dashboard queries with org-level grouping. Sum doors knocked, calls made, volunteers active across campaigns. |
| **Campaign archival workflow** | Org admin archives completed campaigns post-election. Archived campaigns become read-only but data is preserved for reporting. | Low | Campaign model already has `ARCHIVED` status with valid transition from ACTIVE. Just need a UI button on the org dashboard campaign card and enforce read-only in API middleware for archived campaigns. |
| **Org invite link** | Shareable URL that adds a user to the org (not a specific campaign). User joins org, then org admin assigns to campaigns. | Low-Medium | Similar to existing campaign invite flow but creates `OrganizationMember` instead of `CampaignMember`. |
| **Billing/subscription placeholder** | Org-level page showing plan tier, usage (campaigns, voters imported, members). "Contact us to upgrade" button. | Low | Static page with calculated usage metrics. No actual billing integration -- FEC compliance for campaign payments is extremely complex (explicitly out of scope in PROJECT.md). |
| **Org activity feed** | Timeline of recent actions across all campaigns: members joined, turfs created, imports completed. | Medium | Requires audit log infrastructure (event table or structured log query). Useful for oversight but not critical for launch. |
| **Remove member from all campaigns** | One-click to remove a person from every campaign in the org. For when staff leaves. | Low-Medium | Backend: query all `CampaignMember` records for user in org's campaigns, delete all, revoke all ZITADEL grants. Existing `remove_all_project_roles()` handles ZITADEL side. |
| **Transfer campaign between orgs** | Move a campaign from one org to another. Rare but needed when consulting firms hand off to candidate's own org. | High | Complex: change `organization_id`, `zitadel_org_id`, migrate all ZITADEL grants. Many edge cases. Defer. |

### Anti-Features (don't build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Org-level voter database** | Sharing voter data across campaigns within an org is a legal and compliance minefield. Different campaigns have different data vendor agreements (L2, TargetSmart, etc.) with restrictions on data sharing. VAN strictly isolates voter files per committee. | Keep voter data campaign-scoped with RLS. If an org wants the same voters in multiple campaigns, they import the same vendor file into each. Clean separation is a feature, not a bug. |
| **Hierarchical org structure** | Nested orgs (national -> state -> county -> local). Only national party committees need this, and they use VAN. Massive complexity (tree queries, permission inheritance, UI for nested navigation). | Flat org model. One level: org -> campaigns. Sufficient for 99% of users. |
| **Custom permission builder** | Drag-and-drop RBAC with fine-grained feature flags per role. Enterprise bloat that campaigns do not need. | Fixed role hierarchy: 5 campaign roles + 2 org roles = 7 total. Simple, predictable, documented. |
| **SSO/SAML configuration per org** | Per-org identity provider setup. Only large enterprises need this. | ZITADEL handles SSO at the instance level. Organizations inherit the instance's IDP configuration. Do not expose IDP config in the app UI. |
| **Audit log viewer UI** | Full searchable audit trail of every action. Compliance requirement for enterprises, not political campaigns. | Log actions server-side via structlog (already planned for v1.5 observability). Build UI only if users specifically request it. |
| **Org-level data export** | Export all org data as a single archive. Data portability concern. | Per-campaign CSV exports are sufficient. GeoJSON export for turfs. No need for a "download everything" feature. |
| **Real-time notifications/inbox** | In-app notification system for org events (member joined, campaign created). | Not needed for launch. Campaign communication happens via external tools (Signal, Slack, email). If needed later, SSE (already in architecture constraints) would suffice. |
| **White-label / custom branding per org** | Custom logos, colors, domain names per org. Consulting firms want this for client-facing deployments. | Single brand. If white-label demand emerges, it is a separate product initiative, not a v1.5 feature. |

### Notes on Complexity

**Org-level role model design -- the critical path:**

This is the highest-complexity, highest-risk item in v1.5. The current system has roles only at the campaign level (`CampaignMember.role`). Adding org-level roles requires careful design to avoid breaking existing authorization.

1. **New `OrganizationMember` table:**
   ```sql
   CREATE TABLE organization_members (
     user_id TEXT REFERENCES users(id),
     organization_id UUID REFERENCES organizations(id),
     role VARCHAR(50) NOT NULL,  -- 'org_owner' or 'org_admin'
     created_at TIMESTAMPTZ DEFAULT now(),
     PRIMARY KEY (user_id, organization_id)
   );
   ```

2. **Migration to seed existing data:** For each `Organization`, the `created_by` user becomes `org_owner`.

3. **Auth middleware update (`resolve_campaign_role`):**
   ```python
   # Current: only checks campaign_members
   # New: check campaign_members THEN check organization_members
   # Return max(campaign_role, org_role_equivalent)

   ORG_ROLE_MAPPING = {
       "org_owner": CampaignRole.OWNER,
       "org_admin": CampaignRole.ADMIN,
   }
   ```

   The org role check requires joining through `campaigns.organization_id` to find the org, then checking `organization_members` for the user + org combo. This adds one additional DB query to every authenticated request for users without a direct `CampaignMember` record. Optimize with a single query joining both tables.

4. **ZITADEL role mapping:** Use distinct role keys: `org_owner`, `org_admin` for org-level. Existing `owner`, `admin`, `manager`, `volunteer`, `viewer` remain for campaign-level. The `assign_project_role` method already supports arbitrary role keys.

5. **Backward compatibility:** Users with existing `CampaignMember` records continue to work unchanged. Org-level roles are additive -- they only elevate, never restrict. A user with `volunteer` campaign role and `org_admin` org role gets effective `ADMIN` for that campaign.

**ZITADEL integration notes:**
- Listing org members: Use local DB (`OrganizationMember` + `CampaignMember` aggregate) rather than ZITADEL API. Faster, no external dependency for read operations.
- ZITADEL's `x-zitadel-orgid` header scoping is already used in existing service methods. Org member operations will follow the same pattern.
- When adding a user to the org, create both `OrganizationMember` record AND assign ZITADEL project role (matching compensating transaction pattern from campaign creation).

**Recommended frontend routing (v1.5 -- single-org, no org switcher):**
```
/org                        -- org dashboard: campaign card grid
/org/members                -- member directory: users x campaigns matrix
/org/settings               -- org name, ZITADEL org ID (read-only)
/org/campaigns/new          -- campaign creation wizard
/campaigns/{campaignId}/... -- existing campaign routes (unchanged)
```

This avoids multi-org URL complexity while establishing the pattern. If multi-org is added later, these become `/organizations/{orgId}/...` with an org switcher.

---

## Feature Dependencies

```
Map-Based Turf Editor (independent of Org UI -- can build in parallel):
  @geoman-io/leaflet-geoman-free  -->  install npm package
  Leaflet CSS import               -->  add to index.html (REQUIRED, common gotcha)
  TurfMap component                -->  renders GeoJSON layers
  useGeoman hook                   -->  wraps map.pm for draw/edit
  TurfDrawer component             -->  useGeoman + form state integration
  TurfEditor page                  -->  replaces TurfForm as default
  GET /turfs/geojson endpoint      -->  batch turf loading for overview map
  TurfOverviewPage                 -->  new route for map view
  GET /turfs/{id}/voters/points    -->  voter dots on single-turf view
  VoterMarkers (clustered)         -->  requires leaflet.markercluster
  GeoJSONImport dialog             -->  client-side parse + preview
  voter_count in TurfResponse      -->  lateral join in list query

Organization-Level UI:
  OrganizationMember table + migration  -->  FOUNDATION (do first)
  Seed migration (created_by -> org_owner)  -->  depends on table creation
  Auth middleware update (resolve_campaign_role)  -->  depends on OrganizationMember table
  GET /organizations/{id} endpoint  -->  simple, low risk
  GET /organizations/{id}/campaigns  -->  filter existing list_campaigns
  GET /organizations/{id}/members  -->  aggregate CampaignMember across org
  PATCH /organizations/{id}  -->  update org name
  Org dashboard page (/org)  -->  depends on campaigns + members endpoints
  Org member directory (/org/members)  -->  depends on members endpoint
  Org settings page (/org/settings)  -->  depends on GET/PATCH org endpoints
  Campaign creation gating  -->  depends on auth middleware update
  Campaign creation wizard  -->  depends on creation gating + existing create_campaign
  Add member to campaign from org  -->  depends on member directory

Cross-Feature:
  Auth middleware changes affect ALL existing features (org roles cascade)
  Turf editor is fully independent -- safe to build in parallel
```

## MVP Recommendation

### Phase 1: Map-Based Turf Editor (self-contained, high visibility, no auth risk)

Build first. Independent of org changes. Immediately visible improvement over JSON textarea.

1. Interactive polygon draw + vertex editing (Geoman)
2. Render saved turfs on overview map (color-coded by status)
3. Voter dots within selected turf (clustered markers)
4. GeoJSON file import with preview
5. GeoJSON export (client-side)
6. Voter count badge (wire existing backend method)
7. Preserve JSON editor as "Advanced" mode toggle

### Phase 2: Organization Data Model (careful, affects auth)

Build second. Foundation for all org UI features. Must not break existing flows.

1. `OrganizationMember` table + seed migration
2. Org-level role resolution in auth middleware (with thorough testing)
3. Backend endpoints: `GET/PATCH /organizations/{id}`, `GET /organizations/{id}/members`, `GET /organizations/{id}/campaigns`

### Phase 3: Organization UI (depends on Phase 2)

4. Org dashboard with campaign card grid
5. Campaign creation gating (org_admin+ only)
6. Campaign creation wizard (multi-step)
7. Org member directory with cross-campaign role matrix
8. Org settings page
9. Add member to campaign from org level

### Defer to Post-v1.5

- Turf splitting (High complexity, niche use case)
- Multi-org membership / org switcher
- Overlap detection
- Census/precinct boundary overlay
- Org-level dashboards
- Billing placeholder
- Org activity feed
- Address geocoding search

## Sources

- Direct codebase analysis: `app/models/turf.py`, `app/services/turf.py`, `app/models/organization.py`, `app/models/campaign.py`, `app/services/campaign.py`, `app/services/zitadel.py`, `app/core/security.py`, `web/src/components/canvassing/TurfForm.tsx`, `web/package.json`
- Domain knowledge: VAN/VoteBuilder turf cutter, EveryAction committee admin, PDI canvassing, Organizer field tools, MiniVAN mobile app
- Leaflet ecosystem: Geoman vs leaflet-draw maintenance status and feature comparison
- ZITADEL organization model: project grants, org-scoped role assignment, `x-zitadel-orgid` header scoping

**Confidence assessment:**
| Area | Level | Reason |
|------|-------|--------|
| Turf editor table stakes | HIGH | Well-understood domain, clear codebase gaps, standard GIS patterns |
| Geoman library choice | MEDIUM-HIGH | Based on GitHub activity and known leaflet-draw abandonment; no live docs verification |
| Org UI table stakes | MEDIUM-HIGH | Standard multi-campaign platform patterns; ZITADEL integration validated by existing code |
| Org role cascading design | MEDIUM | Correct pattern but needs careful implementation/testing; edge cases in auth middleware |
| Competitor feature parity | LOW | No web search available; claims based on training data, may not reflect 2026 product changes |
