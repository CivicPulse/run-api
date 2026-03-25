# Project Research Summary

**Project:** CivicPulse Run API — v1.5 Go Live milestone
**Domain:** Multi-tenant political field operations platform
**Researched:** 2026-03-24
**Confidence:** HIGH (codebase analysis dominant; no live web search; competitor claims from training data)

## Executive Summary

v1.5 has two user-facing feature tracks — a map-based turf editor and an organization-level admin UI — plus two production-readiness tracks: an active RLS data-leak bug and a WCAG audit of unaudited admin pages. The map editor track is self-contained and low risk: Leaflet and react-leaflet are already installed but unused, the backend already handles the full GeoJSON-to-PostGIS round trip, and the only new dependency is `@geoman-io/leaflet-geoman-free` (npm-verified, actively maintained as of February 2026, chosen over the abandoned `leaflet-draw`). The org UI track touches auth middleware and requires a new `organization_members` table, making it higher risk and the correct second feature priority.

The single highest-urgency item is an active RLS data-isolation bug. All 21 endpoint files use `get_db()` and call `set_campaign_context()` manually, but the context is set with `set_config(..., false)` — session-scoped, not transaction-scoped. SQLAlchemy's connection pool means the prior request's `campaign_id` persists on pooled connections, and any endpoint that draws one without calling `set_campaign_context()` first — including all four invite endpoints — queries against the wrong campaign's data. Additionally, `get_db_with_rls()` exists in `deps.py` but is used by zero of the 21 endpoint files. This is a live multi-tenant data-isolation failure that must be fixed before any new feature work ships to production.

The recommended build order is: RLS fix → production hardening (Sentry, structlog, rate-limiting IP fix) → org data model → map-based turf editor → org UI → WCAG audit. The RLS fix and production hardening are gating concerns for production launch. The two feature tracks are independent of each other and can be developed in parallel against a local environment, but neither should be deployed before the RLS fix is verified in production.

---

## Key Findings

### Recommended Stack

Stack additions for v1.5 are minimal by design. Only one new npm package is required: `@geoman-io/leaflet-geoman-free` v2.19.2 — the actively maintained successor to the abandoned `leaflet-draw` (last npm publish: June 2022). The backend adds zero new Python packages. The ZITADEL JavaScript SDK (`@zitadel/client`) must not be added; all ZITADEL management is backend-only via the existing Python `ZitadelService`.

**Core technologies:**
- `@geoman-io/leaflet-geoman-free` v2.19.2: polygon draw/edit controls — npm-verified, MIT license, last published February 2026; replaces abandoned `leaflet-draw`; attaches to the Leaflet map instance via `map.pm.addControls()` inside a `useMap()` hook, requiring no React wrapper
- `leaflet` 1.9.4 + `react-leaflet` 5.0.0: already installed in `web/package.json`, not yet used in any component — zero installation cost for the map editor feature track
- `geoalchemy2` + `shapely`: already installed; backend turf serialization layer is complete and requires no changes for the map editor
- OpenStreetMap tiles via `TileLayer`: free, no API key, sufficient for v1.5; recommend exposing `VITE_MAP_TILE_URL` env var for future swap to Mapbox or Stadia
- Existing `ZitadelService` (Python + httpx): covers all org CRUD; two new methods needed — `list_org_users(org_id)` and `list_user_grants(org_id, project_id)`

See `.planning/research/STACK.md` for the full draw-library comparison table and Geoman integration pattern.

### Expected Features

**Map editor — must have (table stakes):**
- Interactive polygon draw with vertex editing — replaces the raw JSON `<Textarea>` in `TurfForm.tsx`; no campaign manager will paste raw GeoJSON
- Map tile base layer — required for spatial context; users cannot draw meaningful boundaries over a blank canvas
- Render saved turfs color-coded by status on an overview map — primary spatial management view; equivalent to VAN's turf inventory
- Voter dots within a selected turf with clustered markers — required for verifying coverage density before activating (turfs have 500–2000 voters; unclustered markers cause jank on mid-range devices)
- Voter count badge — wire existing `TurfService.get_voter_count()` into `TurfResponse`; the primary feedback mechanism for turf sizing (target: 50–150 doors)
- GeoJSON file import with map preview — campaigns regularly receive precinct shapes from county GIS offices
- GeoJSON export (client-side, zero backend work)
- Preserve raw JSON textarea as "Advanced" toggle — required escape hatch for developers and power users

**Map editor — should have (differentiators, defer if time-constrained):**
- Address geocoding search via Nominatim (free, no API key) — campaign managers think in addresses, not coordinates
- Overlap detection warning via `ST_Intersects` — prevents double-canvassing at turf boundaries
- Satellite/aerial imagery toggle (ESRI World Imagery, no API key) — identifies physical canvassing barriers

**Map editor — defer to post-v1.5:**
- Turf splitting (high complexity: Shapely `split()`, walk list reassignment, MultiPolygon edge cases)
- Turf merge, multi-polygon support, census/precinct overlays, freehand draw, auto-turf generation

**Org UI — must have (table stakes):**
- Organization dashboard at `/org` — campaign card grid with status, election date, member count
- Org member directory — aggregate view of all users across all campaigns with per-campaign roles
- Org-level role model — new `organization_members` table with `org_owner` and `org_admin` roles; seed migration promotes existing `created_by` users to `org_owner`
- Org-level role resolution in auth middleware — `resolve_campaign_role()` returns max(campaign role, org role equivalent); additive, never restrictive
- Campaign creation gating — only `org_admin`+ can create campaigns within an org
- Campaign creation wizard — multi-step form replacing the current single-page form
- Org settings page — view/edit org name; read-only ZITADEL org ID display

**Org UI — should have (defer if time-constrained):**
- Add existing org member to a campaign directly (skip invite email for known members)
- Campaign archival workflow — UI button for existing `ARCHIVED` status transition
- Multi-org membership and org switcher (ship v1.5 with single-org assumption, add later)

**Anti-features confirmed (do not build):**
- Shared org-level voter database — legal/vendor compliance risk; voter data stays campaign-scoped with RLS
- Real-time collaborative turf editing — CRDT/OT for geometry is extreme complexity; use optimistic locking
- Shapefile or KML import — multi-file format requires GDAL/OGR; GeoJSON only, with conversion docs
- Freehand polygon drawing — produces self-intersecting polygons that Shapely rejects

See `.planning/research/FEATURES.md` for the full feature dependency graph and MVP recommendation.

### Architecture Approach

The map editor is a pure frontend replacement: `TurfForm.tsx` loses its `<Textarea>` and gains a `MapContainer` with Geoman controls. The backend serialization layer (GeoJSON → Shapely → WKBElement → PostGIS and reverse) is complete and requires zero changes for the core map editor. Two new backend endpoints are needed for the map UI: `GET /campaigns/{id}/turfs/geojson` (FeatureCollection for overview map) and `GET /campaigns/{id}/turfs/{id}/voters/points` (lightweight `[{lat, lng, voter_id, name}]` array for voter dots). The org UI requires a new backend service (`OrganizationService`), a new router (`app/api/v1/organizations.py`), two new ZitadelService methods, and a new auth dependency (`require_org_role()`). The org router uses `/api/v1/org` with no ID in the path because the user's org context is implicit in the JWT `urn:zitadel:iam:user:resourceowner:id` claim — this prevents cross-org access attempts via URL manipulation.

**Major backend components to create:**
1. `app/api/v1/organizations.py` — endpoints: `GET/PATCH /org`, `GET /org/campaigns`, `GET/POST/DELETE /org/members/*`; auth via new `require_org_role()` dependency
2. `app/services/organization.py` — business logic: resolve org from JWT org ID, list campaigns filtered by org, aggregate member directory from local DB (not ZITADEL for reads — avoids latency and downtime risk)
3. `app/schemas/organization.py` — Pydantic request/response schemas for org endpoints
4. Two additions to `app/services/zitadel.py`: `list_org_users(org_id)` and `list_user_grants(org_id, project_id)` — called only for mutations, not reads

**Major frontend components to create (map editor):**
1. `TurfMap.tsx` — base `MapContainer` + `TileLayer` wrapper
2. `TurfDrawControl.tsx` — Geoman `map.pm.addControls()` hook using `useMap()`; fires `pm:create` / `pm:edit` events; returns null (renders nothing itself)
3. `TurfPolygonLayer.tsx` — read-only GeoJSON layer for a single saved turf boundary
4. `TurfOverviewMap.tsx` — all-turfs overview, color-coded by status, popup on click

**Major frontend components to create (org UI):**
1. `web/src/routes/org/index.tsx` — org dashboard campaign grid
2. `web/src/routes/org/members.tsx` — member directory with user × campaign role matrix
3. `web/src/routes/org/settings.tsx` — org name edit, ZITADEL ID display
4. `useOrg` / `useOrgCampaigns` / `useOrgMembers` hooks — TanStack Query wrappers for org endpoints
5. "Organization" sidebar group in `__root.tsx` gated behind `<RequireRole minimum="admin">`

See `.planning/research/ARCHITECTURE.md` for full data-flow diagrams, component change tables, and dependency chains.

### Critical Pitfalls

1. **`set_config('app.current_campaign_id', ..., false)` leaks campaign context across requests via the connection pool — active data-isolation bug (CRITICAL).** The `false` parameter makes the setting connection-scoped. SQLAlchemy's pool (`pool_pre_ping=True`) returns connections between requests without resetting this variable. The next request drawing that connection inherits the prior request's `campaign_id`. Fix: change `false` → `true` in `app/db/rls.py:21` (transaction-scoped; auto-cleared on commit/rollback). Belt-and-suspenders: add a SQLAlchemy pool `checkout` event that resets the variable to the null UUID `00000000-0000-0000-0000-000000000000` — a valid UUID format that matches no real campaign. Do not use an empty string; PostgreSQL's `::uuid` cast throws on it. Then choose one centralization approach: FastAPI middleware extracting `campaign_id` from the URL path (cleaner), or replacing all 21 `get_db()` calls with `get_db_with_rls()` (more mechanical).

2. **`get_campaign_from_token()` and `ensure_user_synced()` both use `.limit(1)`, returning only the most recently created campaign per org.** With multi-campaign orgs (the target state for v1.5), users silently lack membership in all but their newest campaign. `ensure_user_synced()` in `deps.py:92-98` creates `CampaignMember` records only for the most recent campaign. This must be resolved before the org UI ships, or org admins will have invisible campaigns.

3. **Coordinate order: always extract `.geometry` from `layer.toGeoJSON()`, never construct GeoJSON manually from `getLatLngs()`.** Leaflet's `LatLng` objects expose `.lat` and `.lng`; manual serialization reverses GeoJSON's required `[longitude, latitude]` order. Swapped coordinates place turfs in the ocean off West Africa. The existing `_validate_polygon()` in `turf.py` does not detect this — add a US-bounds check (longitude: −180 to −60, latitude: 24 to 72) and add `shapely.geometry.polygon.orient(geom)` after `shape()` to normalize RFC 7946 counterclockwise winding order (the current code does not do this).

4. **Loguru (13 files) and stdlib logging (4 files) are mixed — a full structlog migration is a 17-file refactor with incompatible call signatures.** Loguru uses positional formatting (`logger.info("msg {}", var)`); structlog uses keyword binding (`logger.info("msg", key=var)`). Do not attempt a full migration in v1.5. Recommended: keep loguru for application logging; add structlog only as a request-level middleware capturing `request_id`, `user_id`, `campaign_id`, and duration as structured JSON. Standardize all new code on one library going forward.

5. **Org-level cross-campaign DB queries will silently return empty results if campaign RLS context is active.** All existing RLS policies filter by `campaign_id = current_setting('app.current_campaign_id')::uuid`. Org admin pages aggregate data across campaigns. Org-level endpoints must intentionally not set campaign context. Use explicit `WHERE organization_id = :org_id` clauses. Do not use a different DB role/connection just for org queries; just omit `set_campaign_context()` in the org endpoint handlers.

See `.planning/research/PITFALLS.md` for the full phase-by-phase pitfall table, RLS test strategy, and Sentry PII scrubbing configuration.

---

## Implications for Roadmap

Research points to six distinct phases in strict dependency order. The RLS fix and production hardening are blocking concerns for production deployment. The two feature tracks are independent of each other — a second engineer can develop the map editor in parallel with the org data model work — but neither should be deployed to production before the RLS fix is verified.

### Phase 1: RLS Fix and Multi-Campaign Foundation

**Rationale:** Active multi-tenant data-isolation failure in production. All voter and voter-list data is potentially exposed across campaign boundaries due to session-scoped `set_config`. This is a go-live blocker. Also fixes the `.limit(1)` bug in `get_campaign_from_token()` and `ensure_user_synced()` that would silently break the org UI.

**Delivers:** Transaction-scoped RLS context (`false` → `true` in `rls.py:21`); pool checkout event resetting context to null UUID; centralized context-setting (middleware or `get_db_with_rls()` replacement); explicit `WHERE` clauses in `ensure_user_synced()` verified to not rely on RLS; cross-campaign isolation test suite written before any code changes.

**Must avoid:**
- Empty string in UUID cast on pool checkout reset — use `00000000-0000-0000-0000-000000000000`
- Breaking `ensure_user_synced()` — verify it uses explicit `WHERE user_id = :id AND campaign_id = :cid`, not RLS, before applying the pool reset
- Testing with a superuser connection — must use a restricted `app_user` role to exercise RLS policies

**Research flag:** Standard patterns; root cause confirmed by codebase analysis. No additional phase research needed.

---

### Phase 2: Production Hardening (Sentry, Observability, Rate Limiting)

**Rationale:** Get observability in place before building new features so that bugs in the map editor and org UI surface immediately when deployed. The rate-limiting IP fix is a correctness issue (all users behind a shared NAT currently share one counter). Sentry PII scrubbing is a compliance requirement given voter data.

**Delivers:** Correct IP-based rate limiting using `CF-Connecting-IP` with a `ProxyHeadersMiddleware` guard against forged headers; user-ID-based rate limiting for authenticated endpoints; Sentry SDK >=2.0 with `FastApiIntegration()` and `AsyncioIntegration()`; `send_default_pii=False`; `before_send` hook stripping request bodies and SQL error data; `LoggingIntegration(event_level=None)` to eliminate double error reporting; structlog request middleware for structured JSON logs; explicit `sentry_sdk.capture_exception()` in TaskIQ task wrapper.

**Must avoid:**
- Full loguru-to-structlog migration — add structlog as middleware layer only; keep loguru for application code
- Voter PII reaching Sentry via SQL constraint violation messages — the `before_send` hook must strip exception SQL data, not just request body

**Research flag:** Standard FastAPI + Sentry + structlog patterns — no additional research needed.

---

### Phase 3: Organization Data Model and Auth Extension

**Rationale:** The `OrganizationMember` table and updated `resolve_campaign_role()` are the foundation for every org UI feature. Auth middleware changes affect all existing routes — isolating them in a dedicated phase with a minimal surface area and thorough testing before the UI is layered on top reduces regression risk.

**Delivers:** `organization_members` table migration (`user_id`, `organization_id`, `role`); seed migration promoting `created_by` users to `org_owner`; `resolve_campaign_role()` returning max(campaign role, org role equivalent); new `require_org_role()` security dependency; `OrganizationService` (`get_org_for_user`, `list_org_campaigns`, `list_org_members`); org API endpoints (`GET/PATCH /api/v1/org`, `GET /api/v1/org/campaigns`, `GET /api/v1/org/members`); `list_org_users` and `list_user_grants` added to `ZitadelService`.

**Must avoid:**
- Overloading ZITADEL project roles for org permissions — create a separate local `organization_members` table; do not conflate org roles with campaign roles in JWT claims
- Breaking existing `CampaignMember` role resolution — org roles are additive (elevate, never restrict)
- ZITADEL API calls for read operations — use local DB for member listing; only call ZITADEL for mutations

**Research flag:** ZITADEL Management API endpoint shapes for `list_org_users` (`POST /v2/users` with `x-zitadel-orgid`) and `list_user_grants` (`POST /management/v1/users/grants/_search`) need live verification against the running ZITADEL instance before implementation. Training-data confidence is MEDIUM.

---

### Phase 4: Map-Based Turf Editor

**Rationale:** Fully independent of the org changes — can be developed in parallel with Phase 3 by a separate engineer. Building after the RLS fix ensures turf data is correctly isolated. The backend requires zero changes for the core draw/edit flow; this is the safest large feature to build.

**Delivers:** Interactive polygon draw/edit via Geoman (`map.pm.addControls()` in `useMap()` hook); turf overview map with status colors; voter dots within a selected turf (clustered markers); voter count badge via `TurfService.get_voter_count()` wired into `TurfResponse`; GeoJSON file import with map preview; GeoJSON export (client-side); raw JSON textarea preserved as "Advanced" toggle; Leaflet CSS and Geoman CSS imported in app entry point. Two new backend endpoints: `GET /campaigns/{id}/turfs/geojson` and `GET /campaigns/{id}/turfs/{id}/voters/points`.

**Uses:**
- `@geoman-io/leaflet-geoman-free` — the only new npm package in v1.5
- `useMap()` from react-leaflet — imperative Geoman attachment; no React wrapper library needed
- Existing `useTurfs.ts` mutations — payload shape unchanged (`{ name, description, boundary: GeoJSON geometry }`); only input method changes

**Must avoid:**
- Manually constructing GeoJSON from `getLatLngs()` — always use `layer.toGeoJSON().geometry` from Geoman events
- Missing Leaflet CSS and Geoman CSS imports — causes invisible map tiles (common gotcha)
- Leaflet map keyboard trap — set `keyboard: false` on map container; add skip-nav link before the map; all CRUD operations must be possible without the map (the existing API supports GeoJSON text input)
- Map component as a child of a form component that re-renders on input changes — drawn polygons are lost on re-render; map must be a stable sibling of the form
- Mixing existing turf polygons and the draw layer in the same `FeatureGroup` — draw tool attempts to edit existing turfs; use separate layers

**Research flag:** The marker clustering library for voter dots (`react-leaflet-cluster` wrapping `leaflet.markercluster`) needs npm verification for react-leaflet 5 compatibility — not confirmed in this research round. `ST_Simplify` tolerance value for the turf overview map at low zoom needs empirical calibration against real turf data.

---

### Phase 5: Organization UI

**Rationale:** Depends entirely on Phase 3 (org data model and auth). Frontend-only once the backend is in place. Lower risk than Phase 3 but more surface area — new route pages, hooks, and sidebar navigation.

**Delivers:** Org dashboard at `/org` with campaign card grid; org member directory at `/org/members` with user × campaign role matrix; org settings page at `/org/settings`; campaign creation wizard (multi-step); "Organization" sidebar group gated behind `<RequireRole minimum="admin">`; `useOrg`, `useOrgCampaigns`, `useOrgMembers` TanStack Query hooks.

**Must avoid:**
- Cross-campaign DB queries with campaign RLS context active — org endpoint handlers must not call `set_campaign_context()`; use explicit `WHERE organization_id = :id` clauses
- Campaign creation accessible to non-org-admin users — gate the "New Campaign" button and the creation endpoint on `require_org_role("admin")`
- Multi-org URL complexity in v1.5 — ship with `/org` (implicit org from JWT); move to `/organizations/{id}` only if multi-org membership is added in a later milestone

**Research flag:** Standard shadcn/ui component patterns — no additional research needed. ZITADEL API calls are validated in Phase 3.

---

### Phase 6: WCAG Audit (Admin Pages)

**Rationale:** Must run after all new v1.5 UI (map editor, org dashboard) is complete so those components are in scope. v1.4 audited only `/field/` routes; the admin pages (~58K LOC) are completely unaudited. Run axe-core as a spot check during earlier phases, but the formal audit is last.

**Delivers:** axe-core automated scan on every admin route; manual screen reader testing on five critical flows (voter search, voter import, create walk list, phone bank session, campaign settings); `aria-live` regions on all dynamic content; keyboard navigation verified across all interactive components; focus management hook for TanStack Router route changes.

**Known high-risk components:** DataTable (`aria-sort` on sortable columns), Popover+Command comboboxes (`role="combobox"`, `aria-expanded`, `aria-activedescendant`), dual-handle sliders in the 23-dimension voter filter, Sheet/Dialog focus trapping, import wizard step announcements, propensity score and turf status badges (color-only information).

**Must avoid:**
- Leaflet map keyboard trap — must be addressed during Phase 4 build with `keyboard: false` and a skip-nav link; cannot be left to discovery here
- Building new components in Phases 3–5 without accessibility from day one using patterns established in v1.4 field mode

**Research flag:** Specific axe-core violations will drive the remediation work. Scope and effort cannot be estimated until the automated scan runs. Budget for at least one sprint after initial scan results.

---

### Phase Ordering Rationale

- RLS fix must be first — active production data-isolation failure; all other work is blocked from a deployment perspective
- Production hardening before feature work gives observability coverage for finding bugs in Phases 3–5 as they land in production
- Org data model before org UI — auth changes have a wide blast radius and need isolated testing before UI is layered on
- Map editor is independent and can be developed in parallel with Phase 3 by a separate engineer; merge after Phase 3 lands to avoid auth middleware conflicts in CI
- WCAG audit last — must cover all new UI; early spot checks with axe-core during development minimize the remediation backlog

---

### Research Flags

Phases needing deeper research during planning:
- **Phase 3:** ZITADEL Management API response shapes for `POST /v2/users` and `POST /management/v1/users/grants/_search` — verify against the live ZITADEL instance before implementing; training-data confidence is MEDIUM
- **Phase 4:** Confirm react-leaflet 5 compatibility of the marker clustering library (likely `react-leaflet-cluster`) — not npm-verified in this research round; needed for voter dots at 500–2000 markers per turf
- **Phase 6:** Run axe-core automated scan before estimating remediation scope — known high-risk components identified but violation count and severity are unknown

Phases with standard patterns (skip research-phase):
- **Phase 1:** RLS fix mechanics are well-documented in PostgreSQL docs; root cause confirmed by direct codebase analysis
- **Phase 2:** Sentry + structlog + slowapi patterns are established for FastAPI; specific configuration confirmed from codebase
- **Phase 5:** Org UI builds on patterns established in Phase 3; no novel integrations

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry verified (`@geoman-io/leaflet-geoman-free` v2.19.2, February 2026 publish); full codebase review confirms zero new backend packages needed; `leaflet-draw` abandonment confirmed (last publish June 2022) |
| Features | MEDIUM-HIGH | Table stakes derived from direct codebase gap analysis and domain knowledge of VAN/PDI/EveryAction; competitor claims based on training data, not live 2026 observation |
| Architecture | HIGH | RLS root cause confirmed from codebase line references (`rls.py:21`, `deps.py:23-179`, `session.py:18`); serialization layer completeness verified; component boundaries derived from existing code structure |
| Pitfalls | HIGH for RLS and map editor; MEDIUM for ZITADEL org API | RLS and coordinate pitfalls confirmed directly from source code; ZITADEL live API behavior needs verification |

**Overall confidence:** HIGH for the RLS fix and map editor; MEDIUM for ZITADEL org management API behavior in production.

### Gaps to Address

- **ZITADEL Management API live behavior:** `list_org_users` and `list_user_grants` endpoint shapes need verification against the running ZITADEL instance before Phase 3 implementation. Do not assume training-data response shapes are correct.
- **Marker clustering library for voter dots:** `react-leaflet-cluster` (wrapping `leaflet.markercluster`) is the most likely candidate but was not npm-verified in this research round. Confirm version and react-leaflet 5 compatibility before Phase 4 implementation begins.
- **`ensure_user_synced()` RLS dependency:** PITFALLS.md flags this function as a candidate for relying on RLS for `CampaignMember` lookup (`deps.py:84-137`). A targeted code audit must confirm whether explicit `WHERE` clauses are used before the pool checkout reset is applied. If RLS is relied upon, refactor before deploying Phase 1.
- **`ST_Simplify` tolerance calibration:** The tolerance value for turf polygon simplification at overview map zoom levels requires empirical testing against real turf data. No single value fits all campaign geographies.
- **Multi-org assumption for v1.5:** Research recommends shipping `/org` with a single-org assumption derived from the JWT. If the product decision is made to support multi-org membership at launch, Phase 5 URL design and the org switcher component scope must expand.
- **Voter count N+1 query:** Adding `voter_count` to the turf list response requires a lateral join or a batch subquery. Naive implementation calls `get_voter_count()` per turf in a loop. This must be addressed in the Phase 4 schema change — confirm the batch query approach before implementation.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `app/db/rls.py` line 21 — `set_config` `false` parameter
- Direct codebase analysis: `app/api/deps.py` lines 23–179 — `get_db_with_rls()` exists but unused; `ensure_user_synced()` queries before context is set; `.limit(1)` multi-campaign bug
- Direct codebase analysis: `app/db/session.py` line 18 — `pool_pre_ping=True` confirms pool reuse
- Direct codebase analysis: all 21 files in `app/api/v1/` — confirmed all use `get_db()` + manual context; `get_db_with_rls()` called by zero endpoints
- Direct codebase analysis: `app/services/turf.py`, `app/schemas/turf.py`, `app/api/v1/turfs.py` — serialization layer confirmed complete
- Direct codebase analysis: `app/models/organization.py`, `app/models/campaign.py`, `app/services/zitadel.py` — org model and ZITADEL service methods confirmed
- Direct codebase analysis: `web/package.json` — `leaflet` 1.9.4, `react-leaflet` 5.0.0 confirmed installed; no map components in `web/src/`
- Direct codebase analysis: `app/core/rate_limit.py` line 8 — `get_remote_address` confirmed reading `request.client.host` (proxy-blind)
- Direct codebase analysis: 13 files confirmed using `from loguru import logger`, 4 using `import logging`
- npm registry: `@geoman-io/leaflet-geoman-free` v2.19.2 — February 2026 publish date, MIT license, peer dep `leaflet ^1.2.0` verified
- npm registry: `leaflet-draw` — last publish June 2022 confirmed (abandoned)
- PostgreSQL documentation: `set_config()` third parameter — `true` = transaction-local, `false` = session-local (persists until connection close)
- RFC 7946: GeoJSON coordinate order `[longitude, latitude]`

### Secondary (MEDIUM confidence)
- Training data: ZITADEL Management API v1 — `POST /v2/users` with `x-zitadel-orgid` header, `POST /management/v1/users/grants/_search` response shape
- Training data: VAN/VoteBuilder turf cutter, EveryAction committee admin, PDI canvassing — feature parity benchmarks for political field operations
- Training data: Sentry SDK 2.0+ async contextvars behavior in FastAPI async handlers
- Training data: loguru + structlog integration patterns for FastAPI request middleware

### Tertiary (LOW confidence)
- Training data: 2026 competitor product state — VAN, EveryAction, Reach feature sets may have changed since training cutoff; treat as directional, not authoritative

---

*Research completed: 2026-03-24*
*Ready for roadmap: yes*
