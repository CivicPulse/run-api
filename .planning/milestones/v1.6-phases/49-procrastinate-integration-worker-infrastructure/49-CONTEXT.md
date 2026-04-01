# Phase 49: Procrastinate Integration & Worker Infrastructure - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace TaskIQ (InMemoryBroker) with Procrastinate (PostgreSQL-backed task queue) so import jobs survive pod restarts. Deploy the worker as a separate container in both Docker Compose and Kubernetes, using the same image with a different entrypoint. Change confirm-mapping endpoint to return 202 Accepted. Remove TaskIQ from the codebase entirely.

</domain>

<decisions>
## Implementation Decisions

### Schema Management
- **D-01:** Procrastinate's schema SQL is dumped into an Alembic migration — single migration tool owns all schema changes, consistent with existing pattern
- **D-02:** Procrastinate tables live in a separate `procrastinate` schema, not `public` — clean separation from domain tables, avoids namespace collisions with RLS policies

### Worker Entrypoint & Health
- **D-03:** Worker starts via a programmatic script (`scripts/worker.py`) that initializes Sentry + structlog, creates the ProcrastinateApp with PsycopgConnector, and calls `run_worker_async()` — matches existing application factory pattern for resource initialization
- **D-04:** Worker exposes an HTTP health endpoint (e.g., `:8001/healthz`) for K8s liveness/readiness probes — standard K8s pattern, detects hung workers

### Queueing Lock Strategy
- **D-05:** Import tasks use `queueing_lock=str(campaign_id)` when deferring — Procrastinate rejects a second import for the same campaign while one is queued/running. Foundation for Phase 53's cancellation feature
- **D-06:** When a second import is rejected by the lock, the API returns 409 Conflict with message "An import is already in progress for this campaign" — consistent with existing 409 usage in confirm_mapping

### Job State Reconciliation
- **D-07:** `ImportJob.status` remains the single source of truth for business status — task updates ImportJob status at each lifecycle point (QUEUED→PROCESSING→COMPLETED/FAILED). Procrastinate's internal state is infrastructure-only, not exposed to the API
- **D-08:** `confirm_mapping` endpoint changes from 201 Created to 202 Accepted per BGND-01 — signals the job is queued but not yet complete

### Claude's Discretion
- PsycopgConnector connection pool sizing and configuration
- Exact Procrastinate queue naming convention
- Worker graceful shutdown signal handling details
- Docker Compose worker service resource limits
- K8s worker Deployment replica count and resource requests/limits
- How to structure the Procrastinate App singleton (module-level vs factory)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Import Infrastructure
- `app/tasks/broker.py` — Current TaskIQ InMemoryBroker to be replaced
- `app/tasks/import_task.py` — Current `process_import()` task that creates own session, sets RLS, delegates to ImportService
- `app/api/v1/imports.py` — Import API endpoints, especially `confirm_mapping` which dispatches the task via `.kiq()`
- `app/models/import_job.py` — ImportJob model with ImportStatus enum (PENDING, UPLOADED, QUEUED, PROCESSING, COMPLETED, FAILED)
- `app/services/import_service.py` — ImportService with `process_import_file()` method
- `app/db/rls.py` — `set_campaign_context()` helper using `set_config()` scoped to transaction

### Deployment
- `Dockerfile` — Multi-stage build with dev and prod targets; worker needs a new entrypoint
- `docker-compose.yml` — Currently has `api` service only; needs new `worker` service
- `k8s/apps/run-api-dev/deployment.yaml` — Dev K8s deployment; needs worker Deployment manifest
- `k8s/apps/run-api-prod/deployment.yaml` — Prod K8s deployment; needs worker Deployment manifest

### Application Lifecycle
- `app/main.py` — Lifespan function that starts/stops TaskIQ broker; needs Procrastinate App init instead
- `pyproject.toml` — TaskIQ dependencies (`taskiq>=0.12.1`, `taskiq-fastapi>=0.4.0`) to be removed, Procrastinate added

### Requirements
- `.planning/REQUIREMENTS.md` — BGND-01 (202 Accepted), BGND-02 (Procrastinate replaces TaskIQ), MEMD-02 (worker as separate container)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/db/session.py` — `async_session_factory` used by import_task for creating standalone sessions outside request lifecycle
- `app/db/rls.py:set_campaign_context()` — RLS helper; worker task will continue using this
- `app/core/config.py` — Settings class with DATABASE_URL; worker needs same DB connection
- `app/services/import_service.py` — ImportService is stateless, can be called from Procrastinate task unchanged

### Established Patterns
- Application factory in `app/main.py` with async lifespan for resource init/teardown
- Module-level service singletons in route files (e.g., `_service = ImportService()`)
- Alembic migrations in `alembic/` with async engine via asyncpg
- Sentry + structlog initialization in main app startup

### Integration Points
- `confirm_mapping` endpoint: swap `process_import.kiq()` → Procrastinate `defer_async()`
- `app/main.py` lifespan: replace broker startup/shutdown with Procrastinate App open/close
- Docker Compose: add worker service sharing same image, different command
- K8s: add worker Deployment manifests in dev and prod

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 49-procrastinate-integration-worker-infrastructure*
*Context gathered: 2026-03-28*
