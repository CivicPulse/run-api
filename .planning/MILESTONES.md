# Milestones

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

