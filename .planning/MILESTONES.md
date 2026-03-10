# Milestones

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

