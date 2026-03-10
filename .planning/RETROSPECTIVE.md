# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — CivicPulse Run API MVP

**Shipped:** 2026-03-10
**Phases:** 7 | **Plans:** 20

### What Was Built
- Full campaign management API with ZITADEL OIDC auth, RLS multi-tenancy, and role-based access control
- Voter CRM with CSV import pipeline (RapidFuzz field mapping), composable search/filter, tags, lists, and interaction history
- PostGIS canvassing operations: turf cutting, household-clustered walk lists, door-knock tracking, reusable survey engine
- Phone banking: call lists with DNC filtering, claim-on-fetch, call recording with survey reuse, auto-DNC
- Volunteer management: shift scheduling, waitlists, cross-domain check-in, hours tracking
- Operational dashboards with aggregation endpoints and cursor-paginated drilldowns
- Integration wiring fixes: ZitadelService lifespan init, Alembic model discovery

### What Worked
- Phase-by-phase execution with verifier agents kept quality high — all 7 phases passed verification
- Reusable survey engine pattern (Phase 3 → Phase 4) avoided code duplication
- Composition pattern for services (VoterInteractionService, SurveyService, DNCService) kept coupling clean
- native_enum=False convention avoided future migration pain
- Wave 0 test stubs (Phase 3) established test-first scaffolding pattern
- Milestone audit caught two real integration gaps (INT-01, INT-02) that Phase 7 fixed before shipping

### What Was Inefficient
- ROADMAP.md plan checkboxes not updated during execution (Phases 1-2 show `[ ]` despite being complete)
- Integration tests written but never executed against live infrastructure — 18 tech debt items accumulated
- Phase 2 progress table showed "3/4 In Progress" despite being complete
- Nyquist validation enabled but never run for any phase (all 7 in draft status)

### Patterns Established
- Services compose other services via constructor injection (no inheritance)
- RLS subquery pattern for child tables without direct campaign_id FK
- Late imports at call site for cross-phase model references
- StrEnum columns with native_enum=False for extensibility
- Cursor pagination via UUID comparison (not offset-based)
- Interaction events as shared data backbone across domains

### Key Lessons
1. Run milestone audit before declaring done — it caught real runtime wiring gaps
2. Integration tests need to run against live infrastructure at some point; deferring all of them accumulates significant tech debt
3. The survey engine reuse pattern proved the value of designing Phase 3 models without canvassing-specific FKs

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for planning/auditing
- Timeline: 2 days from initial commit to milestone completion
- Notable: 56K LOC across 20 plans with high consistency in patterns

---

## Milestone: v1.1 — Local Dev & Deployment Readiness

**Shipped:** 2026-03-10
**Phases:** 4 | **Plans:** 7

### What Was Built
- Three-stage Docker build (node/uv/python-slim) producing 485MB production image with health probes
- Docker Compose full-stack dev environment with auto-migrations, MinIO bootstrap, Vite hot-reload proxy
- Idempotent seed data script with Macon-Bibb County demo data (50 voters, campaigns, turfs, interactions)
- GitHub Actions CI/CD: PR validation gates + GHCR publish with SHA/latest tags and K8s manifest auto-update
- Kubernetes manifests: Deployment with init container migrations, ClusterIP Service, ConfigMap, Secret template
- Traefik IngressRoute and ArgoCD Application for zero-touch GitOps deployment

### What Worked
- Milestone audit caught zero gaps — clean pass on all 15 requirements, 12 integration points, 3 E2E flows
- Cross-phase consistency: same Alembic pattern used in dev-entrypoint (P9) and K8s init container (P11)
- CI infinite-loop prevention designed correctly on first attempt (GITHUB_TOKEN commits don't re-trigger)
- Phase dependencies cleanly layered: P8 → P9 (compose), P8 → P10 (CI), P10 → P11 (K8s)

### What Was Inefficient
- ROADMAP.md Phase 11 plan checkboxes not updated (show `[ ]` despite being complete)
- ROADMAP.md Phase 11 progress table row had malformed columns
- Nyquist validation still not run — phases 9, 10 missing VALIDATION.md entirely
- Summary files lack `one_liner` field, requiring manual extraction during milestone completion

### Patterns Established
- Three-stage Docker build pattern: node frontend → uv Python deps → python-slim runtime
- Dev entrypoint pattern: wait-for-it + alembic upgrade + boto3 bucket init
- CI separation: PR workflow for quality gates, publish workflow for image delivery
- K8s manifest pattern: init container for migrations, envFrom for config/secrets, .yaml.example for templates

### Key Lessons
1. Summary files should include a `one_liner` field for automated extraction during milestone completion
2. ROADMAP.md checkbox and progress table updates should be part of plan completion workflow
3. Infrastructure-as-code phases execute cleanly because they have minimal runtime dependencies to test

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for planning/auditing
- Timeline: Same day as v1.0 completion — fast iteration on infra phases
- Notable: 1,512 lines of Docker/CI/K8s config across 7 plans with zero test failures

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 20 | Established GSD workflow with phase verification and milestone audit |
| v1.1 | 4 | 7 | Infrastructure-as-code phases; clean milestone audit (zero gaps) |

### Cumulative Quality

| Milestone | Unit Tests | Integration Tests | LOC |
|-----------|------------|-------------------|-----|
| v1.0 | 236+ passing | 24+ written (not executed) | 56,653 |
| v1.1 | 268 passing | — | +1,512 (infra) |

### Top Lessons (Verified Across Milestones)

1. Design models for cross-phase reuse from the start (survey engine, interaction events)
2. Run integration tests against live infrastructure — deferred testing is deferred risk
3. Run milestone audit before declaring done — catches real gaps (v1.0) and confirms completeness (v1.1)
4. Keep ROADMAP.md checkboxes and progress table updated during execution — manual fixups during archival are wasteful
