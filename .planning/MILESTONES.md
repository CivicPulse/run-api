# Milestones

## v1.14 Voter Search & Lookup (Shipped: 2026-04-07)

**Phases completed:** 4 phases, 6 plans
**Timeline:** 2 days (2026-04-06 → 2026-04-07)
**Files modified:** 17
**Git range:** `9c9ac70..WORKTREE`
**Freshness SLA:** immediate after direct voter/contact edits; within 5 minutes after import completion
**Performance evidence:** DB-backed 10k-row lookup returned the intended result in about 115.54 ms

**Key accomplishments:**

1. Added free-text lookup to the existing voter search flow without splitting the contract from deterministic filters or stable pagination
2. Built a campaign-scoped PostgreSQL search surface refreshed from voter, contact, and import write paths
3. Added ranked cross-field lookup across names, phones, emails, addresses, city, ZIP, and source identifiers with typo tolerance
4. Shipped a search-first voter page with abort-aware queries, preserved prior data, explicit search states, and richer row-level disambiguation
5. Verified campaign isolation and production-scale performance with focused backend, frontend, and DB-backed reruns

**Audit:** .planning/milestones/v1.14-MILESTONE-AUDIT.md (status: passed, 15/15 requirements satisfied; re-audit closed SRCH-04 address-delete freshness seam)

---

## v1.13 Production Shakedown Remediation (Shipped: 2026-04-06)

**Phases completed:** 6 phases, 18 plans
**Timeline:** 2 days (2026-04-05 → 2026-04-06)
**Commits:** 25 | **Files modified:** 490
**Git range:** `v1.12..HEAD`
**Shakedown verdict:** GO with conditions (from NO-GO)

**Key accomplishments:**

1. Eliminated all 7 P0 cross-tenant isolation breaches — body injection, spatial join, UUID lookup, and field/me gate all fail-closed with campaign-scoped guards
2. Sanitized all error responses via FastAPI exception handler mapping — no stack traces, SQL, constraint names, or infrastructure details leaked to clients
3. Deployed production security headers (CSP, X-Frame-Options, X-Content-Type-Options) and HTTPS redirect middleware
4. Restored broken campaign creation (ZITADEL grant idempotency), CSV import (pre-signed upload URL workflow), and phone bank validation flows
5. Cleared all critical accessibility violations — 0 axe failures across 16 production pages, accessible names on all affected surfaces
6. Tightened schema validation for WGS84 coordinates, null-byte payloads, future birth dates, negative call durations, and oversized string fields
7. Achieved production shakedown GO verdict with full reverification across all 15 shakedown phases

**Conditions (ops/infrastructure, not code gaps):**
- Campaign creation 500 — ZITADEL pod connectivity investigation needed
- HSTS — Cloudflare edge configuration
- QA test data — kubectl cleanup documented

**Audit:** .planning/milestones/v1.13-MILESTONE-AUDIT.md (status: passed, 23/23 requirements satisfied)

---

## v1.12 Hardening & Remediation (Shipped: 2026-04-05)

**Phases completed:** 7 phases, 30 plans, 30 tasks

**Key accomplishments:**

- Closed the tenant-isolation review findings by enforcing campaign scoping across campaign listing, voter lists, import jobs, invites, tags, and survey sub-resources
- Hardened database isolation with FORCE RLS on core tables, enabled organization RLS, and shipped migration-backed coverage for cross-org isolation
- Repaired frontend auth and permission enforcement: root route redirects, OIDC callback error surfacing, org-role gates, and server-side active-calling check-in validation
- Eliminated key integrity and concurrency hazards with shift-signup locking, DNC idempotency, compensating transaction rollbacks, and missing uniqueness/index fixes
- Hardened reliability paths across offline sync, session-storage PII handling, backend timeouts, trusted-proxy IP logging, upload-size enforcement, and filename sanitization
- Backfilled quality coverage with auth/api/org-permission tests, callback edge-case tests, logout cleanup verification, a11y label fixes, and self-hosted Leaflet assets

---

## v1.11 Faster Imports (Shipped: 2026-04-04)

**Phases completed:** 15 phases, 31 plans, 24 tasks

**Key accomplishments:**

- Internal ImportChunk records, conservative chunk settings, and campaign-scoped RLS foundation for future parallel imports
- Reusable bind-limit-aware chunk sizing helpers and a deferred fan-out routing seam for serial imports
- Streamed CSV row counting plus a shared row-bounded import engine behind the existing serial wrapper
- Parent import coordination with total-row pre-scan, deterministic chunk rows, and eager child deferral behind the existing process_import entrypoint
- Independent chunk workers over the shared ranged import engine with chunk-only progress and concurrency-shape coverage
- Chunk-local phones_created persistence with widened parent status storage for completed_with_errors finalization
- Exactly-once parent fan-in over durable chunk rows with merged error artifacts and partial-success terminal state handling
- Concurrent chunk-completion coverage proving one authoritative parent result for both mixed and all-success outcomes
- Parent-driven chunk cancellation that preserves committed work and keeps parent fan-in authoritative
- Retry-safe chunk resume and cancellation-aware parent status fan-in
- Deterministic conflict-key ordering inside the batch upsert path to reduce cross-chunk deadlocks
- Durable chunk state for deferred phone and geometry work
- Primary chunk work now stops at voter durability and hands phones plus geometry to separate tasks
- Integration coverage now proves deferred secondary work blocks chunk and parent completion until finished
- Contract cleanup for partial-success imports and direct error-report access
- Client-side throughput and ETA metrics on the live import progress card
- Completion and history UI now explain partial success instead of hiding it behind raw statuses
- File-size-aware chunk planning and metadata lookup
- Rolling-window chunk dispatch and successor promotion
- Traceability and audit evidence for the repaired chunk runtime
- Fresh-job detect-columns wiring for the upload wizard
- Traceability and milestone closeout after the wizard flow repair
- Chunked import deletes now clean up child state, and Phase 59 no longer claims Phase 60 runtime behavior
- Import throughput now measures actual processing time, and the old validation debt is closed
- Two-line fix setting phone_task_status and geometry_task_status to CANCELLED on queued chunk cancellation, unblocking the secondary-task terminal gate
- Three regression tests proving cancelled chunks pass the secondary-task terminal gate and that queued-only cancellation drives parent import finalization
- Extended ImportJob frontend type with detect-column fields and added once-guarded hydration to step-restore effect for reopened uploaded imports
- E2E tests prove reopened imports restore mapping columns from job data and proceed through the wizard; audit gap for import-job restore seam retired

---

## v1.11 Faster Imports (Shipped: 2026-04-03)

**Phases completed:** 10 phases, 27 plans
**Timeline:** 3 days (2026-04-01 → 2026-04-03)
**Files modified:** 24 | **Lines added:** 3,400+ | **Commits:** multiple

**Key accomplishments:**

1. Parallelized the import runtime with deterministic chunk planning, parent fan-out, chunk-local progress, advisory-locked parent finalization, and merged error reporting
2. Hardened chunked imports for cancellation, crash recovery, deadlock avoidance, and deferred secondary phone/geometry work
3. Delivered frontend throughput, ETA, and partial-success import states while repairing the end-to-end upload wizard flow
4. Closed post-audit cleanup by fixing chunked-import deletion semantics, adding a durable `processing_started_at` metric contract, and retiring stale Phase 59 traceability
5. Brought the remaining Phase 59 and 60 validation artifacts to Nyquist-compliant status

**Audit:** .planning/v1.11-MILESTONE-AUDIT.md (status: passed, 18/18 requirements satisfied)

---

## v1.10 Import Recovery (Shipped: 2026-04-01)

**Phases completed:** 3 phases, 3 plans, 9 tasks
**Timeline:** 1 day (2026-04-01 → 2026-04-01)
**Files modified:** 29 | **Lines added:** 1,511 | **Commits:** 1
**Git range:** `feat: ship v1.10 import recovery`

**Key accomplishments:**

1. Added application-owned import recovery metadata with durable `last_progress_at` updates, orphan diagnostics, and configurable staleness thresholding
2. Implemented worker-startup recovery scanning that queues fresh recovery work instead of mutating stale queue rows
3. Guarded import processing, recovery, and finalization with per-import PostgreSQL advisory locks
4. Hardened exhausted-import finalization so fully consumed files no longer stay stuck in `PROCESSING`
5. Added unit coverage for stale detection, startup recovery queueing, terminal/fresh-job skips, and integration-marked crash-resume verification

**Audit:** .planning/v1.10-MILESTONE-AUDIT.md (status: passed, 15/15 requirements satisfied, 38 audited tests passing)

---

## v1.6 Imports (Shipped: 2026-03-29)

**Phases completed:** 7 phases, 16 plans, 31 tasks
**Timeline:** 2 days (2026-03-28 → 2026-03-29)
**Files modified:** 44 | **Lines added:** 5,214 | **Commits:** ~65
**Git range:** `docs(v1.6)` → `docs(phase-55)`

**Key accomplishments:**

1. Procrastinate PostgreSQL job queue replacing TaskIQ — durable background imports with 202 Accepted, per-campaign queueing lock, FastAPI lifespan integration, and complete TaskIQ removal
2. Standalone worker container with asyncio health endpoint, Docker Compose service, and K8s Deployments for dev/prod environments
3. Per-batch commit pipeline with RLS restoration, crash resume from last_committed_row, batch failure isolation, real-time polling progress, and bounded per-batch error writes to MinIO
4. Streaming CSV import from MinIO with async line-by-line iterator, first-chunk encoding detection, BOM stripping, and constant memory regardless of file size
5. Complete L2 auto-mapping: 58-field canonical dictionary with 217 aliases, 6-pattern voting history parser, format auto-detection via >80% exact alias ratio, frontend match-type badges (exact/fuzzy/unmapped), and L2 detection banner
6. Import cancellation with cooperative batch-loop detection, CANCELLING/CANCELLED status lifecycle, cancel endpoint (202), concurrent import prevention, and full frontend cancel UI with ConfirmDialog

**Gap closure (Phases 54-55):** Error report download link fixed to use MinIO pre-signed URL, ImportUploadResponse type aligned with backend schema, 6 audit tech debt items resolved (SUMMARY frontmatter, dead code, stale VERIFICATION text)

**Audit:** .planning/milestones/v1.6-MILESTONE-AUDIT.md (status: tech_debt, 14/14 requirements satisfied, all gaps closed by phases 54-55)

---

## v1.5 Go Live — Production Readiness (Shipped: 2026-03-25)

**Phases completed:** 10 phases, 36 plans, 67 tasks

**Key accomplishments:**

- Transaction-scoped set_config fix preventing cross-campaign data leaks, defense-in-depth pool checkout reset, and verified audit of all 33 RLS policies
- Centralized get_campaign_db FastAPI dependency replacing 244 inline set_campaign_context calls across 17 route files, ensuring zero-skip RLS enforcement
- Fixed ensure_user_synced to create CampaignMember for all org campaigns, deprecated get_campaign_from_token, and added idempotent backfill migration
- Defensive campaignId guard on settings button preventing undefined campaign navigation, with type assertion cleanup
- Sentry error tracking with PII scrubbing and structlog JSON request telemetry via ContextVars-based request context
- Trusted-proxy-aware IP extraction with Cloudflare CIDR validation and per-user JWT-based rate limit keys
- OrganizationMember model with OrgRole StrEnum, campaign-equivalent mappings, and Alembic migration seeding org_owner records from existing organizations
- Additive org role resolution in resolve_campaign_role() with max() semantics, JWT fallback removal, and NULL role backward compatibility
- GeoJSON file import with Polygon extraction, Nominatim address search, overlap visual highlight, and client-side GeoJSON export download
- Org management backend with 5 endpoints (CRUD + member assignment) plus frontend hooks, types, RequireOrgRole, and ZITADEL org-switching auth store extension
- Org-scoped dashboard at / with campaign card grid, archive flow, stats bar, and header org switcher for multi-org users
- 3-step campaign creation wizard with details/review/invite-team flow, per-step validation, org confirmation, and optional team member invite with role assignment
- Refactored AppSidebar to always render Organization nav (All Campaigns, Members, Settings) on authenticated routes instead of returning null on non-campaign pages
- RouteErrorBoundary component with Card-based fallback UI wired to router default and 7 section routes, plus sidebar defaultOpen=false for slide-over behavior
- Promoted TooltipIcon to shared component, added manager-only volunteer invite radio toggle with alert banner, and placed contextual help tooltips at 4 decision points (turf creation, role assignment, import mapping, campaign type)
- Replaced 3 page-level Loader2 spinners with layout-matching skeletons and standardized contextual empty state messaging across 14 list pages
- TooltipIcon on Organization ID, corrected empty state with Users icon, and RouteErrorBoundary on both org route files
- Shared a11y components (SkipNav, VisuallyHidden, LiveRegion, FocusScope), axe-core fixture, ARIA landmarks, WCAG AA contrast fix, and keyboard focus indicators
- Skip-map link and ARIA-compliant GeoJSON panel toggle for keyboard/screen reader turf boundary editing
- Parameterized axe-core WCAG 2.1 AA scan across 38 routes with JSON artifacts, zero critical/serious gate, and D-10 focus management patterns for forms and delete actions
- 5 Playwright flow tests verifying keyboard operability and screen reader compatibility for voter search, voter import wizard, walk list creation, phone bank sessions, and campaign settings
- API-level RLS smoke tests verify middleware campaign context across voter/turf endpoints; 10 skipped E2E stubs converted to real mock-based tests
- 3 Playwright E2E specs (turf, phone bank, volunteer) plus GitHub Actions integration-e2e job running full Docker Compose stack with migration, seed, pytest integration, and Playwright E2E tests
- Removed hardcoded Tailscale URLs, manual login functions, and waitForTimeout calls from 15 E2E tests across 2 spec files, making all tests CI-compatible with dynamic campaign discovery
- Fixed last 2 turf endpoints bypassing centralized RLS (get_turf_overlaps, get_turf_voters) with inspect-based unit tests and verified all 48 REQUIREMENTS.md entries
- 73 endpoints across 5 high-traffic route files rate-limited with tiered per-user limits via SlowAPI
- 1. [Rule 3 - Blocking] Created get_user_or_ip_key and supporting infrastructure
- AST-based guard test verifying all 22 route files have @limiter.limit decorators and authenticated endpoints use per-user key functions
- Single Playwright spec verifying full user journey: campaign list, campaign creation with POST verification, turf creation with GeoJSON, voter section, and phone bank section across 5 serial test.step blocks

---

## v1.4 Volunteer Field Mode (Shipped: 2026-03-17)

**Phases completed:** 9 phases, 26 plans
**Timeline:** 3 days (2026-03-15 → 2026-03-17)
**Files modified:** 304 | **Lines added:** 23,659 | **Commits:** 117
**Git range:** `feat(30-01)` → `fix(260317-w3n)`

**Key accomplishments:**

1. Mobile-first field layout shell with zero admin chrome, assignment-aware volunteer hub with pull-to-refresh, and volunteer auto-redirect after OIDC login
2. Linear canvassing wizard — door-by-door with household grouping, inline survey, auto-advance, progress tracking, persistent state via sessionStorage, and resume prompt
3. Phone banking field mode — tap-to-call via tel: links, clipboard fallback, E.164 formatting, outcome recording with shared OutcomeGrid/InlineSurvey components, session progress
4. Offline queue with localStorage persistence and automatic sync on connectivity resume for both canvassing and phone banking, with optimistic UI and offline banner
5. Guided onboarding tour via driver.js with per-segment completion (welcome/canvassing/phone banking), contextual tooltips, quick-start cards, and help button replay
6. WCAG AA accessibility — ARIA landmarks, screen reader labels, live regions, 44px touch targets, color contrast fixes, milestone celebration toasts, and Google Maps navigation links

**Tech debt accepted:** All 3 audit items resolved in quick task 260317-w3n (hasAddress guard, double FieldHeader, stale VALIDATION.md)

**Audit:** .planning/milestones/v1.4-MILESTONE-AUDIT.md (status: tech_debt, 38/38 requirements satisfied, 8/9 phases Nyquist compliant)

---

## v1.3 Voter Model & Import Enhancement (Shipped: 2026-03-15)

**Phases completed:** 7 phases, 18 plans
**Timeline:** 3 days (2026-03-13 → 2026-03-15)
**Files modified:** 45 | **Lines added:** 6,771 | **Commits:** 104
**Git range:** `feat(23-01)` → `feat(29-02)`

**Key accomplishments:**

1. Expanded voter model with 22 new first-class columns (propensity scores, mailing address, demographics, household data, military status) via single Alembic migration with indexes
2. Enhanced import pipeline — auto-VoterPhone creation via RETURNING clause, voting history parsing from L2 General/Primary columns, propensity percentage parsing, fixed upsert SET clause bug
3. Extended composable filter system with 15 new query conditions (propensity ranges, demographic multi-select, mailing address exact-match) plus backward-compatible year-only voting history expansion
4. Complete frontend overhaul — voter detail page with 7 organized cards, accordion filter builder with dual-handle sliders and dynamic checkboxes, expanded edit sheet with 27 fields, grouped column mapping dropdown
5. End-to-end filter wiring via POST /voters/search with Literal-validated sort_by, dynamic cursor pagination, and Playwright E2E tests for all filter dimensions
6. 23-dimension filter chip system with category colors, ImportJob type alignment, registration county UI, and sort_by type narrowing

**Tech debt accepted:** 3 human verification items — live L2 import with phone/voting-history/propensity, propensity badge colors and slider interaction, chip category colors and tooltip hover

**Audit:** .planning/milestones/v1.3-MILESTONE-AUDIT.md (status: tech_debt, 27/27 requirements satisfied, 6/6 phases Nyquist compliant)

---

## v1.2 Full UI (Shipped: 2026-03-13)

**Phases completed:** 11 phases, 43 plans
**Timeline:** 4 days (2026-03-10 → 2026-03-13)
**Files modified:** 335 | **Lines added:** 61,034 | **Frontend LOC:** 30,691 TypeScript | **Commits:** 224
**Git range:** `feat(12-01)` → `feat(22-01)`

**Key accomplishments:**

1. Shared UI infrastructure — RequireRole permission gating, useFormGuard navigation protection, and reusable DataTable with server-side sorting/filtering/pagination powering all 11 phases
2. Complete voter CRM — Contacts (phone/email/address), tags, static/dynamic lists, advanced search with 19 composable filter dimensions, interaction notes, and multi-step CSV import wizard with column mapping
3. Full phone banking workflow — Session management, Popover+Command member picker for caller assignment, active calling screen with claim/record/skip lifecycle, grouped outcome buttons, inline survey support, and progress dashboards
4. Volunteer & shift management — Filterable roster, dual-mode self-registration, availability slots, campaign tags, hours tracking, shift scheduling with date-grouped cards, check-in/out, roster view, and hours adjustment
5. Call list & DNC management — Call list CRUD with DNC filtering, entry status tracking, bulk DNC import with reason column, and client-side DNC search
6. Integration polish & full verification — 66/66 requirements verified across 3 sources, all 11 phases Nyquist compliant, member name resolution in all views, RequireRole gates on all mutation paths

**Tech debt accepted:** 7 low-severity items — IMPT-03 wording (drag-and-drop vs dropdown), inline useQuery for survey script, PHON-10 reassign UX limited, orphaned top-level components, dual nav overlap, REQUIREMENTS.md count label, 7 SUMMARY frontmatter gaps

**Audit:** .planning/milestones/v1.2-MILESTONE-AUDIT.md (status: passed, 66/66 requirements satisfied, Nyquist compliant)

---

## v1.1 Local Dev & Deployment Readiness (Shipped: 2026-03-10)

**Phases completed:** 4 phases, 7 plans
**Timeline:** 2 days (2026-03-08 → 2026-03-10)
**Files modified:** 20 | **Lines added:** 1,512 | **Commits:** 40
**Git range:** `e246c98` → `f25eb0d`

**Key accomplishments:**

1. Three-stage Docker build (node/uv/python-slim) producing 485MB production image with liveness/readiness health probes and conditional SPA static file serving
2. Docker Compose full-stack dev environment (API + PostgreSQL/PostGIS + MinIO) with auto-migrations, MinIO bucket bootstrap, and Vite hot-reload proxy
3. Idempotent Macon-Bibb County seed data script with 50 voters, campaigns, turfs, walk lists, surveys, phone banks, shifts, and 35+ voter interactions
4. GitHub Actions CI/CD: PR validation workflow (lint, test, frontend, docker-build gates) + GHCR publish workflow with SHA/latest tags and K8s manifest auto-update
5. Kubernetes manifests: Deployment with init container for Alembic migrations, ClusterIP Service, ConfigMap, and Secret template with 11 documented keys
6. Traefik IngressRoute (HTTP via Cloudflare TLS termination) and ArgoCD Application with selfHeal/prune for zero-touch GitOps deployment

**Audit:** .planning/milestones/v1.1-MILESTONE-AUDIT.md (status: passed, 15/15 requirements satisfied)

---

## v1.0 CivicPulse Run API MVP (Shipped: 2026-03-10)

**Phases completed:** 7 phases, 20 plans
**Timeline:** 2 days (2026-03-08 → 2026-03-10)
**Codebase:** 56,653 LOC Python, 243 files

**Key accomplishments:**

1. ZITADEL OIDC authentication with JWT/JWKS validation, campaign CRUD with compensating transactions, and PostgreSQL RLS-based multi-tenant data isolation
2. Full voter CRM with CSV import pipeline (RapidFuzz field mapping), composable search/filter query builder, tags, static/dynamic voter lists, and append-only interaction history
3. PostGIS-powered canvassing with geographic turf cutting, household-clustered walk lists, door-knock recording, and a reusable survey engine
4. Phone banking with call list generation (DNC filtering, claim-on-fetch), call recording with survey reuse, and auto-DNC on refused outcomes
5. Volunteer management with shift scheduling, self-signup with waitlists, cross-domain check-in (auto-creates canvasser/caller records), and hours tracking
6. Operational dashboards with aggregation endpoints for canvassing, phone banking, and volunteer activity with drilldowns and cursor pagination
7. Integration wiring fixes: ZitadelService lifespan init with fail-fast validation, phone banking model Alembic discovery

**Tech debt accepted:** 18 items — all integration/E2E tests written but not executed against live infrastructure (PostgreSQL, PostGIS, MinIO, ZITADEL, TaskIQ)

**Audit:** .planning/milestones/v1.0-MILESTONE-AUDIT.md (status: tech_debt, 39/39 requirements satisfied)

---
