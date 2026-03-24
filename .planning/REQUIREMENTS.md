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

- [ ] **OBS-01**: Sentry SDK captures unhandled exceptions with PII scrubbing (`send_default_pii=false`, `before_send` strips request bodies and SQL error data)
- [ ] **OBS-02**: Structlog request middleware emits structured JSON logs with `request_id`, `user_id`, `campaign_id`, and duration per request
- [ ] **OBS-03**: Rate limiting uses real client IP (`CF-Connecting-IP`) with proxy header guard, not `request.client.host`
- [ ] **OBS-04**: Authenticated endpoints have user-ID-based rate limiting in addition to IP-based
- [ ] **OBS-05**: All pages have error boundaries with user-friendly error messages
- [ ] **OBS-06**: All list pages show meaningful empty state messages when no data exists
- [ ] **OBS-07**: All data-loading pages show loading skeletons or spinners during fetch

## Organization Management (ORG)

- [ ] **ORG-01**: `organization_members` table stores org-level roles (`org_owner`, `org_admin`) per user per org
- [ ] **ORG-02**: Seed migration promotes existing org `created_by` users to `org_owner`
- [ ] **ORG-03**: `resolve_campaign_role()` returns max(campaign role, org role equivalent) — org roles are additive, never restrictive
- [ ] **ORG-04**: `require_org_role()` auth dependency gates org-level endpoints
- [ ] **ORG-05**: Org dashboard at `/org` shows campaign card grid with status, election date, and member counts
- [ ] **ORG-06**: Org member directory shows all users across all campaigns with per-campaign role matrix
- [ ] **ORG-07**: Only `org_admin`+ can create campaigns within an org
- [ ] **ORG-08**: Campaign creation wizard is multi-step (name/type/jurisdiction, org confirm, optional team invite)
- [ ] **ORG-09**: Org settings page allows name edit (org_owner only) and displays read-only ZITADEL org ID
- [ ] **ORG-10**: Org admin can add existing org member to a campaign directly without sending invite email
- [ ] **ORG-11**: Campaign archival UI button transitions active campaigns to archived (read-only) status
- [ ] **ORG-12**: User can belong to multiple orgs with an org switcher in the UI header
- [ ] **ORG-13**: All queries/routes scope correctly to the selected org context

## Map-Based Turf Editor (MAP)

- [ ] **MAP-01**: User can draw polygon boundaries on an interactive map using Geoman controls
- [ ] **MAP-02**: User can edit existing turf boundaries by dragging vertices on the map
- [ ] **MAP-03**: Overview map renders all campaign turfs color-coded by status (draft/active/completed)
- [ ] **MAP-04**: Selected turf shows voter locations as clustered markers on the map
- [ ] **MAP-05**: Voter count badge displays on turf list and map popup (wired from existing `get_voter_count`)
- [ ] **MAP-06**: User can import a `.geojson` file to create a turf boundary with map preview before save
- [ ] **MAP-07**: User can export a turf boundary as a `.geojson` file (client-side download)
- [ ] **MAP-08**: Raw JSON textarea preserved as "Advanced" toggle for power users
- [ ] **MAP-09**: Address geocoding search centers/zooms the map via Nominatim
- [ ] **MAP-10**: Overlap detection warns when a new turf intersects existing active turfs
- [ ] **MAP-11**: Satellite/aerial imagery toggle available as alternative to street map tiles

## UI/UX Polish (UX)

- [ ] **UX-01**: Sidebar slides over content (not push) and consolidates navigation into single side menu
- [ ] **UX-02**: Volunteer invite flow clearly distinguishes tracked-only volunteers from ZITADEL-invited users
- [ ] **UX-03**: Contextual tooltips and help text guide new users through key features throughout the app
- [ ] **UX-04**: Inline hints and documentation surface at decision points (e.g., turf sizing, role assignment)

## WCAG Compliance (A11Y)

- [ ] **A11Y-01**: axe-core automated scan passes on all admin routes with zero critical/serious violations
- [ ] **A11Y-02**: Screen reader testing passes on 5 critical flows (voter search, import, walk list create, phone bank, campaign settings)
- [ ] **A11Y-03**: Keyboard navigation works for all interactive components (no focus traps, visible focus indicators)
- [ ] **A11Y-04**: Map component has skip-nav link and all CRUD operations work without the map (JSON fallback)

## Testing (TEST)

- [ ] **TEST-01**: Playwright E2E tests cover critical user flows: login, voter search, voter import, turf creation, phone bank session, volunteer signup
- [ ] **TEST-02**: 18 pending integration tests from v1.0 pass against live infrastructure (PostgreSQL, PostGIS, MinIO, ZITADEL)
- [ ] **TEST-03**: Cross-campaign RLS isolation test suite verifies no data leaks (written before fix, run after)

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| DATA-01 | Phase 39 | TBD | Pending |
| DATA-02 | Phase 39 | TBD | Pending |
| DATA-03 | Phase 39 | TBD | Pending |
| DATA-04 | Phase 39 | TBD | Pending |
| DATA-05 | Phase 39 | TBD | Pending |
| DATA-06 | Phase 39 | TBD | Pending |
| OBS-01 | Phase 40 | TBD | Pending |
| OBS-02 | Phase 40 | TBD | Pending |
| OBS-03 | Phase 40 | TBD | Pending |
| OBS-04 | Phase 40 | TBD | Pending |
| OBS-05 | Phase 44 | TBD | Pending |
| OBS-06 | Phase 44 | TBD | Pending |
| OBS-07 | Phase 44 | TBD | Pending |
| ORG-01 | Phase 41 | TBD | Pending |
| ORG-02 | Phase 41 | TBD | Pending |
| ORG-03 | Phase 41 | TBD | Pending |
| ORG-04 | Phase 41 | TBD | Pending |
| ORG-05 | Phase 43 | TBD | Pending |
| ORG-06 | Phase 43 | TBD | Pending |
| ORG-07 | Phase 43 | TBD | Pending |
| ORG-08 | Phase 43 | TBD | Pending |
| ORG-09 | Phase 43 | TBD | Pending |
| ORG-10 | Phase 43 | TBD | Pending |
| ORG-11 | Phase 43 | TBD | Pending |
| ORG-12 | Phase 43 | TBD | Pending |
| ORG-13 | Phase 43 | TBD | Pending |
| MAP-01 | Phase 42 | TBD | Pending |
| MAP-02 | Phase 42 | TBD | Pending |
| MAP-03 | Phase 42 | TBD | Pending |
| MAP-04 | Phase 42 | TBD | Pending |
| MAP-05 | Phase 42 | TBD | Pending |
| MAP-06 | Phase 42 | TBD | Pending |
| MAP-07 | Phase 42 | TBD | Pending |
| MAP-08 | Phase 42 | TBD | Pending |
| MAP-09 | Phase 42 | TBD | Pending |
| MAP-10 | Phase 42 | TBD | Pending |
| MAP-11 | Phase 42 | TBD | Pending |
| UX-01 | Phase 44 | TBD | Pending |
| UX-02 | Phase 44 | TBD | Pending |
| UX-03 | Phase 44 | TBD | Pending |
| UX-04 | Phase 44 | TBD | Pending |
| A11Y-01 | Phase 45 | TBD | Pending |
| A11Y-02 | Phase 45 | TBD | Pending |
| A11Y-03 | Phase 45 | TBD | Pending |
| A11Y-04 | Phase 45 | TBD | Pending |
| TEST-01 | Phase 46 | TBD | Pending |
| TEST-02 | Phase 46 | TBD | Pending |
| TEST-03 | Phase 46 | TBD | Pending |

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
