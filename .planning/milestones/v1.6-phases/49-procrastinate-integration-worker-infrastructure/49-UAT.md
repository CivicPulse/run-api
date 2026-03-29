---
status: complete
phase: 49-procrastinate-integration-worker-infrastructure
source: [49-01-SUMMARY.md, 49-02-SUMMARY.md, 49-03-SUMMARY.md]
started: "2026-03-29T12:00:00Z"
updated: "2026-03-29T12:05:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. Procrastinate App singleton exists and is properly configured
expected: app/tasks/procrastinate_app.py exports a procrastinate_app using PsycopgConnector with search_path pointing to procrastinate schema
result: pass

### 2. Import task registered with Procrastinate decorator
expected: @procrastinate_app.task(name='process_import', queue='imports') on async function with campaign_id parameter for RLS bootstrap
result: pass

### 3. confirm_mapping endpoint returns 202 Accepted
expected: POST /campaigns/{id}/imports/{id}/confirm returns HTTP 202 (not 200 or 201)
result: pass

### 4. 409 Conflict returned on duplicate import queue submission
expected: When AlreadyEnqueued is raised by Procrastinate (queueing_lock already held), endpoint returns 409
result: pass

### 5. Immediate API response while import processes in background
expected: confirm_mapping defers work via Procrastinate and returns immediately (202) — no blocking processing in the request handler
result: pass

### 6. Job durability on worker restart (PostgreSQL-backed queue)
expected: Jobs survive worker pod kill/restart because they are stored in PostgreSQL, not in-memory
result: pass

### 7. Worker runs as separate container using same image with different entrypoint
expected: docker-compose.yml has a 'worker' service that uses the same build target as 'api' but with command: ['python', 'scripts/worker.py']
result: pass

### 8. Worker script exists with HTTP health endpoint on port 8001
expected: scripts/worker.py exists, starts asyncio TCP server on port 8001 responding to /healthz, then calls run_worker_async
result: pass

### 9. Kubernetes worker Deployment manifests exist for dev and prod
expected: k8s/apps/run-api-dev/worker-deployment.yaml and k8s/apps/run-api-prod/worker-deployment.yaml exist with liveness/readiness probes on port 8001
result: pass

### 10. TaskIQ fully removed from codebase and dependency tree
expected: No taskiq imports in app/, no taskiq in pyproject.toml or uv.lock, broker.py deleted
result: pass

### 11. Procrastinate wired into FastAPI lifespan
expected: app/main.py lifespan uses procrastinate_app.open_async() context manager
result: pass

### 12. Procrastinate schema migration exists
expected: alembic/versions/017_procrastinate_schema.py creates 'procrastinate' schema with all required tables, types, and functions
result: pass

### 13. worker.py included in production Dockerfile runtime stage
expected: Dockerfile runtime stage COPYs scripts/worker.py so the production image can run the worker
result: pass

## Summary

total: 13
passed: 13
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
