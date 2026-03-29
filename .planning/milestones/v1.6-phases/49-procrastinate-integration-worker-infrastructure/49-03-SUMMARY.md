---
phase: 49-procrastinate-integration-worker-infrastructure
plan: 03
subsystem: infra
tags: [procrastinate, worker, docker-compose, kubernetes, health-check, asyncio]

# Dependency graph
requires:
  - phase: 49-01
    provides: Procrastinate App singleton (app/tasks/procrastinate_app.py)
provides:
  - Worker entrypoint script with health endpoint (scripts/worker.py)
  - Docker Compose worker service (run-api-worker)
  - K8s worker Deployment for dev (civpulse-dev)
  - K8s worker Deployment for prod (civpulse-prod)
  - Production Dockerfile with worker script
affects: [50 (import pipeline uses worker), deployment (new container to deploy)]

# Tech tracking
tech-stack:
  added: []
  patterns: [raw asyncio.start_server health endpoint, separate worker container sharing same image]

key-files:
  created:
    - scripts/worker.py
    - k8s/apps/run-api-dev/worker-deployment.yaml
    - k8s/apps/run-api-prod/worker-deployment.yaml
  modified:
    - docker-compose.yml
    - Dockerfile

key-decisions:
  - "Raw asyncio.start_server for health endpoint (no new HTTP dependencies needed)"
  - "Worker depends_on api service_started to ensure migrations run first"
  - "Worker only mounts app/ and scripts/ volumes (no alembic, static, certs)"

patterns-established:
  - "Worker health endpoint: raw TCP server on port 8001 responding to /healthz"
  - "Worker container pattern: same image, command override to python scripts/worker.py"
  - "K8s worker Deployment: no initContainers (migrations run in API pod)"

requirements-completed: [MEMD-02]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 49 Plan 03: Worker Deployment Summary

**Procrastinate worker as standalone container with asyncio health endpoint on port 8001, Docker Compose service, and K8s Deployments for dev/prod**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T21:16:30Z
- **Completed:** 2026-03-28T21:19:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created worker entrypoint script with Sentry/loguru init, Procrastinate worker loop, and HTTP health endpoint
- Added Docker Compose worker service sharing same image with API, depending on postgres (healthy) and api (started)
- Created K8s worker Deployments for civpulse-dev and civpulse-prod with liveness/readiness probes on port 8001
- Updated Dockerfile runtime stage to include worker script for production builds

## Task Commits

Each task was committed atomically:

1. **Task 1: Create worker entrypoint script with HTTP health endpoint** - `ec5f236` (feat)
2. **Task 2: Add Docker Compose worker service and K8s worker Deployment manifests** - `4d53528` (feat)

## Files Created/Modified
- `scripts/worker.py` - Standalone worker entrypoint with Sentry init, health server on 8001, Procrastinate worker loop
- `docker-compose.yml` - Added worker service with same build target, scripts/worker.py command, postgres/api dependencies
- `Dockerfile` - Added COPY scripts/worker.py to runtime stage for production image
- `k8s/apps/run-api-dev/worker-deployment.yaml` - K8s Deployment for civpulse-dev with health probes on 8001
- `k8s/apps/run-api-prod/worker-deployment.yaml` - K8s Deployment for civpulse-prod with ENVIRONMENT=production

## Decisions Made
- Used raw `asyncio.start_server` for health endpoint to avoid adding aiohttp or similar dependency
- Worker depends on api `service_started` (not `service_healthy`) since the API entrypoint runs Alembic migrations
- Worker mounts only `./app` and `./scripts` volumes -- no need for alembic, static, certs, or zitadel-data
- No port mapping for worker in Docker Compose since health endpoint is only needed for K8s probes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed ruff lint errors in worker.py**
- **Found during:** Task 1 (worker script creation)
- **Issue:** E402 (imports after sys.path manipulation), SIM105 (try/except/pass to contextlib.suppress), UP041 (asyncio.TimeoutError to TimeoutError)
- **Fix:** Added `# noqa: E402` for intentional late imports, replaced try/except with `contextlib.suppress(TimeoutError)`
- **Files modified:** scripts/worker.py
- **Verification:** `uv run ruff check scripts/worker.py` passes clean
- **Committed in:** ec5f236 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking - ruff lint)
**Impact on plan:** Standard lint compliance fix. No scope creep.

## Issues Encountered
None

## Known Stubs
None - all code is fully wired with no placeholders.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Worker script is ready to run via `python scripts/worker.py` (or Docker Compose `worker` service)
- Docker Compose `docker compose up -d` will now start worker alongside api and web
- K8s manifests are ready for ArgoCD deployment (image tag will be updated by CI)
- Phase 49 plans 01-03 complete: Procrastinate infrastructure, API integration (02), and worker deployment (03)

## Self-Check: PASSED

- All 3 created files exist on disk (scripts/worker.py, dev/worker-deployment.yaml, prod/worker-deployment.yaml)
- Both commit hashes (ec5f236, 4d53528) found in git log
- docker-compose.yml contains run-api-worker service
- Dockerfile runtime stage includes scripts/worker.py
- All verification commands pass

---
*Phase: 49-procrastinate-integration-worker-infrastructure*
*Completed: 2026-03-28*
