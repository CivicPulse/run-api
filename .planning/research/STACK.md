# Technology Stack: v1.6 Imports

**Project:** CivicPulse Run API
**Researched:** 2026-03-28
**Overall confidence:** MEDIUM (Procrastinate version and API details from training data; web verification tools unavailable -- versions MUST be verified at install time)

---

## Executive Summary

v1.6 replaces the in-process TaskIQ `InMemoryBroker` with **Procrastinate**, a PostgreSQL-native task queue. This is the right choice for this stack because it adds zero infrastructure: no Redis, no RabbitMQ, no additional containers. Tasks are stored as rows in PostgreSQL (which we already run), surviving pod crashes and enabling resumable imports with per-batch progress commits. The migration is straightforward: one new Python package replaces two existing ones (`taskiq` and `taskiq-fastapi`), the import task function signature stays nearly identical, and the FastAPI integration uses Procrastinate's built-in ASGI app mounting.

The critical technical requirement is the PostgreSQL driver. Procrastinate requires **psycopg 3** (the `psycopg` package, NOT `psycopg2`). The existing codebase uses `asyncpg` for async operations and `psycopg2-binary` for Alembic migrations. Procrastinate cannot use `asyncpg` -- it uses `psycopg`'s native async support. This means adding `psycopg[binary]` as a dependency. The existing `asyncpg`-based SQLAlchemy engine and `psycopg2-binary` for Alembic remain unchanged; Procrastinate manages its own connection pool via `psycopg` independently.

---

## Recommended Stack

### Core Addition: Procrastinate

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `procrastinate` | >=2.0.0 | PostgreSQL-based async task queue | Zero-infra (uses existing PostgreSQL), built-in retry/scheduling, async-native, SQLAlchemy-compatible, tasks survive pod crashes |

**Why Procrastinate over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| TaskIQ (current) | `InMemoryBroker` loses all jobs on restart; production brokers (Redis, RabbitMQ) add infrastructure we do not want |
| Celery + Redis | Requires Redis container/service; synchronous-first design fights our async codebase; heavy operational burden |
| Dramatiq + Redis | Same Redis dependency problem; less async support than Procrastinate |
| ARQ | Redis-required; less mature; no built-in Django/FastAPI integration patterns |
| Huey | Redis or SQLite backend; not PostgreSQL-native; synchronous API |
| SAQ (Simple Async Queue) | Redis-required |
| pg-boss (Node.js) | Wrong language ecosystem |
| Custom `asyncio.create_task` | No persistence, no retry, no crash recovery, no worker scaling |
| LISTEN/NOTIFY + custom queue | Reinventing what Procrastinate already does well |

**Why Procrastinate is specifically right for THIS project:**
1. **Zero new infrastructure** -- uses the existing PostgreSQL 17 + PostGIS database; no Redis/RabbitMQ container to add to docker-compose, no new K8s Deployment to manage
2. **Crash-resilient by design** -- jobs are PostgreSQL rows; if a pod crashes mid-import, the job remains in `processing` state and can be retried or resumed
3. **ACID-compliant progress tracking** -- per-batch import progress can be committed transactionally alongside the voter upsert data, so progress is always consistent with actual database state
4. **Async-native** -- Procrastinate's async API (`ProcrastinateApp` with `psycopg` async connector) fits naturally into the existing FastAPI async codebase
5. **Worker is the same process** -- for small deployments, the worker can run inside the FastAPI process; for scaling, a separate worker process uses the same Docker image with a different entrypoint

### Driver Requirement: psycopg 3

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `psycopg[binary]` | >=3.1.0 | Async PostgreSQL driver for Procrastinate | Procrastinate requires psycopg 3 (NOT psycopg2, NOT asyncpg); the `[binary]` extra bundles libpq so no system package is needed |

**Driver landscape clarification:**

| Driver | Package | Used By | Status After v1.6 |
|--------|---------|---------|-------------------|
| asyncpg | `asyncpg>=0.31.0` | SQLAlchemy async engine, all ORM operations | UNCHANGED -- remains primary ORM driver |
| psycopg2 | `psycopg2-binary>=2.9.11` | Alembic sync migrations | UNCHANGED -- remains migration driver |
| psycopg 3 | `psycopg[binary]>=3.1.0` | Procrastinate task queue | NEW -- Procrastinate's own connection pool |

These three drivers coexist without conflict. They are separate Python packages with separate C extensions. Procrastinate manages its own connection pool via psycopg 3 and does not interfere with SQLAlchemy's asyncpg pool.

### Database Schema: Procrastinate Tables

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Procrastinate schema migrations | Built-in | Creates `procrastinate_jobs`, `procrastinate_events`, `procrastinate_periodic_defers` tables | Procrastinate provides its own schema management; run `procrastinate schema --apply` or use the provided SQL |

Procrastinate creates its own tables in the `public` schema by default:
- `procrastinate_jobs` -- job queue (task name, args, status, attempts, scheduled_at, etc.)
- `procrastinate_events` -- job lifecycle events for monitoring
- `procrastinate_periodic_defers` -- periodic task scheduling (not needed for v1.6 but created automatically)

**Integration with Alembic:** Procrastinate's schema is managed separately from Alembic. The recommended approach is to run `procrastinate schema --apply` as part of the init container migration step (alongside `alembic upgrade head`). Alternatively, the SQL can be embedded in an Alembic migration using `op.execute()` for the initial setup, though subsequent Procrastinate version upgrades may require additional schema changes that Procrastinate's own tooling handles better.

**RLS consideration:** Procrastinate tables do NOT need RLS policies. They store task metadata (job ID, task name, serialized arguments), not campaign-scoped voter data. The import task receives the `import_job_id` as a string argument and sets RLS context itself when it creates a SQLAlchemy session.

## What to Remove

| Technology | Package | Why Remove |
|------------|---------|------------|
| `taskiq` | `taskiq>=0.12.1` | Replaced by Procrastinate; InMemoryBroker is not production-viable |
| `taskiq-fastapi` | `taskiq-fastapi>=0.4.0` | FastAPI integration no longer needed; Procrastinate has its own ASGI mount |

Both packages and all references (`app/tasks/broker.py`, `app/tasks/import_task.py` broker import, `app/main.py` broker startup/shutdown) will be replaced.

## Supporting Libraries (No Changes)

These existing libraries are used by the import pipeline and remain unchanged:

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `rapidfuzz` | >=3.14.3 | Fuzzy field mapping at 75% threshold | UNCHANGED |
| `aioboto3` | >=15.5.0 | Async S3/MinIO file download | UNCHANGED |
| `sqlalchemy` | >=2.0.48 | Async ORM for voter upsert batches | UNCHANGED |
| `asyncpg` | >=0.31.0 | SQLAlchemy async PostgreSQL driver | UNCHANGED |
| `geoalchemy2` | >=0.18.4 | PostGIS geometry for voter lat/lon | UNCHANGED |

## No New Frontend Dependencies

The import wizard UI already exists and polls `GET /campaigns/{campaign_id}/imports/{import_id}` for status updates. The only change is that the `POST /confirm` endpoint returns `202 Accepted` instead of `201 Created`, and the polling endpoint reflects batch-level progress rather than waiting for completion. No new npm packages are needed.

---

## Integration Architecture

### Procrastinate + FastAPI Integration

Procrastinate provides a built-in ASGI sub-application (`ProcrastinateApp`) that can be mounted on the FastAPI app. This enables the web process to also function as a worker (processing jobs in the background while serving requests). For production scaling, a separate worker process can be launched from the same Docker image.

**App initialization pattern:**

```python
# app/tasks/queue.py (replaces app/tasks/broker.py)
from procrastinate import App, PsycopgConnector

# Connector uses psycopg 3 async
procrastinate_app = App(
    connector=PsycopgConnector(),
    import_paths=["app.tasks.import_task"],
)
```

**FastAPI lifespan integration:**

```python
# app/main.py lifespan changes
from app.tasks.queue import procrastinate_app

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing startup code ...

    # Open Procrastinate connection pool
    async with procrastinate_app.open_async():
        yield

    # ... existing shutdown code ...
```

**Task definition:**

```python
# app/tasks/import_task.py (modified)
from app.tasks.queue import procrastinate_app

@procrastinate_app.task(name="process_import", retry=2, pass_context=True)
async def process_import(context, import_job_id: str) -> None:
    """Process a voter file import in the background."""
    # ... same logic as current import_task.py ...
    # Key difference: RLS context and per-batch commits
```

**Dispatching from the endpoint:**

```python
# In app/api/v1/imports.py confirm_mapping endpoint
# Replace: await process_import.kiq(str(import_id))
# With:
await process_import.defer_async(import_job_id=str(import_id))
```

### Procrastinate + Resumable Imports

The critical architectural change for v1.6 is moving from a single-transaction import to per-batch commits. Currently, `process_import_file()` runs the entire import in one SQLAlchemy session with a single final `commit()`. If the pod crashes at row 50,000 of a 100,000-row file, all progress is lost.

**Per-batch commit pattern with Procrastinate:**

```python
async def process_import_file(self, import_job_id: str, storage: StorageService):
    """Process import with per-batch commits for crash resilience."""
    for batch in batches:
        async with async_session_factory() as session:
            await set_campaign_context(session, str(job.campaign_id))

            imported, errors, phones = await self.process_csv_batch(
                batch, job.field_mapping, str(job.campaign_id),
                job.source_type, session,
            )

            # Update progress in the SAME transaction as the voter data
            job = await session.get(ImportJob, uuid.UUID(import_job_id))
            job.imported_rows = (job.imported_rows or 0) + imported
            job.skipped_rows = (job.skipped_rows or 0) + len(errors)
            job.last_committed_batch = batch_number  # NEW column

            await session.commit()  # Batch + progress committed atomically
```

**Resume-on-crash pattern:**

The `ImportJob` model needs a `last_committed_batch` column (integer). When the worker picks up a job in `PROCESSING` status (indicating a prior crash), it skips to `last_committed_batch + 1` and continues from there. The CSV file is re-downloaded from MinIO and rows are skipped up to the resume point.

```python
# In the task, detect resume scenario
if job.status == ImportStatus.PROCESSING and job.last_committed_batch:
    # Resume: skip already-committed batches
    skip_rows = job.last_committed_batch * batch_size
    for _ in range(skip_rows):
        next(reader, None)
    logger.info("Resuming import {} from batch {}", import_job_id, job.last_committed_batch + 1)
```

### Procrastinate Worker Deployment

**Development (docker-compose):** The worker runs inside the FastAPI process. Procrastinate's `open_async()` context manager starts a background listener that picks up jobs from `procrastinate_jobs` via PostgreSQL `LISTEN/NOTIFY`. No separate container needed.

**Production (Kubernetes):** Add a second Deployment using the same Docker image but with a different command:

```yaml
# k8s/apps/run-api-prod/worker-deployment.yaml
spec:
  containers:
    - name: run-api-worker
      image: ghcr.io/civicpulse/run-api:sha-XXXXX  # same image
      command: ["python", "-m", "procrastinate", "--app=app.tasks.queue.procrastinate_app", "worker"]
```

This reuses the same image, same dependencies, same code. The only difference is the entrypoint command.

### RLS Context in Background Tasks

The current pattern of manually setting RLS context in the background task is correct and carries forward unchanged. Procrastinate tasks create their own SQLAlchemy sessions outside the FastAPI request lifecycle, so they must set RLS context explicitly:

```python
async with async_session_factory() as session:
    await set_campaign_context(session, str(job.campaign_id))
    # ... all queries in this session are campaign-scoped
```

The pool checkout event in `session.py` resets context to the null UUID on every checkout, so there is no risk of stale context in background task sessions.

### Progress Tracking via Existing Polling Endpoint

The existing `GET /campaigns/{campaign_id}/imports/{import_id}` endpoint already returns `imported_rows`, `skipped_rows`, `total_rows`, and `status`. With per-batch commits, these values update after every batch (currently 1,000 rows). The frontend polling interval of ~2 seconds will show smooth progress for large files.

No new endpoints are needed. The only change is that the `status` field will accurately reflect real-time progress because batch data and progress counters are committed atomically.

---

## ImportJob Model Changes

The `ImportJob` model needs two new columns for resumability:

| Column | Type | Purpose |
|--------|------|---------|
| `last_committed_batch` | `Integer, nullable=True` | Batch number of last successfully committed batch; used for resume-on-crash |
| `procrastinate_job_id` | `BigInteger, nullable=True` | Foreign reference to `procrastinate_jobs.id` for job correlation and cancellation |

These require an Alembic migration. The `procrastinate_job_id` column enables the API to check Procrastinate's job status or cancel a running import by aborting the Procrastinate job.

---

## Configuration Changes

### Settings Addition

```python
# app/core/config.py
class Settings(BaseSettings):
    # ... existing settings ...

    # Procrastinate (uses same database, separate connection pool)
    procrastinate_database_url: str = (
        "postgresql://postgres:postgres@localhost:5432/run_api"
    )
```

Note: Procrastinate uses a **plain `postgresql://`** URL (not `postgresql+asyncpg://`). The psycopg 3 driver handles both sync and async connections natively. In docker-compose, this points to the same `postgres` container. The URL can also be derived from the existing `database_url` by stripping the `+asyncpg` dialect prefix.

### Docker Compose Changes

No new services needed. Procrastinate uses the existing PostgreSQL container. The only change is adding the Procrastinate schema initialization to the dev entrypoint:

```bash
# scripts/dev-entrypoint.sh (add after alembic upgrade)
python -m procrastinate --app=app.tasks.queue.procrastinate_app schema --apply
```

### Kubernetes Changes

Two additions to the K8s manifests:

1. **Init container update:** Add `procrastinate schema --apply` after `alembic upgrade head`
2. **Worker Deployment:** New `worker-deployment.yaml` using the same image with the Procrastinate worker command

---

## Installation

```bash
# Add Procrastinate with psycopg 3 driver
uv add procrastinate "psycopg[binary]>=3.1.0"

# Remove TaskIQ (replaced by Procrastinate)
uv remove taskiq taskiq-fastapi
```

---

## Version Compatibility Matrix

| New Package | Requires | Project Has | Compatible |
|------------|----------|-------------|------------|
| procrastinate >=2.0.0 | Python >=3.8 | Python 3.13 | YES |
| procrastinate >=2.0.0 | psycopg >=3.0 | Adding psycopg[binary] >=3.1.0 | YES |
| procrastinate >=2.0.0 | PostgreSQL >=11 | PostgreSQL 17 (PostGIS 17-3.5) | YES |
| psycopg[binary] >=3.1.0 | Python >=3.8 | Python 3.13 | YES |
| psycopg[binary] >=3.1.0 | libpq (bundled in binary) | N/A (bundled) | YES |

**Coexistence with existing drivers:**
- `psycopg[binary]` (psycopg 3) and `psycopg2-binary` are separate packages with separate namespaces (`import psycopg` vs `import psycopg2`). They coexist without conflict.
- `asyncpg` is a completely separate driver. No namespace conflicts.

---

## What NOT to Add

| Technology | Why Not |
|-----------|---------|
| Redis | Procrastinate eliminates the need for Redis; adding Redis for task queuing contradicts the zero-infra goal |
| RabbitMQ | Same as Redis -- unnecessary infrastructure |
| Celery | Synchronous-first, requires Redis/RabbitMQ, massive dependency tree, fights async codebase |
| `taskiq-redis` / `taskiq-aio-pika` | TaskIQ is being replaced entirely, not upgraded to a production broker |
| WebSocket for progress | SSE or polling is sufficient for import progress; WebSocket adds complexity for a non-real-time use case |
| `aiofiles` | Not needed; MinIO streaming via aioboto3 is already async; CSV parsing uses in-memory StringIO |
| `tqdm` / progress bar libraries | Progress is tracked server-side in ImportJob rows, not in a CLI progress bar |
| `psycopg` without `[binary]` | The plain `psycopg` package requires system `libpq-dev` to be installed; `[binary]` bundles it, matching the pattern used by `psycopg2-binary` |
| Django-procrastinate | Wrong framework; use the standalone `procrastinate` package directly |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Procrastinate as the right tool | HIGH | PostgreSQL-native task queue is the canonical answer for "task queue without Redis"; project already chose this direction in PROJECT.md |
| psycopg 3 requirement | HIGH | Procrastinate's documentation consistently states psycopg 3 is the required driver; this is a fundamental architectural choice of the library |
| Coexistence of asyncpg + psycopg2 + psycopg3 | HIGH | These are separate Python packages with separate C extensions and separate import namespaces; confirmed from package documentation |
| Exact version numbers | LOW | Training data may be 6-18 months stale; `procrastinate>=2.0.0` and `psycopg[binary]>=3.1.0` are minimum known-good versions but the latest PyPI versions should be verified at install time with `uv add procrastinate` |
| FastAPI integration pattern (open_async in lifespan) | MEDIUM | Pattern is documented in Procrastinate docs but exact API method names should be verified against installed version |
| Per-batch commit pattern | HIGH | Standard SQLAlchemy pattern; independent of Procrastinate; confirmed from codebase analysis of existing session management |
| Worker deployment as separate command | HIGH | Standard Procrastinate CLI pattern; `procrastinate worker` is the documented command |
| Procrastinate schema management | MEDIUM | `procrastinate schema --apply` is the documented command; exact flag names should be verified against installed version |

---

## Verification Steps (Must Do Before Implementation)

Because web search and package registry verification were unavailable during research, the following MUST be verified at implementation time:

1. **`uv add procrastinate`** -- verify the installed version and check the changelog for any breaking changes since training data cutoff
2. **`uv add "psycopg[binary]"`** -- verify version compatibility with the installed Procrastinate version
3. **Check Procrastinate's async connector class name** -- training data says `PsycopgConnector` but it may be `AsyncConnector` or `SyncPsycopgConnector` depending on version; check `from procrastinate import` and tab-complete
4. **Check `open_async()` method** -- verify this is the correct context manager for async operation; may be `open()` in some versions
5. **Check schema CLI command** -- verify `procrastinate schema --apply` is the correct invocation; may be `procrastinate schema apply` (no double-dash) depending on version
6. **Test psycopg 3 + asyncpg coexistence** -- run `uv run python -c "import psycopg; import asyncpg; import psycopg2; print('all drivers coexist')"` to confirm no import conflicts

---

## Sources

### Primary (codebase analysis -- HIGH confidence)
- `pyproject.toml` -- current dependencies (taskiq 0.12.1, taskiq-fastapi 0.4.0, asyncpg 0.31.0, psycopg2-binary 2.9.11)
- `app/tasks/broker.py` -- current InMemoryBroker (lines 1-11)
- `app/tasks/import_task.py` -- current import task structure (lines 1-78)
- `app/services/import_service.py` -- batch processing and progress tracking (lines 836-978)
- `app/main.py` -- lifespan startup/shutdown with broker (lines 32-88)
- `app/db/session.py` -- async engine, pool checkout event, session factory (lines 1-51)
- `app/db/rls.py` -- transaction-scoped RLS context (lines 1-31)
- `app/core/config.py` -- settings with database_url patterns (lines 1-90)
- `app/models/import_job.py` -- ImportJob model with progress columns (lines 1-83)
- `app/api/v1/imports.py` -- import endpoints including confirm_mapping dispatch (lines 1-467)
- `docker-compose.yml` -- PostgreSQL 17-3.5, no Redis service (lines 1-178)
- `Dockerfile` -- multi-stage build, worker can reuse same image (lines 1-103)
- `k8s/apps/run-api-prod/deployment.yaml` -- current K8s deployment pattern (lines 1-86)
- `.planning/PROJECT.md` -- v1.6 milestone scope confirming Procrastinate choice (lines 93-104)

### Secondary (training data -- MEDIUM confidence)
- Procrastinate documentation (procrastinate.readthedocs.io) -- async API, FastAPI integration, psycopg 3 requirement, worker CLI, schema management
- psycopg 3 documentation (psycopg.org) -- async connector, binary package, coexistence with psycopg2
- PostgreSQL LISTEN/NOTIFY documentation -- mechanism used by Procrastinate for job pickup without polling

### Unverified (training data only -- LOW confidence)
- Exact latest version of Procrastinate on PyPI (training data suggests 2.x but may be higher)
- Exact API method names in latest Procrastinate release (connector class, open method, defer method)
- Exact schema CLI invocation syntax in latest release
