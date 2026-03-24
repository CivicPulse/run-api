# Pitfalls Research: v1.5 Go Live -- Production Readiness

**Domain:** Multi-tenant political field operations platform
**Researched:** 2026-03-24
**Overall confidence:** HIGH (based on codebase analysis + v1.0 research + domain expertise)

---

## RLS / Multi-Tenancy Fix

### Most Likely Root Cause

**Confidence: HIGH** -- confirmed by codebase analysis of `app/db/rls.py`, `app/api/deps.py`, `app/db/session.py`, and all 21 endpoint files.

The data leak bug (voters and voter lists crossing campaign boundaries) is almost certainly caused by **`set_config(..., false)` creating session-scoped (connection-scoped) context that persists across requests via the SQLAlchemy connection pool**, combined with endpoints that fail to set context before querying RLS-protected tables.

Three contributing factors confirmed in the codebase:

**Factor 1: `set_config(..., false)` is session-scoped, not transaction-scoped.**

In `app/db/rls.py:21`, the third parameter `false` means the setting persists for the entire database *connection* (session), not just the current transaction. When SQLAlchemy returns the connection to the pool (`pool_pre_ping=True` in `session.py:18`), the next request that draws that connection inherits the previous request's `campaign_id`. If that next request fails to call `set_campaign_context()` before any query, RLS uses the stale value.

**Factor 2: Pattern inconsistency across 21 endpoint files.**

Every endpoint independently imports and calls `set_campaign_context`. The `get_db_with_rls()` dependency exists in `deps.py:23-36` but is **used by zero endpoints** -- all 21 files use `get_db()` + manual `set_campaign_context()`. Confirmed endpoints that NEVER set RLS context:
- `invites.py` -- all 4 endpoints (create, list, revoke, accept). The `list_invites` and `create_invite` both take `campaign_id` as a path parameter but never set RLS context. If the `invites` table has RLS, the service queries succeed only because of stale context from a previous request on the same connection.
- `campaigns.py` -- `list_campaigns`, `create_campaign`, `get_campaign`, `update_campaign`, `delete_campaign`. These intentionally operate cross-campaign.
- `join.py` -- `get_campaign_public_info`, `register_volunteer`. These are public/pre-campaign endpoints.

**Factor 3: `ensure_user_synced()` queries RLS-protected tables before context is set.**

In `deps.py:84-137`, `ensure_user_synced()` queries `Organization`, `Campaign`, and `CampaignMember` tables. Every campaign-scoped endpoint calls `ensure_user_synced(user, db)` BEFORE `set_campaign_context(db, ...)`. If `CampaignMember` has an RLS policy, this function succeeds only due to stale context from a previous request -- or it creates duplicate member records for the wrong campaign.

### How to Fix Safely

**Phase this fix carefully. A botched RLS change can lock out all users or expose all data.**

#### Step 1: Switch from session-scoped to transaction-scoped context (CRITICAL)

Change `set_config(..., false)` to `set_config(..., true)` in `app/db/rls.py`:

```python
# CHANGE: false -> true
# With true, setting is automatically cleared on commit/rollback
await session.execute(
    text("SELECT set_config('app.current_campaign_id', :campaign_id, true)"),
    {"campaign_id": str(campaign_id)},
)
```

**Risk:** If any code path does `session.commit()` mid-request then queries more RLS-protected rows, the context is cleared after that commit. Audit all endpoints for this pattern. Known candidates:
- `ensure_user_synced()` calls `db.commit()` (lines 67, 82, 132 of `deps.py`) before the endpoint's `set_campaign_context()` call. This is actually safe because the context hasn't been set yet.
- `import_service.py:857` sets context inside a session context manager. Verify it doesn't commit mid-import.

#### Step 2: Add connection pool checkout event to clear stale context

Register a SQLAlchemy pool event to reset the session variable when a connection is drawn from the pool:

```python
from sqlalchemy import event

@event.listens_for(engine.sync_engine, "checkout")
def reset_campaign_context(dbapi_conn, connection_record, connection_proxy):
    cursor = dbapi_conn.cursor()
    cursor.execute("SELECT set_config('app.current_campaign_id', '', true)")
    cursor.close()
```

This is belt-and-suspenders: even if an endpoint forgets to set context, RLS defaults to "no data visible" (empty string fails the `::uuid` cast or matches nothing) rather than "previous campaign's data visible."

#### Step 3: Centralize RLS context setting

Two options:

**Option A (recommended): FastAPI middleware.** Extract `campaign_id` from URL path for all `/campaigns/{campaign_id}/...` routes. Set context once in middleware before any endpoint code runs. Eliminates the need for every endpoint to manually call `set_campaign_context()`.

**Option B: Replace `get_db()` with `get_db_with_rls()`.** The dependency already exists but is unused. This is more mechanical -- requires touching all 21 endpoint files -- but preserves the current pattern.

#### Step 4: Audit endpoints that skip RLS context

For endpoints that intentionally skip RLS (campaigns, invites, join), verify they:
- (a) Do not JOIN to RLS-protected tables (which would filter silently based on stale context)
- (b) Use explicit `WHERE campaign_id = :id` clauses rather than relying on RLS

### Test Strategy

1. **Write a cross-campaign isolation test BEFORE making changes.** Create two campaigns with different voters. Query voters with campaign A context. Then query again WITHOUT setting context. If the second query returns ANY rows, the bug is confirmed.

2. **Test the stale connection scenario specifically:**
   - Request 1: Set context to campaign A, query voters, session returned to pool
   - Request 2: Use same connection (small pool), do NOT set context, query voters
   - Assert: Request 2 returns zero rows (not campaign A's data)

3. **Test `ensure_user_synced()` with empty context.** After adding the pool checkout reset, `ensure_user_synced()` will run with `app.current_campaign_id = ''`. Verify it doesn't crash (the `current_setting(..., true)::uuid` cast on empty string may throw -- this must be handled).

4. **Run full integration suite after `false` -> `true` change.** Any endpoint that does `commit()` then more RLS queries within the same request will break. Find and fix those.

5. **Do NOT test RLS with a superuser connection.** Superusers bypass RLS entirely. Integration tests MUST use a restricted `app_user` role.

### Critical Warning: Empty String UUID Cast

The pool checkout reset sets `app.current_campaign_id` to `''`. The RLS policies cast this to UUID: `current_setting('app.current_campaign_id', true)::uuid`. An empty string cast to UUID throws an error in PostgreSQL. Options:
- Set to a known-invalid UUID like `'00000000-0000-0000-0000-000000000000'` that matches no real campaign
- Change RLS policies to handle NULL: `COALESCE(current_setting('app.current_campaign_id', true), '')::uuid`
- Set to NULL and update policies to use `NULLIF`

The safest approach: set to `'00000000-0000-0000-0000-000000000000'` which is a valid UUID format but matches no real campaign row.

---

## Map-Based Turf Editor

### PostGIS GeoJSON Coordinate/Geometry Pitfalls

**Confidence: HIGH** -- the existing `app/services/turf.py` and `app/models/turf.py` confirm SRID 4326, Shapely validation, and WKB storage patterns. Adding a Leaflet draw editor introduces new client-side surface area.

#### Pitfall 1: Coordinate Order (lng, lat) vs (lat, lng)

**What goes wrong:** GeoJSON spec (RFC 7946) mandates `[longitude, latitude]`. Leaflet internally uses `LatLng(lat, lng)`. Converting Leaflet draw output to GeoJSON for storage can swap coordinates.

**Why it happens:** Leaflet's `toGeoJSON()` method correctly outputs `[lng, lat]`. But developers who manually extract `layer.getLatLngs()` get `LatLng` objects with `.lat` and `.lng` properties and may serialize them as `[lat, lng]` (wrong order for GeoJSON).

**Prevention:**
- ALWAYS use `layer.toGeoJSON().geometry` from Leaflet draw events, never manually construct GeoJSON
- Add server-side bounds validation: for US political campaigns, all longitudes should be negative (-180 to -60) and all latitudes should be positive (24 to 72). A polygon with positive "longitudes" and negative "latitudes" has swapped coordinates.
- The existing `_validate_polygon()` in `turf.py` uses Shapely's `shape()` which accepts coordinates in either order silently -- it will NOT detect the swap. Add explicit bounds checking.

**Warning sign:** Turfs appear in the ocean off the coast of Africa (lat/lng swapped for US coordinates). `ST_Contains` queries return zero voters for a seemingly valid polygon.

#### Pitfall 2: Winding Order (CW vs CCW)

**What goes wrong:** RFC 7946 requires exterior rings in counterclockwise (CCW) order. Some tools emit clockwise. PostGIS is tolerant, but GeoJSON consumers (Mapbox, turf.js) may interpret CW exterior rings as holes.

**Prevention:**
- Apply `shapely.geometry.polygon.orient()` after `shape(geojson)` in `_validate_polygon()` to normalize winding order before storage. The existing code does NOT do this.
- This is a one-line addition: `geom = orient(geom)` after the `shape()` call.

#### Pitfall 3: Self-Intersecting Polygons from Freehand Drawing

**What goes wrong:** Users drawing complex turf boundaries create self-intersecting polygons (bowties, figure-eights). These fail spatial queries or produce wrong results.

**Prevention:**
- The existing code checks `geom.is_valid` and calls `explain_validity()` -- this catches self-intersections. Good.
- Add `geom = geom.buffer(0)` to auto-repair simple self-intersections before rejecting. This splits bowties into valid multipolygons. Then check if the result is a Polygon (accept) or MultiPolygon (reject with a message like "Your boundary crosses itself. Please redraw.").
- Display the validation error on the map with the invalid segments highlighted in red.

#### Pitfall 4: Large/Complex Polygon Performance

**What goes wrong:** A user draws a turf with 500+ vertices (tracing a complex boundary). The `ST_Contains` query against 50K+ voter points becomes slow.

**Prevention:**
- Apply `shapely.simplify(tolerance=0.0001)` server-side before storage (preserves ~10m accuracy)
- Add a vertex count limit: warn at 200 vertices, reject at 1000
- The PostGIS `geometry` column in `turf.py:45` already has `spatial_index=True`. Good.

#### Pitfall 5: SRID Mismatch Between Turf and Voter Points

**What goes wrong:** `ST_Contains(turf.boundary, voter.geom)` only works correctly if both geometries have the same SRID. The models confirm both use SRID 4326 (`turf.py:45`, `voter.py:108`). But if any code path creates geometry without specifying SRID, the join fails silently.

**Prevention:**
- The existing `from_shape(geom, srid=4326)` in `_validate_polygon()` correctly sets SRID. Keep this.
- Verify that voter import also sets SRID 4326 when creating point geometries from lat/lng.

### Leaflet Draw Pitfalls

#### Pitfall 6: react-leaflet-draw vs @geoman-io/leaflet-geoman-free

**What goes wrong:** `react-leaflet-draw` wraps Leaflet.draw which is minimally maintained. It has known bugs with React 18/19 StrictMode (double mount creates duplicate toolbars, event handlers fire twice).

**Prevention:**
- Use `@geoman-io/leaflet-geoman-free` instead -- actively maintained, supports snapping (turfs can share edges), has `pm:create` events with proper GeoJSON output.
- If using react-leaflet-draw: wrap in a `useEffect` cleanup that removes the draw control on unmount, and use `key` prop on the `FeatureGroup` to force clean re-renders.

#### Pitfall 7: Map Re-Render Loses Drawn Polygons

**What goes wrong:** React state changes cause the map component to re-render, which re-initializes Leaflet, losing drawn polygons and resetting the view.

**Prevention:**
- Use `useMemo` for the map container ref
- Store drawn features in React state and restore them via `useEffect` after re-render
- Do NOT put the Leaflet map inside a component that re-renders on form input changes
- The map component should be a stable sibling of the form, not a child

#### Pitfall 8: Existing Turfs Display + New Turf Draw Conflict

**What goes wrong:** The map needs to display existing turfs (from the API) AND allow drawing new ones. If existing turf polygons are on the same `FeatureGroup` as the draw layer, the draw tool tries to edit existing turfs.

**Prevention:**
- Use separate `FeatureGroup` layers: one for displaying existing turfs (read-only), one for the draw tool (editable)
- Style existing turfs differently (semi-transparent fill, dashed border) to visually distinguish from the new turf being drawn

---

## Organization-Level UI

### ZITADEL Org vs Campaign Auth Pitfalls

**Confidence: MEDIUM** -- based on codebase analysis of `deps.py`, `models/organization.py`, and ZITADEL architecture. The Organization model exists but the UI permission layer is new territory.

#### Pitfall 1: Multi-Campaign Orgs Break the "One Token = One Campaign" Assumption

**What goes wrong:** The current system assumes one ZITADEL org = one campaign. `get_campaign_from_token()` in `deps.py:142-179` resolves the user's `org_id` to a single campaign using `order_by(created_at.desc()).limit(1)`. When an org has multiple campaigns, the user always sees only the most recently created one. The other campaigns are invisible.

**Why it happens:** v1.0 designed a 1:1 org-to-campaign mapping. The Organization model was added later but the endpoint dependency still picks one campaign per org.

**Prevention:**
- `get_campaign_from_token()` should return a LIST of campaigns, not one. Or better: deprecate it for campaign-scoped operations entirely.
- Campaign selection must be explicit. The URL path already contains `campaign_id` (`/campaigns/{campaign_id}/...`) which is the correct pattern.
- Add a campaign switcher UI that lists all campaigns in the user's org.
- `ensure_user_synced()` at `deps.py:92-98` also uses `.limit(1)` -- it creates `CampaignMember` records only for the most recent campaign. Users silently lack membership in older campaigns.

#### Pitfall 2: Org Admin vs Campaign Admin Permission Confusion

**What goes wrong:** The existing `require_role()` checks campaign-level roles from JWT claims (`urn:zitadel:iam:org:project:roles`). Org-level operations (create campaign within org, manage org settings, view all campaigns) need a separate permission concept. Without it, either: (a) only campaign admins can manage the org (wrong -- what if they're a volunteer in one campaign but own the org?), or (b) any org member can do anything at the org level (no access control).

**Prevention:**
- Define org-level roles separately. Simplest approach: add an `organization_members` table with `user_id`, `organization_id`, and `role` columns. Roles: `member`, `admin`, `owner`.
- Do NOT overload ZITADEL project roles for org permissions. An org admin who hasn't been added to a specific campaign should NOT gain campaign-level access.
- Create a `require_org_role()` dependency parallel to `require_role()`.

#### Pitfall 3: RLS Policies Don't Support Org-Level Queries

**What goes wrong:** All RLS policies filter by `campaign_id = current_setting('app.current_campaign_id')::uuid`. Org admin pages need to query across campaigns (e.g., "all volunteers across all campaigns in my org"). These queries return empty with campaign-scoped RLS.

**Prevention:**
- Org-level endpoints must NOT set campaign context (intentionally)
- Use the admin/superuser database connection for org-level read queries, or create a separate RLS policy set for org-scoped queries
- Alternatively: org-level dashboards aggregate data via campaign-level API calls (one per campaign), avoiding cross-campaign DB queries entirely. Simpler but slower.
- Be explicit in the code about which endpoints are campaign-scoped vs org-scoped. Use different dependency injection patterns.

#### Pitfall 4: ZITADEL Organization API Latency in User-Facing Flows

**What goes wrong:** Org management UI makes synchronous calls to ZITADEL Management API. These add 200-500ms latency per call. Users perceive the org admin page as slow.

**Prevention:**
- Cache org metadata locally in the `organizations` table (already exists)
- Read operations (org members, org details) should read from local DB
- Only call ZITADEL API for mutations (create org, add user to org)
- Handle ZITADEL downtime gracefully: org listing should work even if ZITADEL is down

---

## Production Hardening (FastAPI)

### Rate Limiting Pitfalls

**Confidence: HIGH** -- slowapi already in use at `app/core/rate_limit.py` and `app/api/v1/join.py`.

#### Pitfall 1: IP-Based Rate Limiting Sees Only Proxy IP

**What goes wrong:** `get_remote_address` in `rate_limit.py:8` reads `request.client.host`. Behind Cloudflare + Traefik, this is the proxy IP. All users share one rate limit counter.

**Prevention:**
- Use Cloudflare's `CF-Connecting-IP` header for the real client IP
- Custom key function:
  ```python
  def get_real_ip(request: Request) -> str:
      return request.headers.get("CF-Connecting-IP",
             request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
             or request.client.host)
  ```
- Add `ProxyHeadersMiddleware` or `TrustedHostMiddleware` to prevent IP spoofing via forged headers

#### Pitfall 2: Rate Limiting Authenticated Users by IP

**What goes wrong:** All users behind the same NAT (campaign office, volunteer training event) share one IP-based limit. One user's heavy API usage locks out everyone else.

**Prevention:**
- For authenticated endpoints: rate limit by `user.id` from JWT, not IP
- For public endpoints (join page): IP-based is fine
- Different limits: 100/min for authenticated, 20/min for public

#### Pitfall 3: slowapi In-Memory State with K8s Replicas

**What goes wrong:** slowapi defaults to in-memory storage. With multiple K8s replicas, each pod has its own counter. Effective rate limit = configured limit x replica count.

**Prevention:**
- For single-replica (v1.5 launch): in-memory is acceptable. Document the limitation.
- For multi-replica: switch to Redis backend via `limits` library's Redis storage
- Do NOT over-engineer this before needing multiple replicas

### Sentry + structlog Async Pitfalls

**Confidence: MEDIUM** -- based on known integration patterns. Codebase uses loguru (13 files) + stdlib logging (4 files) mixed together.

#### Pitfall 1: Loguru-to-structlog Migration is a Full Codebase Refactor

**What goes wrong:** 13 files use `from loguru import logger` with `logger.info("msg {}", var)` (positional formatting). 4 files use `import logging` with `logger.info("msg %s", var)` (%-formatting). structlog uses `logger.info("msg", key=var)` (keyword binding). These are mutually incompatible.

**Prevention:**
- Do NOT attempt a full migration in one phase. Two viable approaches:
  - **Approach A (recommended):** Keep loguru for application logging. Add structlog only as a request-level structured logging middleware (middleware captures request_id, user_id, campaign_id, duration). Route loguru output through structlog's JSON formatter for unified output.
  - **Approach B:** Incremental migration. Configure structlog to accept loguru-style calls via a compatibility processor. Migrate files one at a time over multiple PRs.
- Either way: standardize on ONE logging library for new code going forward.

#### Pitfall 2: Sentry Async Context Loss (Pre-2.0 SDK)

**What goes wrong:** Pre-2.0 Sentry SDK uses thread-local storage for Hub/Scope. Async FastAPI handlers run multiple requests on the same thread. Context (breadcrumbs, tags, user) bleeds between requests.

**Prevention:**
- Use `sentry-sdk>=2.0` which uses Python contextvars natively
- Initialize with:
  ```python
  sentry_sdk.init(
      integrations=[FastApiIntegration(), AsyncioIntegration()],
      send_default_pii=False,
  )
  ```
- Verify by raising an exception in an async endpoint and confirming Sentry shows the correct request URL and user, not a different request's data.

#### Pitfall 3: Sentry Captures Voter PII

**What goes wrong:** Sentry defaults send request bodies, headers (including Authorization JWT), and query parameters. Voter PII (names, phone numbers, addresses) from API request/response bodies ends up in a cloud service (Sentry).

**Prevention:**
- `send_default_pii=False` (verify this is set)
- Add `before_send` hook to strip sensitive fields:
  ```python
  def before_send(event, hint):
      if "request" in event:
          event["request"].pop("data", None)
          headers = event["request"].get("headers", {})
          headers.pop("authorization", None)
      return event
  ```
- Configure `denylist` for additional PII field names

#### Pitfall 4: Double Error Reporting (structlog + Sentry)

**What goes wrong:** Both structlog and Sentry capture exceptions. Errors appear twice in Sentry: once from the LoggingIntegration (log-based capture), once from the ASGI exception handler.

**Prevention:**
- Configure `LoggingIntegration(event_level=None)` to disable log-based event capture
- Let Sentry capture exceptions only through its FastAPI/ASGI middleware
- structlog handles structured log output (stdout for K8s log aggregation), Sentry handles error alerting

#### Pitfall 5: TaskIQ Background Tasks Not Monitored by Sentry

**What goes wrong:** `app/tasks/import_task.py` runs via TaskIQ. Sentry's FastAPI integration only instruments HTTP request handlers. Background task exceptions (voter import failures) go unreported to Sentry.

**Prevention:**
- Wrap TaskIQ task functions with explicit Sentry transaction:
  ```python
  with sentry_sdk.start_transaction(op="task", name="import_voters"):
      try:
          await process_import(...)
      except Exception:
          sentry_sdk.capture_exception()
          raise
  ```
- Or create a TaskIQ middleware that initializes Sentry scope per task

---

## WCAG Audit

### Common Gaps in React Apps with Partial A11y Work

**Confidence: HIGH** -- v1.4 Phase 35 audited field mode routes only (`/field/`). The admin pages (~58K LOC frontend) remain unaudited.

#### Pitfall 1: Admin Pages Are Completely Unaudited

**What goes wrong:** v1.4 WCAG work (ARIA landmarks, touch targets, color contrast, live regions) was scoped to `/field/` routes only. The admin pages (voter management, shift management, phone banking, dashboards, campaign settings, import wizard) were not touched. These likely have major gaps.

**Specific high-risk components:**
- **DataTable** (used in 11+ phases): Does it have `role="table"`, `<th scope="col">`, `aria-sort` on sortable columns?
- **Popover+Command comboboxes** (member picker, caller picker, volunteer assignment): Do these have `role="combobox"`, `aria-expanded`, `aria-activedescendant`?
- **Accordion filter builder** (23-dimension voter search): Are dual-handle sliders labeled? Do checkboxes have associated labels?
- **Sheet/Dialog** (type-to-confirm deletion, role change): Focus trapping and aria-labelledby?
- **Import wizard** (multi-step with progress): Step announcements for screen readers?

**Prevention:**
- Run axe-core automated scan on every admin route first (catches ~30% of issues automatically)
- Manually test with screen reader on the 5 most critical flows: voter search, voter import, create walk list, phone bank session, campaign settings
- Prioritize by user frequency, not by page count

#### Pitfall 2: Keyboard Navigation Traps

**What goes wrong:** Users can tab INTO a component but cannot tab OUT. Common culprits in this codebase:

- **Leaflet map (new):** Maps capture all keyboard events for panning/zooming. Keyboard users get trapped with no way to tab to the next element.
- **Command palette (cmdk):** If these don't handle Escape, keyboard users get stuck
- **Accordion filter builder:** Nested interactive controls can break tab order

**Prevention:**
- Leaflet map: set `keyboard: false` on the map container; provide explicit keyboard controls via buttons outside the map; add a skip-nav link before the map
- Test every interactive component with keyboard-only navigation (Tab, Shift+Tab, Enter, Escape, Arrow keys)
- All modals/popovers must close on Escape and return focus to the trigger

#### Pitfall 3: Dynamic Content Not Announced to Screen Readers

**What goes wrong:** Content that appears asynchronously (search results, pagination changes, loading states, validation errors) is invisible to screen reader users.

**Specific risks in admin pages:**
- Voter search results load -- no announcement
- Pagination changes -- new page of data appears silently
- Import wizard progress percentage -- not announced
- Form validation errors -- visual red borders only, no screen reader announcement

**Prevention:**
- Add `aria-live="polite"` regions for: search result counts, pagination status, import progress, form error summaries
- Use `aria-invalid="true"` + `aria-describedby` for field-level validation errors
- Field mode already has live regions (from v1.4) -- replicate this pattern on admin pages

#### Pitfall 4: Color-Only Information Conveying

**What goes wrong:** Information conveyed only through color is invisible to color-blind users (~8% of males). This codebase has several color-dependent UI patterns:
- 23-dimension filter chip system with category colors
- Propensity score badges (green/yellow/red)
- Turf status badges (draft/active/completed -- if color-coded)
- Dashboard charts

**Prevention:**
- Every color-coded element must also have a text label or icon
- Filter chips already have text labels (good) -- verify category distinction doesn't rely on color alone
- Add icons or shapes to status badges (draft = circle outline, active = filled circle, completed = checkmark)

#### Pitfall 5: Focus Management on TanStack Router Route Changes

**What goes wrong:** When navigating between pages, focus remains on the previous page's element (removed from DOM) or jumps to `<body>`. Screen reader users lose their place and must navigate from the top of the page.

**Prevention:**
- Add a route change listener that sets focus to the `<h1>` or `<main>` element on each navigation
- TanStack Router does not do this automatically -- it must be added as a custom hook
- Test: navigate from voter list to voter detail and back with screen reader

#### Pitfall 6: WCAG Audit Before vs After New Features

**What goes wrong:** Running the full WCAG audit before the map editor and org UI are built means those new components land unaudited. Running it after means the audit phase has more scope.

**Prevention:**
- Build new components (map editor, org UI) WITH accessibility from day one using the patterns established in v1.4
- Run the full audit AFTER all new v1.5 UI features are in place
- Use axe-core in development as a quick check during feature development, then do the comprehensive audit at the end

---

## Integration Pitfalls (Cross-Cutting)

### Pitfall: RLS Context + TanStack Query Cache on Campaign Switch

**What goes wrong:** Adding org-level UI with a campaign switcher introduces a new failure mode. If the frontend caches TanStack Query data from campaign A and the user switches to campaign B, stale data from campaign A can appear briefly while new queries load.

**Prevention:**
- Include `campaign_id` in every TanStack Query key (most queries already use `campaign_id` in the URL path, which is part of the key)
- On campaign switch: call `queryClient.removeQueries()` for the old campaign's keys, or `queryClient.clear()` for a clean slate
- The URL-based `campaign_id` pattern already in use helps -- switching campaigns changes the URL prefix, creating new query keys naturally

### Pitfall: Sentry + Voter PII in SQL Error Messages

**What goes wrong:** When a query fails (RLS cast error, constraint violation), the database error message may include SQL with campaign_id, voter names, or phone numbers. Sentry captures the full exception, including the SQL.

**Prevention:**
- Configure `before_send` to strip SQL-related exception data from Sentry events
- Log SQL errors to structured logs (which stay on-infrastructure), not to Sentry (cloud)
- PostgreSQL constraint violation messages include the column values -- scrub these

### Pitfall: Map Accessibility + WCAG Audit Timing

**What goes wrong:** Leaflet maps are inherently challenging for screen reader users. If the map component is added without accessibility considerations, the WCAG audit discovers a major issue that requires architectural changes to the map component.

**Prevention:**
- Build the map with accessibility from day one:
  - `role="application"` on the map container with a label
  - Skip-nav link before the map to bypass it
  - Text summary of the drawn polygon (area, vertex count)
  - All turf CRUD operations must be possible WITHOUT the map (the existing API endpoints already support GeoJSON input -- expose a text input alternative)
- The map is a progressive enhancement for sighted users, not a required interaction

### Pitfall: Pool Checkout Reset + `ensure_user_synced()` UUID Cast

**What goes wrong:** After adding the pool checkout reset (setting `app.current_campaign_id` to a null UUID), `ensure_user_synced()` runs a query that joins `CampaignMember`. The RLS policy `campaign_id = current_setting(...)::uuid` evaluates against the null UUID, returning zero rows. `ensure_user_synced()` then creates a duplicate `CampaignMember` record (or fails to find the existing one).

**Prevention:**
- `ensure_user_synced()` queries `CampaignMember` with an explicit `WHERE user_id = :id AND campaign_id = :cid` -- it does NOT rely on RLS for filtering. Verify this is the case.
- If `ensure_user_synced()` does rely on RLS, refactor it to use explicit WHERE clauses
- Alternatively: run `ensure_user_synced()` on a non-RLS connection (admin user), since it's a cross-cutting concern

---

## Phase-Specific Warnings Summary

| Phase Topic | Pitfall | Severity | Mitigation |
|---|---|---|---|
| RLS fix | `set_config(..., false)` leaks context across requests | **CRITICAL** | Switch to `true`, add pool checkout reset |
| RLS fix | Empty string UUID cast crashes on pool reset | HIGH | Use null UUID `00000000-...` instead of empty string |
| RLS fix | `ensure_user_synced()` runs before context is set | HIGH | Verify it uses explicit WHERE, not RLS |
| Map editor | Coordinate order swap (lat/lng vs lng/lat) | HIGH | Always use `layer.toGeoJSON()`, add bounds validation |
| Map editor | react-leaflet-draw StrictMode double-mount | MEDIUM | Use geoman or handle cleanup |
| Map editor | Self-intersecting polygons from user drawing | MEDIUM | Already handled; add `buffer(0)` auto-repair |
| Map editor | Missing winding order normalization | LOW | Add `orient(geom)` to `_validate_polygon()` |
| Org UI | `get_campaign_from_token()` returns only one campaign | HIGH | Deprecate for campaign-scoped endpoints |
| Org UI | No org-level permission model exists | HIGH | Add `organization_members` table with roles |
| Org UI | RLS blocks org-level cross-campaign queries | HIGH | Use explicit queries without campaign RLS context |
| Rate limiting | Proxy IP = all users share one limit | HIGH | Use `CF-Connecting-IP` header |
| Sentry | Voter PII in error reports | HIGH | `before_send` scrubbing + `send_default_pii=False` |
| structlog | Loguru migration is 13+ file refactor | MEDIUM | Keep loguru, add structlog as middleware layer only |
| Sentry | TaskIQ tasks not monitored | MEDIUM | Explicit `capture_exception()` in task wrapper |
| Sentry | Double error reporting with logging integration | MEDIUM | `LoggingIntegration(event_level=None)` |
| WCAG | Admin pages completely unaudited | HIGH | axe-core scan + manual screen reader testing |
| WCAG | Leaflet map keyboard trap | HIGH | `keyboard: false` + skip link + text alternative |
| WCAG | Dynamic content not announced | MEDIUM | `aria-live` regions on admin pages |
| WCAG | Focus lost on route changes | MEDIUM | Route change focus management hook |

---

## Recommended Phase Ordering for Pitfall Mitigation

1. **RLS Fix FIRST** -- Active data security bug in production. Fix before adding features. The `false` -> `true` change + pool checkout reset addresses the root cause. Estimated: 1-2 days with thorough testing.

2. **Production Hardening SECOND** -- Get observability in place (Sentry, structlog, rate limiting fix) before building new features, so you can detect problems in the new code. The rate limiting IP fix is critical for production readiness.

3. **Organization UI THIRD** -- Requires resolving the multi-campaign-per-org design before the map editor (which operates within a single campaign context).

4. **Map-Based Turf Editor FOURTH** -- Depends on RLS being solid (turf data is campaign-scoped). Benefits from Sentry being in place to catch coordinate bugs. Build with accessibility from day one.

5. **WCAG Audit LAST** -- Must run after all new UI is built (map, org dashboard). Running it before means re-auditing. Use axe-core during development as a spot check.

---

## Sources

- Codebase analysis: `app/db/rls.py` (line 21: `set_config` false parameter), `app/api/deps.py` (lines 23-179: `get_db_with_rls` unused, `ensure_user_synced` queries before context), `app/db/session.py` (line 18: `pool_pre_ping=True`)
- Codebase analysis: `app/services/turf.py` (lines 33-55: `_validate_polygon` missing winding normalization and bounds check)
- Codebase analysis: `app/models/turf.py` (line 45: SRID 4326), `app/models/voter.py` (line 108: SRID 4326)
- Codebase analysis: `app/core/rate_limit.py` (line 8: `get_remote_address`), `app/main.py` (lines 104-105: slowapi setup)
- Codebase analysis: 13 files using loguru, 4 using stdlib logging (inconsistent logging)
- Endpoint audit: 21 files in `app/api/v1/` confirmed -- all use `get_db()` + manual `set_campaign_context()`, none use `get_db_with_rls()`
- v1.0 RLS research: `.planning/milestones/v1.0-phases/01-authentication-and-multi-tenancy/01-RESEARCH.md` (Pitfalls 1-6)
- v1.4 accessibility research: `.planning/milestones/v1.4-phases/35-accessibility-audit-polish/35-RESEARCH.md`
- PostgreSQL docs: `set_config()` third parameter -- `true` = transaction-local (reset on commit/rollback), `false` = session-local (persists until connection close)
- RFC 7946: GeoJSON coordinate order `[longitude, latitude]`
- WCAG 2.1 Level AA success criteria

---
*Pitfalls research for: v1.5 Go Live -- Production Readiness*
*Researched: 2026-03-24*
