# Requirements: CivicPulse Run API

**Defined:** 2026-03-10
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.1 Requirements

Requirements for Local Dev & Deployment Readiness milestone.

### Local Dev Environment

- [x] **DEV-01**: Developer can start full stack (API, PostgreSQL+PostGIS, MinIO) with `docker compose up`
- [x] **DEV-02**: Alembic migrations run automatically on API container start
- [x] **DEV-03**: Developer can run Vite dev server with hot-reload proxied to dockerized API
- [x] **DEV-04**: Seed data script populates sample campaign, voters, and related data for testing

### Containerization

- [x] **CTR-01**: Multi-stage Dockerfile builds web frontend and Python API into single production image
- [x] **CTR-02**: Health check endpoint (`GET /health`) available for container and K8s probes
- [x] **CTR-03**: `.dockerignore` excludes tests, `.planning`, `.git`, `node_modules`, and dev artifacts

### CI/CD

- [ ] **CICD-01**: GitHub Actions workflow builds and pushes image to GHCR on push to main
- [ ] **CICD-02**: Images tagged with `sha-<commit>` and `latest`, matching contact-api pattern
- [ ] **CICD-03**: Workflow updates `k8s/deployment.yaml` with new image SHA and commits back

### Kubernetes

- [ ] **K8S-01**: Deployment manifest with init container for Alembic migrations, liveness/readiness probes
- [ ] **K8S-02**: ClusterIP Service exposing API on port 8000
- [ ] **K8S-03**: Traefik IngressRoute for external access
- [ ] **K8S-04**: Secret template YAML with documented `kubectl create secret` commands for all required secrets
- [ ] **K8S-05**: ArgoCD Application manifest with automated sync from `k8s/` directory

## Future Requirements

Deferred from v1.0 Active list. Not in current roadmap.

### Feature Enhancements

- **FEAT-01**: Branched survey scripts with conditional logic
- **FEAT-02**: GPS-optimized canvassing route suggestions
- **FEAT-03**: Real-time canvassing monitoring (live canvasser status)
- **FEAT-04**: Offline sync API pattern (changes-since + batch upload)
- **FEAT-05**: Voter deduplication across import sources
- **FEAT-06**: State-specific voter file import adapters
- **FEAT-07**: Event management (CRUD, RSVP, volunteer assignment)
- **FEAT-08**: Email/SMS integration endpoints (webhook-based)
- **FEAT-09**: OSDI-compliant API endpoints for interoperability

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Actual cluster deployment | Manifests only; deployment is a separate operational step |
| Helm/Kustomize | Plain manifests following contact-api pattern |
| Local ZITADEL instance | Use existing dev org at auth.civpulse.org |
| Donation management / Stripe | FEC compliance extremely complex, defer |
| Predictive dialer / telephony | Requires Twilio/TCPA/FCC compliance |
| Email/SMS delivery engine | Building deliverability infra is a separate product |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CTR-01 | Phase 8 | Complete |
| CTR-02 | Phase 8 | Complete |
| CTR-03 | Phase 8 | Complete |
| DEV-01 | Phase 9 | Complete |
| DEV-02 | Phase 9 | Complete |
| DEV-03 | Phase 9 | Complete |
| DEV-04 | Phase 9 | Complete |
| CICD-01 | Phase 10 | Pending |
| CICD-02 | Phase 10 | Pending |
| CICD-03 | Phase 10 | Pending |
| K8S-01 | Phase 11 | Pending |
| K8S-02 | Phase 11 | Pending |
| K8S-03 | Phase 11 | Pending |
| K8S-04 | Phase 11 | Pending |
| K8S-05 | Phase 11 | Pending |

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
