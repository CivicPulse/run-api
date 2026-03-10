# Roadmap: CivicPulse Run API

## Milestones

- v1.0 MVP - Phases 1-7 (shipped 2026-03-10)
- v1.1 Local Dev & Deployment Readiness - Phases 8-11 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-7) - SHIPPED 2026-03-10</summary>

- [x] Phase 1: Authentication and Multi-Tenancy (3/3 plans) - completed 2026-03-09
- [x] Phase 2: Voter Data Import and CRM (4/4 plans) - completed 2026-03-09
- [x] Phase 3: Canvassing Operations (4/4 plans) - completed 2026-03-09
- [x] Phase 4: Phone Banking (3/3 plans) - completed 2026-03-09
- [x] Phase 5: Volunteer Management (3/3 plans) - completed 2026-03-09
- [x] Phase 6: Operational Dashboards (2/2 plans) - completed 2026-03-09
- [x] Phase 7: Integration Wiring Fixes (1/1 plan) - completed 2026-03-10

See: `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

### v1.1 Local Dev & Deployment Readiness (In Progress)

**Milestone Goal:** Make the v1.0 API runnable end-to-end locally via Docker Compose and ready for K8s deployment to baremetal cluster via GHCR images and plain manifests.

- [x] **Phase 8: Containerization** - Production Dockerfile with multi-stage build, health check, and proper ignore rules
- [x] **Phase 9: Local Dev Environment** - Docker Compose full-stack dev with migrations, hot-reload, and seed data (completed 2026-03-10)
- [x] **Phase 10: CI/CD Pipeline** - GitHub Actions workflow for GHCR image publishing with SHA tagging (completed 2026-03-10)
- [ ] **Phase 11: Kubernetes & GitOps** - K8s manifests and ArgoCD application for baremetal deployment

## Phase Details

### Phase 8: Containerization
**Goal**: A production-ready container image exists that packages the API and web frontend into a single deployable artifact
**Depends on**: Nothing (first phase of v1.1; uses existing v1.0 codebase)
**Requirements**: CTR-01, CTR-02, CTR-03
**Success Criteria** (what must be TRUE):
  1. `docker build` produces a working image that serves both the API and web frontend on a single port
  2. `GET /health` returns a successful response from the running container
  3. The built image excludes tests, `.planning`, `.git`, `node_modules`, and dev artifacts (verified by inspecting image contents)
**Plans:** 2/2 plans executed

Plans:
- [x] 08-01-PLAN.md — Health endpoints, Alembic container fix, and .dockerignore
- [x] 08-02-PLAN.md — Multi-stage Dockerfile and SPA static file serving

### Phase 9: Local Dev Environment
**Goal**: A developer can clone the repo and have a fully working local stack in one command, with hot-reload and realistic test data
**Depends on**: Phase 8 (uses the Dockerfile for the API container)
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04
**Success Criteria** (what must be TRUE):
  1. `docker compose up` starts API, PostgreSQL+PostGIS, and MinIO with no manual setup steps
  2. The database has up-to-date schema on first start (Alembic migrations run automatically on API container start)
  3. Vite dev server with hot-reload works against the dockerized API backend (frontend changes reflect without restart)
  4. After running the seed script, the developer can browse sample campaigns, voters, and related data via API calls
**Plans:** 2/2 plans complete

Plans:
- [x] 09-01-PLAN.md — Docker Compose API service, dev entrypoint, and Vite proxy config
- [x] 09-02-PLAN.md — Macon-Bibb County seed data script

### Phase 10: CI/CD Pipeline
**Goal**: Every push to main automatically builds and publishes a tagged container image to GHCR
**Depends on**: Phase 8 (workflow builds the Dockerfile)
**Requirements**: CICD-01, CICD-02, CICD-03
**Success Criteria** (what must be TRUE):
  1. Pushing a commit to main triggers a GitHub Actions workflow that builds and pushes an image to GHCR
  2. Published images are tagged with both `sha-<commit>` and `latest`
  3. The workflow automatically updates `k8s/deployment.yaml` with the new image SHA and commits the change back to the repo
**Plans:** 1/1 plans complete

Plans:
- [x] 10-01-PLAN.md — PR validation workflow, GHCR publish workflow, and stub K8s manifest

### Phase 11: Kubernetes & GitOps
**Goal**: Complete K8s manifests and ArgoCD config exist so the API can be deployed to a baremetal cluster by applying manifests
**Depends on**: Phase 10 (images must be in GHCR; deployment.yaml updated by CI)
**Requirements**: K8S-01, K8S-02, K8S-03, K8S-04, K8S-05
**Success Criteria** (what must be TRUE):
  1. Deployment manifest includes an init container for Alembic migrations and configures liveness/readiness probes pointing to `/health`
  2. A ClusterIP Service exposes the API on port 8000 and a Traefik IngressRoute routes external traffic to it
  3. A Secret template YAML documents every required secret with ready-to-use `kubectl create secret` commands
  4. An ArgoCD Application manifest exists that points to the `k8s/` directory with automated sync enabled
**Plans:** 2 plans

Plans:
- [ ] 11-01-PLAN.md — Core workload manifests (Deployment, Service, ConfigMap, Secret template)
- [ ] 11-02-PLAN.md — Traefik IngressRoute and ArgoCD Application

## Progress

**Execution Order:**
Phases execute in numeric order: 8 -> 9 -> 10 -> 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Authentication and Multi-Tenancy | v1.0 | 3/3 | Complete | 2026-03-09 |
| 2. Voter Data Import and CRM | v1.0 | 4/4 | Complete | 2026-03-09 |
| 3. Canvassing Operations | v1.0 | 4/4 | Complete | 2026-03-09 |
| 4. Phone Banking | v1.0 | 3/3 | Complete | 2026-03-09 |
| 5. Volunteer Management | v1.0 | 3/3 | Complete | 2026-03-09 |
| 6. Operational Dashboards | v1.0 | 2/2 | Complete | 2026-03-09 |
| 7. Integration Wiring Fixes | v1.0 | 1/1 | Complete | 2026-03-10 |
| 8. Containerization | v1.1 | 2/2 | Complete | 2026-03-10 |
| 9. Local Dev Environment | v1.1 | 2/2 | Complete | 2026-03-10 |
| 10. CI/CD Pipeline | v1.1 | 1/1 | Complete | 2026-03-10 |
| 11. Kubernetes & GitOps | v1.1 | 0/2 | Not started | - |
