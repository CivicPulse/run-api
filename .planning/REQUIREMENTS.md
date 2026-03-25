# Requirements: v1.5 Go Live — Production Readiness

**Milestone:** v1.5
**Created:** 2026-03-24
**Total:** 48 requirements across 7 categories

## Data Isolation & Auth (DATA)

- [x] **DATA-01**: RLS context is transaction-scoped (`set_config` `true`), not session-scoped, preventing cross-campaign data leaks via connection pool reuse
- [x] **DATA-02**: Pool checkout event resets campaign context to null UUID on every connection acquisition
- [x] **DATA-03**: Campaign context setting is centralized (middleware or `get_db_with_rls()` replacement) so no endpoint can skip it
- [x] **DATA-04**: `ensure_user_synced()` creates membership for all campaigns in the user's org, not just the most recent (`.limit(1)` bug)
- [x] **DATA-05**: Campaign list is visible in prod for all authenticated users with valid campaign membership
- [x] **DATA-06**: Settings button navigates correctly to campaign settings page

## Observability & Hardening (OBS)

- [x] **OBS-01**: Sentry SDK captures unhandled exceptions with PII scrubbing (`send_default_pii=false`, `before_send` strips request bodies and SQL error data)
- [x] **OBS-02**: Structlog request middleware emits structured JSON logs with `request_id`, `user_id`, `campaign_id`, and duration per request
- [x] **OBS-03**: Rate limiting uses real client IP (`CF-Connecting-IP`) with proxy header guard, not `request.client.host`
- [x] **OBS-04**: Authenticated endpoints have user-ID-based rate limiting in addition to IP-based
- [x] **OBS-05**: All pages have error boundaries with user-friendly error messages
- [x] **OBS-06**: All list pages show meaningful empty state messages when no data exists
- [x] **OBS-07**: All data-loading pages show loading skeletons or spinners during fetch

## Organization Management (ORG)

- [x] **ORG-01**: `organization_members` table stores org-level roles (`org_owner`, `org_admin`) per user per org
- [x] **ORG-02**: Seed migration promotes existing org `created_by` users to `org_owner`
- [x] **ORG-03**: `resolve_campaign_role()` returns max(campaign role, org role equivalent) — org roles are additive, never restrictive
- [x] **ORG-04**: `require_org_role()` auth dependency gates org-level endpoints
- [x] **ORG-05**: Org dashboard at `/org` shows campaign card grid with status, election date, and member counts
- [x] **ORG-06**: Org member directory shows all users across all campaigns with per-campaign role matrix
- [x] **ORG-07**: Only `org_admin`+ can create campaigns within an org
- [x] **ORG-08**: Campaign creation wizard is multi-step (name/type/jurisdiction, org confirm, optional team invite)
- [x] **ORG-09**: Org settings page allows name edit (org_owner only) and displays read-only ZITADEL org ID
- [x] **ORG-10**: Org admin can add existing org member to a campaign directly without sending invite email
- [x] **ORG-11**: Campaign archival UI button transitions active campaigns to archived (read-only) status
- [x] **ORG-12**: User can belong to multiple orgs with an org switcher in the UI header
- [x] **ORG-13**: All queries/routes scope correctly to the selected org context

## Map-Based Turf Editor (MAP)

- [x] **MAP-01**: User can draw polygon boundaries on an interactive map using Geoman controls
- [x] **MAP-02**: User can edit existing turf boundaries by dragging vertices on the map
- [x] **MAP-03**: Overview map renders all campaign turfs color-coded by status (draft/active/completed)
- [x] **MAP-04**: Selected turf shows voter locations as clustered markers on the map
- [x] **MAP-05**: Voter count badge displays on turf list and map popup (wired from existing `get_voter_count`)
- [x] **MAP-06**: User can import a `.geojson` file to create a turf boundary with map preview before save
- [x] **MAP-07**: User can export a turf boundary as a `.geojson` file (client-side download)
- [x] **MAP-08**: Raw JSON textarea preserved as "Advanced" toggle for power users
- [x] **MAP-09**: Address geocoding search centers/zooms the map via Nominatim
- [x] **MAP-10**: Overlap detection warns when a new turf intersects existing active turfs
- [x] **MAP-11**: Satellite/aerial imagery toggle available as alternative to street map tiles

## UI/UX Polish (UX)

- [x] **UX-01**: Sidebar slides over content (not push) and consolidates navigation into single side menu
- [x] **UX-02**: Volunteer invite flow clearly distinguishes tracked-only volunteers from ZITADEL-invited users
- [x] **UX-03**: Contextual tooltips and help text guide new users through key features throughout the app
- [x] **UX-04**: Inline hints and documentation surface at decision points (e.g., turf sizing, role assignment)

## WCAG Compliance (A11Y)

- [x] **A11Y-01**: axe-core automated scan passes on all admin routes with zero critical/serious violations
- [x] **A11Y-02**: Screen reader testing passes on 5 critical flows (voter search, import, walk list create, phone bank, campaign settings)
- [x] **A11Y-03**: Keyboard navigation works for all interactive components (no focus traps, visible focus indicators)
- [x] **A11Y-04**: Map component has skip-nav link and all CRUD operations work without the map (JSON fallback)

## Testing (TEST)

- [x] **TEST-01**: Playwright E2E tests cover critical user flows: login, voter search, voter import, turf creation, phone bank session, volunteer signup
- [x] **TEST-02**: 18 pending integration tests from v1.0 pass against live infrastructure (PostgreSQL, PostGIS, MinIO, ZITADEL)
- [x] **TEST-03**: Cross-campaign RLS isolation test suite verifies no data leaks (written before fix, run after)

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| DATA-01 | Phase 39 | 39-01 | Satisfied |
| DATA-02 | Phase 39 | 39-01 | Satisfied |
| DATA-03 | Phase 39 | 39-02 | Satisfied |
| DATA-04 | Phase 39 | 39-03 | Satisfied |
| DATA-05 | Phase 39 | 39-03 | Satisfied |
| DATA-06 | Phase 39 | 39-04 | Satisfied |
| OBS-01 | Phase 40 | 40-01 | Satisfied |
| OBS-02 | Phase 40 | 40-01 | Satisfied |
| OBS-03 | Phase 40 | 40-02 | Satisfied |
| OBS-04 | Phase 40 | 40-02 | Satisfied |
| OBS-05 | Phase 44 | 44-01, 44-05 | Satisfied |
| OBS-06 | Phase 44 | 44-03, 44-05 | Satisfied |
| OBS-07 | Phase 44 | 44-03 | Satisfied |
| ORG-01 | Phase 41 | 41-01 | Satisfied |
| ORG-02 | Phase 41 | 41-01 | Satisfied |
| ORG-03 | Phase 41 | 41-02 | Satisfied |
| ORG-04 | Phase 41 | 41-03 | Satisfied |
| ORG-05 | Phase 43 | 43-01, 43-02 | Satisfied |
| ORG-06 | Phase 43 | 43-04 | Satisfied |
| ORG-07 | Phase 43 | 43-02 | Satisfied |
| ORG-08 | Phase 43 | 43-03 | Satisfied |
| ORG-09 | Phase 43 | 43-04 | Satisfied |
| ORG-10 | Phase 43 | 43-03, 43-04 | Satisfied |
| ORG-11 | Phase 43 | 43-02 | Satisfied |
| ORG-12 | Phase 43 | 43-01, 43-02 | Satisfied |
| ORG-13 | Phase 43 | 43-01, 43-02 | Satisfied |
| MAP-01 | Phase 42 | 42-02 | Satisfied |
| MAP-02 | Phase 42 | 42-02 | Satisfied |
| MAP-03 | Phase 42 | 42-03 | Satisfied |
| MAP-04 | Phase 42 | 42-03 | Satisfied |
| MAP-05 | Phase 42 | 42-01 | Satisfied |
| MAP-06 | Phase 42 | 42-04 | Satisfied |
| MAP-07 | Phase 42 | 42-04 | Satisfied |
| MAP-08 | Phase 42 | 42-02 | Satisfied |
| MAP-09 | Phase 42 | 42-04 | Satisfied |
| MAP-10 | Phase 42 | 42-01 | Satisfied |
| MAP-11 | Phase 42 | 42-03 | Satisfied |
| UX-01 | Phase 44 | 44-01 | Satisfied |
| UX-02 | Phase 44 | 44-02 | Satisfied |
| UX-03 | Phase 44 | 44-02, 44-05 | Satisfied |
| UX-04 | Phase 44 | 44-02, 44-05 | Satisfied |
| A11Y-01 | Phase 45 | 45-03 | Satisfied |
| A11Y-02 | Phase 45 | 45-04 | Satisfied |
| A11Y-03 | Phase 45 | 45-01, 45-04 | Satisfied |
| A11Y-04 | Phase 45 | 45-02 | Satisfied |
| TEST-01 | Phase 46 | 46-01, 46-03 | Satisfied |
| TEST-02 | Phase 46 | 46-02 | Satisfied |
| TEST-03 | Phase 46 | 46-02 | Satisfied |

## Future Requirements (deferred from v1.5)

- Turf splitting (draw line to bisect turf into two child turfs)
- Turf merging (combine adjacent turfs)
- Multi-polygon turf support (boundaries with holes)
- Census/precinct boundary overlay on turf map
- Auto-turf generation (algorithmic subdivision by voter count)
- Org-level aggregate dashboards (cross-campaign metrics)
- Org invite link (shareable URL to join org)
- Org activity feed (timeline of cross-campaign actions)
- Billing/subscription placeholder page
- Remove member from all campaigns (one-click)

## Out of Scope

- Shared org-level voter database — legal/vendor compliance risk; voter data stays campaign-scoped with RLS
- Real-time collaborative turf editing — CRDT/OT for geometry is extreme complexity; use optimistic locking
- Shapefile (.shp) or KML import — multi-file format requires GDAL/OGR; GeoJSON only, with conversion docs
- Freehand polygon drawing — produces self-intersecting polygons that Shapely rejects
- Custom permission builder — fixed 7-role hierarchy (5 campaign + 2 org) is sufficient
- Per-org SSO/SAML configuration — ZITADEL handles SSO at instance level
- Audit log viewer UI — log server-side via structlog; build UI only if requested
- White-label / custom branding per org
- Cloudflare Pages frontend split — keep embedded in FastAPI for v1.5
