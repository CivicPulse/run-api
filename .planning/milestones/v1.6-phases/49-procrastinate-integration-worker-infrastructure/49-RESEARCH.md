# Phase 49: Procrastinate Integration & Worker Infrastructure - Research

**Researched:** 2026-03-28
**Domain:** Background task processing (PostgreSQL-backed job queue), container deployment
**Confidence:** HIGH

## Summary

Phase 49 replaces the current TaskIQ InMemoryBroker with Procrastinate, a PostgreSQL-backed task queue, and deploys the worker as a separate container. The existing codebase has a clean TaskIQ integration surface (3 files: `broker.py`, `import_task.py`, `main.py` lifespan) making the swap well-scoped. Procrastinate v3.7.3 uses `psycopg` (v3) with `psycopg_pool` for async connection pooling -- this is a NEW dependency since the project currently uses `asyncpg` (for SQLAlchemy) and `psycopg2-binary` (for Alembic sync). The two can coexist without conflict.

The `confirm_mapping` endpoint currently dispatches via `process_import.kiq()` (TaskIQ) and returns 201. This changes to Procrastinate `defer_async()` with `queueing_lock=str(campaign_id)` and returns 202. The worker runs as an independent process via `scripts/worker.py`, using the same Docker image with a different entrypoint command. Schema is owned by Alembic via a migration that runs raw SQL from Procrastinate's `schema.sql`.

**Primary recommendation:** Install `procrastinate>=3.7.3`, create the Procrastinate App as a module-level singleton with `PsycopgConnector`, open it in FastAPI lifespan for deferring from the API, and run `app.run_worker_async()` in the standalone worker script. Use `queueing_lock=str(campaign_id)` for per-campaign duplicate prevention. Dump Procrastinate's schema SQL into an Alembic migration with `CREATE SCHEMA procrastinate` and `SET search_path` before execution.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Procrastinate's schema SQL is dumped into an Alembic migration -- single migration tool owns all schema changes, consistent with existing pattern
- **D-02:** Procrastinate tables live in a separate `procrastinate` schema, not `public` -- clean separation from domain tables, avoids namespace collisions with RLS policies
- **D-03:** Worker starts via a programmatic script (`scripts/worker.py`) that initializes Sentry + structlog, creates the ProcrastinateApp with PsycopgConnector, and calls `run_worker_async()` -- matches existing application factory pattern for resource initialization
- **D-04:** Worker exposes an HTTP health endpoint (e.g., `:8001/healthz`) for K8s liveness/readiness probes -- standard K8s pattern, detects hung workers
- **D-05:** Import tasks use `queueing_lock=str(campaign_id)` when deferring -- Procrastinate rejects a second import for the same campaign while one is queued/running. Foundation for Phase 53's cancellation feature
- **D-06:** When a second import is rejected by the lock, the API returns 409 Conflict with message "An import is already in progress for this campaign" -- consistent with existing 409 usage in confirm_mapping
- **D-07:** `ImportJob.status` remains the single source of truth for business status -- task updates ImportJob status at each lifecycle point (QUEUED->PROCESSING->COMPLETED/FAILED). Procrastinate's internal state is infrastructure-only, not exposed to the API
- **D-08:** `confirm_mapping` endpoint changes from 201 Created to 202 Accepted per BGND-01 -- signals the job is queued but not yet complete

### Claude's Discretion
- PsycopgConnector connection pool sizing and configuration
- Exact Procrastinate queue naming convention
- Worker graceful shutdown signal handling details
- Docker Compose worker service resource limits
- K8s worker Deployment replica count and resource requests/limits
- How to structure the Procrastinate App singleton (module-level vs factory)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BGND-01 | Import endpoint returns 202 Accepted immediately and processes the file in a background Procrastinate job | Procrastinate `defer_async()` returns immediately, endpoint changes status_code to 202. Verified async deferral API. |
| BGND-02 | Procrastinate replaces TaskIQ as the task queue, using existing PostgreSQL as job store | Procrastinate v3.7.3 with PsycopgConnector uses PostgreSQL directly. Schema managed via Alembic migration. TaskIQ removal scoped to 3 files. |
| MEMD-02 | Worker runs as a separate container (Docker Compose service + K8s Deployment) using the same image with a different entrypoint | Same Docker image, `command: ["python", "scripts/worker.py"]` as entrypoint. Docker Compose service + K8s Deployment manifests documented below. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` (not pip/poetry) -- `uv add procrastinate` to install
- **Python linting:** `uv run ruff check .` / `uv run ruff format .` before commits
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008)
- **Line length:** 88 chars
- **Tests:** `uv run pytest` (asyncio_mode=auto)
- **Migrations:** Alembic async via asyncpg (existing pattern)
- **Never use system python** -- all commands prefixed with `uv run`
- **Git:** Conventional Commits, commit after each task

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| procrastinate | 3.7.3 | PostgreSQL-backed task queue | Uses existing PG, no Redis needed, native async, queueing locks built-in |
| psycopg[pool] | (transitive) | Procrastinate's PostgreSQL driver | Required by procrastinate, psycopg v3 with AsyncConnectionPool |

### Supporting (already in project)
| Library | Version | Purpose | Stays/Changes |
|---------|---------|---------|---------------|
| asyncpg | 0.31.0 | SQLAlchemy async driver | Stays -- used by SQLAlchemy, independent of Procrastinate |
| psycopg2-binary | 2.9.11 | Alembic sync migrations | Stays -- used by Alembic offline mode |
| sqlalchemy | 2.0.48+ | ORM | Stays -- not used by Procrastinate directly |
| sentry-sdk[fastapi] | 2.19.0+ | Error tracking | Worker reuses `init_sentry()` |
| structlog | 24.4.0+ | Structured logging | Worker initializes structlog for log consistency |
| loguru | 0.7.3+ | Logging (used in 13 files) | Stays -- existing task code uses loguru |

### Removed
| Library | Why Removed |
|---------|-------------|
| taskiq>=0.12.1 | Replaced by procrastinate |
| taskiq-fastapi>=0.4.0 | Replaced by procrastinate |

**Installation:**
```bash
uv add "procrastinate>=3.7.3"
uv remove taskiq taskiq-fastapi
```

## Architecture Patterns

### Recommended Project Structure Changes
```
app/
  tasks/
    __init__.py          # (keep)
    broker.py            # DELETE (TaskIQ broker)
    import_task.py       # REWRITE (Procrastinate task)
    procrastinate_app.py # NEW: App singleton + connector factory
  main.py                # MODIFY: lifespan swap broker -> procrastinate
  api/v1/
    imports.py           # MODIFY: defer_async + 202 + 409

scripts/
  worker.py              # NEW: standalone worker process

alembic/versions/
  017_procrastinate_schema.py  # NEW: raw SQL migration

docker-compose.yml       # MODIFY: add worker service
k8s/apps/run-api-dev/
  worker-deployment.yaml # NEW
k8s/apps/run-api-prod/
  worker-deployment.yaml # NEW
```

### Pattern 1: Procrastinate App Singleton

**What:** Module-level App instance shared by both API (for deferring) and worker (for processing).
**When to use:** Always -- Procrastinate requires a single App to register tasks and defer jobs.

```python
# app/tasks/procrastinate_app.py
import procrastinate

from app.core.config import settings

def _make_conninfo() -> str:
    """Derive a standard PostgreSQL conninfo from the SQLAlchemy DATABASE_URL.

    Strips the '+asyncpg' dialect prefix and adds search_path for the
    procrastinate schema.
    """
    url = settings.database_url
    # postgresql+asyncpg://user:pass@host:port/db -> postgresql://user:pass@host:port/db
    url = url.replace("+asyncpg", "")
    return url

procrastinate_app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(
        conninfo=_make_conninfo(),
        kwargs={"options": "-c search_path=procrastinate,public"},
    ),
    import_paths=["app.tasks.import_task"],
)
```

**Key detail:** The `options` parameter sets `search_path` to `procrastinate,public` so Procrastinate finds its own tables in the `procrastinate` schema while the task code can still query `public` schema tables via SQLAlchemy (which has its own connection pool).

### Pattern 2: FastAPI Lifespan Integration

**What:** Open/close the Procrastinate app connection pool during FastAPI lifespan.
**When to use:** Required for the API process to defer jobs.

```python
# In app/main.py lifespan
from app.tasks.procrastinate_app import procrastinate_app

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing ZITADEL, storage init ...

    # Procrastinate (replaces broker.startup/shutdown)
    async with procrastinate_app.open_async():
        app.state.procrastinate_app = procrastinate_app
        yield

    # procrastinate_app.close_async() called automatically by context manager
```

### Pattern 3: Task Definition with Procrastinate

**What:** Register async tasks on the Procrastinate App with the `@app.task()` decorator.
**When to use:** For all background tasks.

```python
# app/tasks/import_task.py
from app.tasks.procrastinate_app import procrastinate_app

@procrastinate_app.task(name="process_import", queue="imports")
async def process_import(import_job_id: str, campaign_id: str) -> None:
    """Process a voter file import in the background.

    NOTE: campaign_id is passed explicitly as a task argument because
    the import_jobs table has RLS -- we need the campaign_id to set
    RLS context BEFORE we can query the ImportJob record.
    """
    # ... same logic as current import_task.py ...
```

**Critical detail from STATE.md blocker:** Worker needs `campaign_id` passed as a job argument to bootstrap RLS. The current task only receives `import_job_id` but needs campaign_id to set RLS context before querying the import_jobs table.

### Pattern 4: Deferring with Queueing Lock

**What:** Defer tasks with `queueing_lock` to prevent duplicate jobs per campaign.
**When to use:** In `confirm_mapping` endpoint.

```python
# In app/api/v1/imports.py confirm_mapping endpoint
from procrastinate.exceptions import AlreadyEnqueued
from app.tasks.import_task import process_import

try:
    await process_import.configure(
        queueing_lock=str(campaign_id),
    ).defer_async(
        import_job_id=str(import_id),
        campaign_id=str(campaign_id),
    )
except AlreadyEnqueued:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="An import is already in progress for this campaign",
    )
```

### Pattern 5: Standalone Worker Script

**What:** Programmatic worker entrypoint that initializes observability, creates the Procrastinate App, and runs the worker loop.
**When to use:** As the container entrypoint for the worker service.

```python
# scripts/worker.py
"""Procrastinate worker entrypoint.

Initializes Sentry + logging, then runs the async worker loop.
Run via: python scripts/worker.py
"""
import asyncio
import signal
from app.core.sentry import init_sentry
from app.tasks.procrastinate_app import procrastinate_app

async def main():
    init_sentry()
    # ... structlog/loguru init ...

    async with procrastinate_app.open_async():
        await procrastinate_app.run_worker_async(
            queues=["imports"],
            name="import-worker",
            install_signal_handlers=True,  # OK in standalone process
        )

if __name__ == "__main__":
    asyncio.run(main())
```

### Pattern 6: Worker Health Endpoint

**What:** Minimal HTTP health check for K8s probes on the worker container.
**When to use:** D-04 requires an HTTP health endpoint.

The worker itself does not serve HTTP. Two approaches:

**Option A (recommended): Lightweight aiohttp/uvicorn sidecar in same process.**
Add a tiny `asyncio.create_task()` in the worker script that serves `:8001/healthz` using a simple TCP socket or `aiohttp.web`. This avoids a second container.

**Option B: Use a file-based liveness probe.**
Worker writes a timestamp to `/tmp/worker-heartbeat` periodically. K8s exec probe reads it. Simpler but less standard.

**Recommendation:** Option A with a minimal async HTTP handler. The worker already runs an event loop; adding a health endpoint task is lightweight. Use `aiohttp` (or just raw `asyncio.start_server`) to avoid adding a full ASGI framework.

However, to keep dependencies minimal, a simpler approach is to use Procrastinate's built-in health check: `procrastinate_app.check_connection_async()` which verifies the DB connection is live. The health endpoint can call this.

### Anti-Patterns to Avoid
- **Do NOT run the worker as a background asyncio.Task inside the FastAPI process.** The CONTEXT.md specifies a separate container. In-process workers die when the API pod restarts and contend for the same event loop.
- **Do NOT use `app.schema_manager.apply_schema_async()` at runtime.** The schema is managed by Alembic migrations, not at application startup.
- **Do NOT mix sync and async Procrastinate APIs.** Always use `open_async()`, `defer_async()`, `run_worker_async()` -- mixing causes event loop conflicts (GitHub issue #852).
- **Do NOT store the DATABASE_URL with SQLAlchemy dialect prefix in Procrastinate.** Strip `+asyncpg` or `+psycopg2` before passing to PsycopgConnector.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job durability across restarts | Custom DB polling loop | Procrastinate's PostgreSQL-backed queue | LISTEN/NOTIFY, locking, retry, audit trail built-in |
| Duplicate job prevention | Custom "is_running" flag on ImportJob | `queueing_lock=str(campaign_id)` | Atomic PostgreSQL constraint, race-condition-free |
| Worker health monitoring | Custom heartbeat table | Procrastinate's `procrastinate_workers` table + `check_connection_async()` | Built-in heartbeat and stale worker detection |
| Schema migration tracking | Custom version tracking for Procrastinate schema | Alembic migration with raw SQL | Single migration tool, consistent with project pattern |
| Connection pooling for worker | Manual psycopg connection management | `PsycopgConnector` with `psycopg_pool.AsyncConnectionPool` | Handles pool lifecycle, reconnection, health checks |

**Key insight:** Procrastinate is specifically designed for this use case -- PostgreSQL-backed durable task queue with built-in locking. The entire value proposition is avoiding hand-rolled job tables and polling loops.

## Common Pitfalls

### Pitfall 1: SQLAlchemy Dialect Prefix in Connection String
**What goes wrong:** Passing `postgresql+asyncpg://...` to PsycopgConnector causes connection failure.
**Why it happens:** Procrastinate uses psycopg3 directly, not via SQLAlchemy. It expects standard libpq connection strings.
**How to avoid:** Strip the `+asyncpg` or `+psycopg2` dialect prefix. `postgresql://user:pass@host:port/db` is valid for both libpq and psycopg3.
**Warning signs:** `psycopg.OperationalError` or connection refused errors on worker startup.

### Pitfall 2: RLS Context Not Set Before Querying ImportJob
**What goes wrong:** Worker task queries `import_jobs` table but RLS blocks the query because no campaign context is set yet.
**Why it happens:** `import_jobs` has RLS policies. The current task loads the job first to get `campaign_id`, but under RLS the query returns nothing.
**How to avoid:** Pass `campaign_id` as an explicit task argument alongside `import_job_id`. Set RLS context BEFORE any database query.
**Warning signs:** Task silently processes zero rows, or raises "ImportJob not found" despite the job existing.

### Pitfall 3: Procrastinate Schema Not in search_path
**What goes wrong:** Procrastinate cannot find its tables (`procrastinate_jobs`, etc.) because they are in the `procrastinate` schema.
**Why it happens:** D-02 requires a separate schema. PostgreSQL's default `search_path` is `"$user", public`.
**How to avoid:** Set `options="-c search_path=procrastinate,public"` in the PsycopgConnector kwargs. This applies to all connections in the pool.
**Warning signs:** `UndefinedTable` errors for `procrastinate_jobs` on first defer or worker start.

### Pitfall 4: Forgetting to Remove TaskIQ from Lifespan
**What goes wrong:** Application startup fails or hangs because it tries to start the (now-removed) TaskIQ broker.
**Why it happens:** `app/main.py` lifespan imports and calls `broker.startup()` / `broker.shutdown()`.
**How to avoid:** Remove ALL TaskIQ references: the import, `broker.startup()`, `broker.shutdown()`, and `app.state.broker`.
**Warning signs:** `ModuleNotFoundError: No module named 'taskiq'` after removing the dependency.

### Pitfall 5: AlreadyEnqueued Exception Not Caught
**What goes wrong:** Uncaught exception returns 500 instead of 409 when a duplicate import is attempted.
**Why it happens:** Procrastinate raises `procrastinate.exceptions.AlreadyEnqueued` when `queueing_lock` conflicts.
**How to avoid:** Wrap `defer_async()` in try/except and return 409 per D-06.
**Warning signs:** 500 errors in logs when users click "Start Import" twice quickly.

### Pitfall 6: Worker Doesn't Pick Up Tasks from Custom Schema
**What goes wrong:** Worker starts but never processes any jobs.
**Why it happens:** Worker's PsycopgConnector doesn't have the `procrastinate` schema in search_path.
**How to avoid:** Both API and worker must use the same `search_path` configuration for the PsycopgConnector. The shared `procrastinate_app` singleton handles this.
**Warning signs:** Worker logs show "Waiting for jobs..." indefinitely despite jobs being deferred.

### Pitfall 7: Alembic Migration Needs Schema Creation Before Table Creation
**What goes wrong:** Migration fails with "schema procrastinate does not exist" when running Procrastinate's table creation SQL.
**Why it happens:** The raw SQL from `schema.sql` assumes the schema already exists (or uses `public`).
**How to avoid:** The Alembic migration must first `CREATE SCHEMA IF NOT EXISTS procrastinate`, then `SET search_path TO procrastinate`, then execute the Procrastinate schema SQL.
**Warning signs:** Migration error on `CREATE TABLE procrastinate_jobs`.

## Code Examples

### Complete Alembic Migration for Procrastinate Schema

```python
"""Add Procrastinate task queue schema.

Revision ID: 017
Revises: (previous)
Create Date: 2026-03-28

Creates the 'procrastinate' schema and applies Procrastinate's
full schema SQL (tables, functions, triggers, types).
"""
from alembic import op

# Procrastinate schema SQL is dumped here rather than using
# app.schema_manager.apply_schema() to keep Alembic as the
# single source of truth for all schema changes (D-01).

PROCRASTINATE_SCHEMA_SQL = """
-- Full SQL from procrastinate.sql/schema.sql
-- Obtained via: procrastinate schema --apply --dry-run
-- or by reading procrastinate/sql/schema.sql from the installed package
"""

def upgrade():
    op.execute("CREATE SCHEMA IF NOT EXISTS procrastinate")
    op.execute("SET search_path TO procrastinate")
    op.execute(PROCRASTINATE_SCHEMA_SQL)
    op.execute("SET search_path TO public")

def downgrade():
    op.execute("DROP SCHEMA IF EXISTS procrastinate CASCADE")
```

**How to obtain the SQL:** After installing procrastinate, the schema SQL is available at:
```python
from procrastinate import App, SyncPsycopgConnector
app = App(connector=SyncPsycopgConnector())
sql = app.schema_manager.get_schema()
print(sql)
```
Or from the installed package: `procrastinate/sql/schema.sql`

### Deriving Connection Info from DATABASE_URL

```python
def _make_conninfo() -> str:
    """Convert SQLAlchemy DATABASE_URL to standard PostgreSQL conninfo.

    Strips SQLAlchemy dialect prefixes (+asyncpg, +psycopg2) since
    Procrastinate uses psycopg3 directly with standard libpq URLs.
    """
    import re
    url = settings.database_url
    # Remove SQLAlchemy dialect: postgresql+asyncpg:// -> postgresql://
    url = re.sub(r"postgresql\+\w+://", "postgresql://", url)
    return url
```

### Docker Compose Worker Service

```yaml
# Add to docker-compose.yml
  worker:
    build:
      context: .
      target: dev
    container_name: run-api-worker
    command: ["python", "scripts/worker.py"]
    env_file:
      - .env
      - path: .env.zitadel
        required: false
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@postgres:5432/run_api
      S3_ENDPOINT_URL: http://minio:9000
    volumes:
      - ./app:/home/app/app
      - ./scripts:/home/app/scripts
    depends_on:
      postgres:
        condition: service_healthy
      api:
        condition: service_started  # Ensures migrations have run
    restart: unless-stopped
```

### K8s Worker Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: run-api-worker
  namespace: civpulse-dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: run-api-worker
  template:
    metadata:
      labels:
        app: run-api-worker
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        runAsGroup: 65534
        fsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: worker
          image: ghcr.io/civicpulse/run-api:sha-PLACEHOLDER
          command: ["python", "scripts/worker.py"]
          envFrom:
            - configMapRef:
                name: run-api-config
            - secretRef:
                name: run-api-secret
          ports:
            - containerPort: 8001  # Health endpoint
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8001
            initialDelaySeconds: 10
            periodSeconds: 30
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8001
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            capabilities:
              drop: ["ALL"]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TaskIQ InMemoryBroker | Procrastinate PostgreSQL queue | This phase | Jobs survive restarts, worker is independent process |
| `process_import.kiq()` | `process_import.configure(...).defer_async()` | This phase | Different API for deferring, adds queueing lock |
| `@broker.task` decorator | `@procrastinate_app.task()` decorator | This phase | Different decorator, adds queue/name params |
| 201 Created from confirm_mapping | 202 Accepted | This phase | Semantic correctness for async operations |
| psycopg2-binary only | psycopg2-binary + psycopg[pool] (v3) | This phase | psycopg3 added for Procrastinate, psycopg2 stays for Alembic |

**Deprecated/outdated:**
- `taskiq`, `taskiq-fastapi`: Fully removed from codebase and dependency tree
- `app/tasks/broker.py`: Deleted entirely
- Procrastinate's `AiopgConnector` and `Psycopg2Connector`: Deprecated in procrastinate, moved to contrib. Use `PsycopgConnector` (psycopg3).

## Open Questions

1. **Worker health endpoint implementation**
   - What we know: D-04 requires HTTP health at `:8001/healthz`. Procrastinate provides `check_connection_async()` for DB liveness.
   - What's unclear: Whether to use `aiohttp`, raw `asyncio.start_server`, or another minimal HTTP solution. Adding `aiohttp` is a new dependency.
   - Recommendation: Use raw `asyncio.start_server` with a minimal HTTP response handler to avoid new dependencies. Only needs to handle `GET /healthz` -> 200 OK.

2. **Procrastinate schema SQL extraction method**
   - What we know: The SQL is in `procrastinate/sql/schema.sql` in the installed package. `SchemaManager.get_schema()` returns it programmatically.
   - What's unclear: Whether `get_schema()` returns the exact same SQL as `schema.sql` or a processed version.
   - Recommendation: After `uv add procrastinate`, extract SQL via `get_schema()` and paste into the Alembic migration. Verify it creates all expected objects in the `procrastinate` schema.

3. **psycopg3 + asyncpg coexistence**
   - What we know: Both are PostgreSQL drivers but for different clients. SQLAlchemy uses asyncpg. Procrastinate uses psycopg3. They maintain separate connection pools.
   - What's unclear: Any subtle interaction at the libpq level or Docker build issues.
   - Recommendation: LOW risk -- they are independent Python packages with no shared state. Verify with `uv add` that there are no version conflicts.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Procrastinate job store | Yes (via Docker) | 17 (PostGIS 3.5) | -- |
| Python 3.13 | Procrastinate (requires >=3.10) | Yes | 3.13 | -- |
| Docker Compose | Worker container | Yes | (host tool) | -- |
| psycopg[pool] | PsycopgConnector | Not yet (transitive via procrastinate) | Will install | -- |
| asyncpg | SQLAlchemy async | Yes | 0.31.0 | -- |

**Missing dependencies with no fallback:** None -- all infrastructure is available.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2+ with pytest-asyncio 1.3.0+ |
| Config file | `pyproject.toml` ([tool.pytest.ini_options]) |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BGND-01 | confirm_mapping returns 202 Accepted | unit | `uv run pytest tests/unit/test_import_confirm.py::test_confirm_returns_202 -x` | No -- Wave 0 |
| BGND-01 | defer_async is called when mapping confirmed | unit | `uv run pytest tests/unit/test_import_confirm.py::test_defer_async_called -x` | No -- Wave 0 |
| BGND-02 | Procrastinate App initializes in lifespan | unit | `uv run pytest tests/unit/test_lifespan.py::test_procrastinate_initialized -x` | No -- Wave 0 (file exists but test doesn't) |
| BGND-02 | TaskIQ broker references fully removed | unit | `uv run pytest tests/unit/test_no_taskiq.py::test_taskiq_not_imported -x` | No -- Wave 0 |
| BGND-02 | Queueing lock rejects duplicate imports (409) | unit | `uv run pytest tests/unit/test_import_confirm.py::test_duplicate_import_409 -x` | No -- Wave 0 |
| MEMD-02 | Worker script runs and connects to DB | integration | `uv run pytest tests/integration/test_worker_startup.py -x` | No -- Wave 0 |
| MEMD-02 | Worker processes deferred import task | integration | `uv run pytest tests/integration/test_worker_process.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_import_confirm.py` -- covers BGND-01 (202 response, defer_async call, 409 on duplicate)
- [ ] `tests/unit/test_no_taskiq.py` -- covers BGND-02 (verifies no taskiq imports remain)
- [ ] Update `tests/unit/test_lifespan.py` -- covers BGND-02 (procrastinate init in lifespan, replaces broker mock)
- [ ] `tests/integration/test_worker_startup.py` -- covers MEMD-02 (worker connects, optional if DB not available in CI)

## Sources

### Primary (HIGH confidence)
- [Procrastinate GitHub repository](https://github.com/procrastinate-org/procrastinate) -- README, source code for App, PsycopgConnector, SchemaManager, tasks, schema.sql
- [Procrastinate PyPI](https://pypi.org/project/procrastinate/) -- version 3.7.3, dependency list (psycopg[pool], asgiref, attrs, croniter, etc.)
- [Procrastinate quickstart docs](https://github.com/procrastinate-org/procrastinate/blob/main/docs/quickstart.md) -- App setup, task definition, deferral, worker launch
- [Procrastinate connector docs](https://github.com/procrastinate-org/procrastinate/blob/main/docs/howto/basics/connector.md) -- PsycopgConnector kwargs, pool_factory, conninfo
- [Procrastinate schema docs](https://github.com/procrastinate-org/procrastinate/blob/main/docs/howto/production/schema.md) -- Custom PG schema via search_path options
- [Procrastinate queueing locks docs](https://github.com/procrastinate-org/procrastinate/blob/main/docs/howto/advanced/queueing_locks.md) -- queueing_lock on decorator and configure(), AlreadyEnqueued exception
- [Procrastinate worker docs](https://github.com/procrastinate-org/procrastinate/blob/main/docs/howto/basics/worker.md) -- run_worker_async params, install_signal_handlers, FastAPI integration example
- [Procrastinate migration docs](https://github.com/procrastinate-org/procrastinate/blob/main/docs/howto/production/migrations.md) -- Migration file naming, manual tracking

### Secondary (MEDIUM confidence)
- [GitHub issue #852](https://github.com/procrastinate-org/procrastinate/issues/852) -- FastAPI + Procrastinate async-only pattern requirement
- [psycopg3 connection docs](https://www.psycopg.org/psycopg3/docs/api/connections.html) -- conninfo format, DSN strings

### Tertiary (LOW confidence)
- None -- all key findings verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- procrastinate 3.7.3 verified on PyPI, API verified from source code, dependencies confirmed compatible
- Architecture: HIGH -- FastAPI lifespan pattern confirmed via official docs and issue #852, existing codebase patterns well-understood from reading all canonical files
- Pitfalls: HIGH -- RLS chicken-and-egg documented in STATE.md, search_path requirement confirmed from official schema docs, SQLAlchemy dialect prefix issue verified from config.py inspection

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable library, well-documented API)
