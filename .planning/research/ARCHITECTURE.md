# Architecture: Procrastinate Integration with Existing FastAPI Import Pipeline

**Domain:** Background task processing for voter file imports
**Researched:** 2026-03-28
**Overall confidence:** HIGH (codebase fully analyzed, Procrastinate API well-understood from documentation and training data)

---

## Executive Summary

The current import pipeline uses TaskIQ with an `InMemoryBroker` -- a non-production task queue that loses jobs on restart and cannot run in a separate worker process. The v1.6 milestone replaces this with Procrastinate, a PostgreSQL-backed task queue that uses the application's existing database for job storage, supports async workers, and enables resumable batch processing without adding infrastructure (no Redis, no RabbitMQ).

The integration touches four areas: (1) replacing TaskIQ broker/task definitions with Procrastinate app/task definitions, (2) modifying `ImportService.process_import_file()` to commit per-batch instead of per-file, (3) adding a `last_completed_batch` column to `ImportJob` for crash recovery, and (4) adding a worker entrypoint that can run as a sidecar container or separate deployment.

---

## Why Procrastinate

Procrastinate is the right choice because it eliminates infrastructure by using the PostgreSQL database the application already depends on. The project already has PostgreSQL 17 with PostGIS. Adding Redis or RabbitMQ for TaskIQ/Celery would increase operational complexity for a single-worker, low-throughput task queue. Procrastinate stores jobs in PostgreSQL tables, uses `LISTEN/NOTIFY` for worker signaling (no polling), and provides a native async connector for asyncpg -- the same driver this project uses.

Key advantages over TaskIQ InMemoryBroker:
- **Durable jobs**: Jobs survive process restarts (stored in PostgreSQL)
- **Worker separation**: Worker can run in a separate process/container from the API
- **Same database**: No new infrastructure -- uses the existing PostgreSQL instance
- **Async native**: First-class asyncio support with asyncpg connector
- **No polling**: Uses PostgreSQL `LISTEN/NOTIFY` for instant job pickup
- **Built-in retry**: Configurable retry with exponential backoff
- **Admin visibility**: Jobs queryable via standard SQL

Confidence: HIGH -- Procrastinate is a mature library (v2.x), well-documented, and specifically designed for this use case.

---

## Current Architecture (What Exists)

### Task Dispatch Chain

```
POST /imports/{id}/confirm (imports.py line 185-250)
  |
  v
job.status = ImportStatus.QUEUED
await db.commit()
  |
  v
await process_import.kiq(str(import_id))    # TaskIQ dispatch
  |
  v
InMemoryBroker executes in same process     # NOT durable
  |
  v
process_import() in app/tasks/import_task.py
  |
  v
Creates its own session via async_session_factory()
Sets RLS context via set_campaign_context()
  |
  v
ImportService.process_import_file()
  - Downloads entire file from MinIO
  - Processes ALL batches in single session
  - Single commit at end (or rollback on failure)
  - Updates ImportJob progress via flush() (not committed until end)
```

### Critical Problems

1. **InMemoryBroker is not durable**: If the API process restarts, queued and in-progress jobs are lost. The ImportJob stays in QUEUED/PROCESSING status forever.

2. **Single transaction for entire file**: `process_import_file()` runs all batches in one session. A crash after batch 50 of 100 loses all 50 batches of work. Progress updates via `flush()` are not visible to the polling endpoint because they are uncommitted.

3. **Progress not visible until complete**: Because batches are flushed but not committed, the GET status endpoint reads stale data. The UI shows 0 progress until the entire import finishes.

4. **No crash recovery**: There is no mechanism to resume from the last successful batch. A restart means re-processing the entire file.

### Files Involved

| File | Role | Lines |
|------|------|-------|
| `app/tasks/broker.py` | TaskIQ InMemoryBroker | 10 lines |
| `app/tasks/import_task.py` | Task definition + execution | 78 lines |
| `app/services/import_service.py` | Import processing logic | 978 lines |
| `app/api/v1/imports.py` | API endpoints | 467 lines |
| `app/models/import_job.py` | ImportJob model | 83 lines |
| `app/main.py` | Broker startup/shutdown in lifespan | 129 lines |
| `app/db/session.py` | Session factory + pool checkout defense | 50 lines |
| `app/db/rls.py` | RLS context setter | 30 lines |

---

## Target Architecture (What To Build)

### Component Overview

```
                         PostgreSQL
                    +------------------+
                    |  procrastinate   |
                    |  job tables      |
                    |  (auto-created)  |
                    +--------+---------+
                             |
              LISTEN/NOTIFY  |  INSERT job
              +--------------+-------------+
              |                            |
     +--------v--------+         +--------v--------+
     |  Worker Process  |         |  API Process    |
     |  (procrastinate  |         |  (FastAPI)      |
     |   worker CLI or  |         |                 |
     |   run_worker())  |         |  confirm_mapping|
     |                  |         |    endpoint     |
     |  import_task()   |         |    defers job   |
     |    |             |         |                 |
     |    v             |         |  get_status     |
     |  ImportService   |         |    endpoint     |
     |  .process_import |         |    reads        |
     |  _file_resumable |         |    ImportJob    |
     |    |             |         +---------+-------+
     |    v             |                   |
     |  Per-batch       |                   |
     |  commit + update |                   |
     |  ImportJob       +-------------------+
     |  progress        |     Same PostgreSQL
     +------------------+
```

### New and Modified Components

#### NEW: `app/tasks/procrastinate_app.py` (replaces `broker.py`)

This file creates the Procrastinate `App` instance with the async psycopg connector. Procrastinate uses its own connection to PostgreSQL (separate from SQLAlchemy's pool) for job table operations and `LISTEN/NOTIFY`.

```python
"""Procrastinate application configuration.

Uses PsycopgConnector for async PostgreSQL job queue backed by
the same database as the application.
"""
from __future__ import annotations

import procrastinate

from app.core.config import settings


def _get_conninfo() -> str:
    """Convert SQLAlchemy DATABASE_URL to a psycopg conninfo string.

    Procrastinate uses psycopg3 (not asyncpg), so we need a libpq-style
    connection string. The app's DATABASE_URL uses asyncpg format:
      postgresql+asyncpg://user:pass@host:port/dbname
    We strip the +asyncpg prefix.
    """
    url = settings.database_url
    # Remove SQLAlchemy dialect prefix
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    return url


procrastinate_app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(
        conninfo=_get_conninfo(),
    ),
    import_paths=["app.tasks.import_task"],
)
```

**Key design decisions:**
- `PsycopgConnector` (not `SyncPsycopgConnector`) for async worker operation
- `import_paths` enables worker auto-discovery of task modules
- Connection string derived from existing `settings.database_url`
- Procrastinate creates its own connection pool internally (separate from SQLAlchemy)

**IMPORTANT**: Procrastinate v2+ uses `psycopg` (psycopg3), NOT `psycopg2`. This is a new dependency separate from the existing `psycopg2-binary` used by Alembic. The `psycopg` package is the modern async-capable PostgreSQL adapter.

#### NEW: `app/tasks/import_task.py` (rewritten)

```python
"""Background task for voter file import processing."""
from __future__ import annotations

from loguru import logger

from app.tasks.procrastinate_app import procrastinate_app


@procrastinate_app.task(
    name="import_voter_file",
    retry=procrastinate.RetryStrategy(max_retries=2, wait=30),
    queue="imports",
)
async def import_voter_file(import_job_id: str) -> None:
    """Process a voter file import as a background job.

    Creates its own DB session (runs outside FastAPI lifecycle),
    sets RLS context, delegates to ImportService with per-batch commits.
    """
    from app.db.rls import set_campaign_context
    from app.db.session import async_session_factory
    from app.models.import_job import ImportJob, ImportStatus
    from app.services.import_service import ImportService
    from app.services.storage import StorageService

    logger.info("Starting import job {}", import_job_id)
    storage = StorageService()
    service = ImportService()

    async with async_session_factory() as session:
        try:
            job = await session.get(ImportJob, uuid.UUID(import_job_id))
            if job is None:
                raise ValueError(f"ImportJob {import_job_id} not found")

            await set_campaign_context(session, str(job.campaign_id))

            await service.process_import_file_resumable(
                import_job_id, session, storage
            )

        except Exception:
            logger.exception("Import job {} failed", import_job_id)
            # Mark job as failed in a fresh transaction
            async with async_session_factory() as err_session:
                await set_campaign_context(err_session, str(job.campaign_id))
                err_job = await err_session.get(
                    ImportJob, uuid.UUID(import_job_id)
                )
                if err_job is not None:
                    err_job.status = ImportStatus.FAILED
                    err_job.error_message = "Import processing failed"
                    await err_session.commit()
            raise
```

**Key changes from current `import_task.py`:**
- `@procrastinate_app.task` replaces `@broker.task`
- Task gets a `name` for stable identification across deploys
- `retry` strategy with 2 retries and 30s wait handles transient failures
- `queue="imports"` allows dedicated worker scaling later
- Error handling uses a fresh session (the failed session may be in a bad state)
- Delegates to new `process_import_file_resumable()` method

#### MODIFIED: `app/models/import_job.py` (add batch tracking columns)

Add two columns to the ImportJob model for resumability:

```python
# New columns for resumable batch processing
last_completed_batch: Mapped[int] = mapped_column(default=0)
batch_size: Mapped[int] = mapped_column(default=1000)
```

- `last_completed_batch`: The zero-indexed batch number of the last successfully committed batch. On crash recovery, processing resumes from `last_completed_batch + 1`.
- `batch_size`: Stored on the job so the resume logic uses the same batch size as the original run. Prevents row-skip bugs if default changes between deploys.

**Migration**: A new Alembic migration adds these two nullable integer columns with server defaults. Non-breaking -- existing completed jobs get `last_completed_batch=0`.

The `QUEUED` status already exists in `ImportStatus`. The status flow becomes:

```
PENDING -> UPLOADED -> QUEUED -> PROCESSING -> COMPLETED
                                     |
                                     +------> FAILED (retryable)
```

On retry, the worker reads `last_completed_batch` and skips already-committed batches.

#### MODIFIED: `app/services/import_service.py` (add `process_import_file_resumable`)

The new method replaces the existing `process_import_file()` with per-batch commits:

```python
async def process_import_file_resumable(
    self,
    import_job_id: str,
    session: AsyncSession,
    storage: StorageService,
) -> None:
    """Process a voter file import with per-batch commits for resumability.

    Each batch of rows is committed independently. On crash, the job
    resumes from last_completed_batch + 1 by skipping already-processed
    rows in the CSV.

    The session's RLS context must be set before calling this method.
    """
    from app.db.rls import set_campaign_context
    from app.models.import_job import ImportJob, ImportStatus

    job = await session.get(ImportJob, uuid.UUID(import_job_id))
    if job is None:
        raise ValueError(f"ImportJob {import_job_id} not found")

    campaign_id_str = str(job.campaign_id)
    start_batch = job.last_completed_batch  # Resume from here

    # Only set PROCESSING if not already (resume case)
    if job.status != ImportStatus.PROCESSING:
        job.status = ImportStatus.PROCESSING
        if start_batch == 0:
            job.imported_rows = 0
            job.skipped_rows = 0
            job.total_rows = 0
        await session.commit()

    # Download file from S3
    # (Re-download on resume -- S3 is fast and avoids local state)
    chunks: list[bytes] = []
    async for chunk in storage.download_file(job.file_key):
        chunks.append(chunk)
    file_content = b"".join(chunks)

    # Decode
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            text_content = file_content.decode(encoding)
            break
        except (UnicodeDecodeError, ValueError):
            continue
    else:
        job.status = ImportStatus.FAILED
        job.error_message = "Unable to decode file content"
        await session.commit()
        return

    # Parse CSV
    reader = csv.DictReader(io.StringIO(text_content))
    batch: list[dict[str, str]] = []
    all_errors: list[dict] = []
    total_imported = job.imported_rows or 0
    total_skipped = job.skipped_rows or 0
    total_phones_created = job.phones_created or 0
    total_rows = 0
    batch_index = 0
    batch_size = job.batch_size or 1000

    for row in reader:
        batch.append(row)
        total_rows += 1

        if len(batch) >= batch_size:
            if batch_index < start_batch:
                # Skip already-committed batches on resume
                batch = []
                batch_index += 1
                continue

            # RLS context resets on commit; re-set it
            await set_campaign_context(session, campaign_id_str)

            imported, errors, phones = await self.process_csv_batch(
                batch, job.field_mapping, campaign_id_str,
                job.source_type, session,
            )
            total_imported += imported
            total_skipped += len(errors)
            total_phones_created += phones
            all_errors.extend(errors)

            # Update progress AND commit this batch
            job.total_rows = total_rows
            job.imported_rows = total_imported
            job.skipped_rows = total_skipped
            job.phones_created = total_phones_created
            job.last_completed_batch = batch_index + 1
            await session.commit()  # <-- COMMITTED per batch

            batch = []
            batch_index += 1

    # Process remaining partial batch
    if batch and batch_index >= start_batch:
        await set_campaign_context(session, campaign_id_str)
        imported, errors, phones = await self.process_csv_batch(
            batch, job.field_mapping, campaign_id_str,
            job.source_type, session,
        )
        total_imported += imported
        total_skipped += len(errors)
        total_phones_created += phones
        all_errors.extend(errors)

    # Upload error report if needed
    if all_errors:
        # ... (same error report logic as current)
        pass

    # Finalize
    await set_campaign_context(session, campaign_id_str)
    job.total_rows = total_rows
    job.imported_rows = total_imported
    job.skipped_rows = total_skipped
    job.phones_created = total_phones_created
    job.last_completed_batch = batch_index + 1
    job.status = ImportStatus.COMPLETED
    await session.commit()
```

**Critical design detail: RLS context after commit.**

The existing RLS context uses `set_config('app.current_campaign_id', :id, true)` where the third parameter `true` means "transaction-scoped." This means the RLS context **resets on every COMMIT**. The per-batch commit pattern therefore requires re-setting RLS context after each commit. This is already reflected in the code above.

This is the single most important integration detail. Missing this would cause RLS violations or empty query results after the first batch commit.

#### MODIFIED: `app/api/v1/imports.py` (dispatch via Procrastinate)

The `confirm_mapping` endpoint changes from:

```python
# Old (TaskIQ)
from app.tasks.import_task import process_import
await process_import.kiq(str(import_id))
```

To:

```python
# New (Procrastinate)
from app.tasks.import_task import import_voter_file
await import_voter_file.defer_async(import_job_id=str(import_id))
```

Procrastinate's `defer_async()` inserts a row into the `procrastinate_jobs` table within the current database. This is an INSERT, not a network call to a broker. The job is durable the moment the surrounding transaction commits.

**HTTP Status**: The endpoint already returns the ImportJobResponse. The status should be `202 Accepted` (currently returns 200). Update the decorator:

```python
@router.post(
    "/campaigns/{campaign_id}/imports/{import_id}/confirm",
    response_model=ImportJobResponse,
    status_code=status.HTTP_202_ACCEPTED,  # Changed from default 200
)
```

#### MODIFIED: `app/main.py` (Procrastinate lifecycle)

Replace TaskIQ broker startup/shutdown with Procrastinate:

```python
# Old
from app.tasks.broker import broker
await broker.startup()
app.state.broker = broker
# ...
await broker.shutdown()

# New
from app.tasks.procrastinate_app import procrastinate_app
await procrastinate_app.open_async()
app.state.procrastinate_app = procrastinate_app
# ...
await procrastinate_app.close_async()
```

`open_async()` opens the Procrastinate connector's connection pool. This is needed in the API process to enable `defer_async()` (job dispatch). The API does NOT run the worker -- it only dispatches jobs.

#### DELETED: `app/tasks/broker.py`

This file is removed entirely. TaskIQ is uninstalled.

#### NEW: Worker Entrypoint

The worker runs separately from the API. Two options for running it:

**Option A: Procrastinate CLI (recommended for production)**

```bash
procrastinate --app=app.tasks.procrastinate_app.procrastinate_app worker --queue=imports
```

**Option B: Programmatic worker (for Docker Compose dev)**

Create `scripts/run-worker.py`:

```python
"""Run the Procrastinate worker for background import processing."""
import asyncio
from app.tasks.procrastinate_app import procrastinate_app

async def main():
    async with procrastinate_app.open_async():
        await procrastinate_app.run_worker_async(queues=["imports"])

if __name__ == "__main__":
    asyncio.run(main())
```

#### NEW: Docker Compose worker service

```yaml
worker:
  build:
    context: .
    target: dev
  container_name: run-api-worker
  command: python /home/app/scripts/run-worker.py
  env_file:
    - .env
    - path: .env.zitadel
      required: false
  environment:
    DATABASE_URL: postgresql+asyncpg://postgres:postgres@postgres:5432/run_api
    DATABASE_URL_SYNC: postgresql+psycopg2://postgres:postgres@postgres:5432/run_api
    S3_ENDPOINT_URL: http://minio:9000
  volumes:
    - ./app:/home/app/app
    - ./scripts:/home/app/scripts
  depends_on:
    postgres:
      condition: service_healthy
    minio:
      condition: service_healthy
  restart: unless-stopped
```

The worker uses the same Docker image as the API but runs a different command. It shares the same codebase, same database, same S3 configuration.

#### NEW: Kubernetes worker deployment

For production, add a separate Deployment for the worker:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: run-api-worker
  namespace: civpulse-prod
spec:
  replicas: 1
  selector:
    matchLabels:
      app: run-api-worker
  template:
    spec:
      containers:
        - name: worker
          image: ghcr.io/civicpulse/run-api:sha-XXXXX
          command: ["python", "-m", "procrastinate",
                    "--app=app.tasks.procrastinate_app.procrastinate_app",
                    "worker", "--queue=imports"]
          envFrom:
            - configMapRef:
                name: run-api-config
            - secretRef:
                name: run-api-secret
          resources:
            requests:
              memory: "256Mi"
              cpu: "200m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

No liveness/readiness probes needed for the worker (it has no HTTP server). The worker is stateless -- it can be killed and restarted at any time. The resumable import logic handles crash recovery.

---

## Data Flow: Resumable Batch Processing

### Happy Path

```
1. User confirms mapping -> POST /confirm
   |
   v
2. Endpoint sets job.status = QUEUED, commits
   |
   v
3. import_voter_file.defer_async(import_job_id=...)
   -> INSERT into procrastinate_jobs table
   -> PostgreSQL NOTIFY signals worker
   |
   v
4. Worker picks up job via LISTEN
   |
   v
5. Worker creates AsyncSession, sets RLS context
   |
   v
6. Downloads CSV from MinIO
   |
   v
7. For each batch of 1000 rows:
   a. process_csv_batch() upserts voters
   b. Update job.imported_rows, job.last_completed_batch
   c. COMMIT (progress now visible to polling endpoint)
   d. Re-set RLS context (reset by commit)
   |
   v
8. All batches done -> job.status = COMPLETED, commit
   |
   v
9. Procrastinate marks job as "succeeded" in procrastinate_jobs
```

### Crash Recovery Path

```
1. Worker crashes after batch 50 of 100
   |
   v
2. ImportJob state in DB:
   - status: PROCESSING
   - imported_rows: 50000
   - last_completed_batch: 50
   - Batches 0-49 are COMMITTED (voters in database)
   |
   v
3. Procrastinate detects job not completed
   -> Retry after wait period (30s)
   -> Re-dispatches to available worker
   |
   v
4. Worker picks up retried job
   |
   v
5. Reads job.last_completed_batch = 50
   |
   v
6. Downloads CSV from MinIO (same file)
   |
   v
7. Skips batches 0-49 (CSV rows 0-49999)
   |
   v
8. Processes batches 50-99 (remaining rows)
   |
   v
9. job.status = COMPLETED
```

### Progress Polling

```
Frontend polls GET /imports/{id} every 2-3 seconds
  |
  v
Endpoint reads ImportJob from database
  |
  v
Because batches are COMMITTED individually:
  - imported_rows reflects actual committed progress
  - total_rows updates as file is scanned
  - Frontend can show: "Imported 45,000 of ~120,000 rows"
  |
  v
On COMPLETED or FAILED, frontend stops polling
```

---

## RLS Context in the Worker

This is the most critical integration point. The worker runs outside the FastAPI request lifecycle, so it must manage RLS context manually.

### How It Works Now

In the API process, `get_campaign_db()` (deps.py) creates a session and calls `set_campaign_context()` before yielding. This sets `app.current_campaign_id` as a transaction-scoped PostgreSQL config variable.

The existing `import_task.py` already does this correctly:

```python
async with async_session_factory() as session:
    job = await session.get(ImportJob, uuid.UUID(import_job_id))
    await set_campaign_context(session, str(job.campaign_id))
```

### What Changes for Per-Batch Commits

The critical change: `set_config(..., true)` scopes to the current transaction. When `session.commit()` is called after each batch, the RLS context is **lost**. The next batch would operate with the null-UUID context from the pool checkout defense, which blocks all queries.

**Solution**: Re-call `set_campaign_context()` after every `session.commit()`. This is shown in the `process_import_file_resumable()` code above.

### Worker Session Pattern

The worker does NOT use `get_campaign_db()` (that is a FastAPI dependency). Instead, it uses `async_session_factory()` directly and manages RLS context explicitly:

```python
async with async_session_factory() as session:
    # 1. Load job (no RLS needed -- import_jobs is loaded by primary key)
    job = await session.get(ImportJob, uuid.UUID(import_job_id))

    # 2. Set RLS for voter operations
    await set_campaign_context(session, str(job.campaign_id))

    # 3. Process batches with per-batch commit
    for batch in batches:
        await process_csv_batch(batch, ..., session)
        await session.commit()
        # 4. RLS context lost! Re-set it.
        await set_campaign_context(session, str(job.campaign_id))
```

The pool checkout defense (`reset_rls_context` in session.py) provides an additional safety net. Even if the re-set is missed, the pool checkout event resets to the null UUID, preventing accidental cross-campaign access (queries return empty results rather than wrong-campaign data).

### Worker Does Not Need FastAPI Dependencies

The worker has NO dependency on FastAPI, ZITADEL auth, rate limiting, or CORS. It only needs:
- `async_session_factory` from `app.db.session`
- `set_campaign_context` from `app.db.rls`
- `ImportService` from `app.services.import_service`
- `StorageService` from `app.services.storage`
- `ImportJob` model from `app.models.import_job`

This means the worker can import these modules without triggering FastAPI app creation. The Procrastinate app (`procrastinate_app.py`) does not import the FastAPI app.

---

## Database Schema Changes

### New Procrastinate Tables (auto-managed)

Procrastinate creates its own tables when you run its schema migration:

```bash
procrastinate --app=app.tasks.procrastinate_app.procrastinate_app schema --apply
```

This creates tables in the `public` schema:
- `procrastinate_jobs` -- job queue (task name, args, status, retry info)
- `procrastinate_events` -- job lifecycle events (for monitoring)
- `procrastinate_periodic_defers` -- periodic task tracking (not needed for imports)

These tables are managed by Procrastinate, not by Alembic. Run the schema command once during deployment (add to init container or dev-entrypoint.sh).

**Integration with Alembic**: Procrastinate's schema is independent. It does not conflict with Alembic migrations. The `procrastinate schema --apply` command is idempotent (safe to run repeatedly).

**RLS consideration**: Procrastinate's tables do NOT need RLS policies. They store task metadata (job IDs, task names, arguments), not tenant data. The campaign_id is passed as a task argument, and actual tenant data operations happen through the RLS-protected SQLAlchemy session.

### Alembic Migration: ImportJob Columns

New migration `017_import_resumability.py`:

```python
"""Add resumability columns to import_jobs.

Revision ID: 017
"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    op.add_column("import_jobs", sa.Column(
        "last_completed_batch", sa.Integer(), server_default="0", nullable=False
    ))
    op.add_column("import_jobs", sa.Column(
        "batch_size", sa.Integer(), server_default="1000", nullable=False
    ))

def downgrade() -> None:
    op.drop_column("import_jobs", "batch_size")
    op.drop_column("import_jobs", "last_completed_batch")
```

---

## Dependency Changes

### Add

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `procrastinate` | >=2.0 | PostgreSQL job queue | Replaces TaskIQ; uses existing PG, no new infra |
| `psycopg[binary]` | >=3.1 | Procrastinate's PostgreSQL driver | Procrastinate v2 requires psycopg3, not psycopg2 |

### Remove

| Package | Purpose | Why Remove |
|---------|---------|------------|
| `taskiq` | In-memory task broker | Replaced by Procrastinate |
| `taskiq-fastapi` | TaskIQ FastAPI integration | No longer needed |

### Keep

| Package | Purpose | Notes |
|---------|---------|-------|
| `psycopg2-binary` | Alembic sync migrations | Still needed for `DATABASE_URL_SYNC` in alembic.ini |
| `asyncpg` | SQLAlchemy async driver | Still the primary database driver for all app queries |

**Two PostgreSQL drivers note**: The application will have both `asyncpg` (for SQLAlchemy async sessions) and `psycopg` (for Procrastinate connector). This is intentional and non-conflicting -- they serve different purposes and maintain separate connection pools.

---

## Integration with Existing Patterns

### StorageService Access

The worker instantiates `StorageService()` directly (same as the current `import_task.py`). StorageService reads S3 credentials from `settings`, which are loaded from environment variables. The worker container gets the same env vars as the API container.

No change needed to StorageService.

### Error Handling and Sentry

The worker process should initialize Sentry separately. Add to the worker entrypoint:

```python
from app.core.sentry import init_sentry
init_sentry()
```

Procrastinate task failures will be captured by Sentry's exception handler. The `logger.exception()` calls in the task function trigger structlog/loguru output, and Sentry captures the exception context.

### Health Checks

The worker has no HTTP server, so it cannot expose `/health/live` endpoints. For Kubernetes liveness:

1. **Simplest approach**: Rely on Procrastinate's built-in heartbeat -- if the worker process dies, Kubernetes restarts the pod.
2. **Advanced approach** (not needed for v1.6): Add a sidecar health endpoint that checks the worker process is alive.

The Kubernetes deployment uses `restartPolicy: Always`, so a crashed worker pod restarts automatically.

---

## Suggested Build Order

### Phase 1: Procrastinate Schema + App Setup

1. Add `procrastinate` and `psycopg[binary]` to `pyproject.toml`
2. Remove `taskiq` and `taskiq-fastapi` from `pyproject.toml`
3. Create `app/tasks/procrastinate_app.py` with connector config
4. Add Procrastinate schema apply to `scripts/dev-entrypoint.sh`
5. Test: Procrastinate tables created in PostgreSQL

**Rationale**: Foundation must exist before tasks can be defined.

### Phase 2: Alembic Migration + Model Changes

1. Create migration `017_import_resumability.py` (add `last_completed_batch`, `batch_size`)
2. Update `ImportJob` model with new columns
3. Update `ImportJobResponse` schema (add `last_completed_batch` for frontend progress display)
4. Test: Migration runs, model loads correctly

**Rationale**: Model changes needed before service logic can use them.

### Phase 3: Resumable ImportService

1. Add `process_import_file_resumable()` to `ImportService`
2. Key change: per-batch commits with RLS context re-set after each commit
3. Key change: skip batches before `last_completed_batch` on resume
4. Keep existing `process_import_file()` temporarily (for rollback safety)
5. Test: Unit test batch processing with mock session

**Rationale**: Service logic must be correct before wiring to task queue.

### Phase 4: Task + Endpoint Wiring

1. Rewrite `app/tasks/import_task.py` with Procrastinate task decorator
2. Update `app/api/v1/imports.py` confirm_mapping to use `defer_async()`
3. Update `app/main.py` lifespan to open/close Procrastinate app
4. Remove `app/tasks/broker.py`
5. Update response status to 202 Accepted
6. Test: End-to-end import via Procrastinate

**Rationale**: Wiring connects all pieces; test end-to-end.

### Phase 5: Worker Deployment

1. Create `scripts/run-worker.py`
2. Add `worker` service to `docker-compose.yml`
3. Create K8s worker Deployment manifest
4. Update dev-entrypoint.sh for Procrastinate schema
5. Test: Full import flow with separate worker container

**Rationale**: Deployment is last because it requires all code to be in place.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sharing SQLAlchemy Session Between Procrastinate and App
**What**: Using Procrastinate's SQLAlchemy connector to share the app's session factory.
**Why bad**: Procrastinate needs its own connection for `LISTEN/NOTIFY`. Mixing concerns causes connection pool contention and unpredictable behavior.
**Instead**: Use `PsycopgConnector` with its own connection string. Let Procrastinate manage its own connections.

### Anti-Pattern 2: Running Worker In-Process
**What**: Running the Procrastinate worker inside the FastAPI process (like the current InMemoryBroker).
**Why bad**: Long-running imports block the event loop, affecting API response times. Worker crashes take down the API.
**Instead**: Always run the worker as a separate process/container. Even in development.

### Anti-Pattern 3: Accumulating Errors in Memory Across Batches
**What**: Collecting all error rows in a list across all batches, then writing the error report at the end.
**Why bad**: A 500K-row file with 10% errors means 50K error dicts in memory. On crash, all error data is lost.
**Instead**: Write error rows to a temporary S3 object per batch, then merge at completion. Or accept that error reports for resumed imports only cover the resumed portion (simpler, and acceptable for v1.6).

### Anti-Pattern 4: Forgetting RLS Context After Commit
**What**: Committing a batch and proceeding to the next without re-setting `set_campaign_context()`.
**Why bad**: Transaction-scoped RLS config resets on commit. The next batch operates under the null-UUID context, causing all voter queries to return empty results or fail silently.
**Instead**: Always call `set_campaign_context()` immediately after `session.commit()`.

### Anti-Pattern 5: Using Procrastinate's `defer()` (Sync) in Async Code
**What**: Calling `import_voter_file.defer()` instead of `import_voter_file.defer_async()` from the async FastAPI endpoint.
**Why bad**: `defer()` is synchronous and blocks the event loop. In an async FastAPI endpoint, this causes a warning and potential performance issues.
**Instead**: Always use `defer_async()` in async contexts.

---

## Scalability Considerations

| Concern | Current (1 pod) | At 10 concurrent imports | At 100 concurrent imports |
|---------|-----------------|--------------------------|---------------------------|
| Worker throughput | 1 import at a time | Add worker replicas in K8s | Horizontal scale workers |
| Database connections | ~5 (API pool) | +1 per worker | Consider PgBouncer |
| S3 download | 1 file in memory | 10 files in memory (~1GB) | Stream instead of buffer |
| PostgreSQL locks | No contention | Low (different campaign_ids) | Monitor lock waits |
| Job queue depth | Instant pickup | Queue backlog possible | Monitor `procrastinate_jobs` |

For v1.6, a single worker replica is sufficient. The import queue is low-throughput (campaigns import files occasionally, not continuously). Scaling to multiple workers is a configuration change (increase K8s replicas), not a code change.

---

## Sources

- Codebase analysis: `app/tasks/broker.py` (current InMemoryBroker, 10 lines)
- Codebase analysis: `app/tasks/import_task.py` (current task definition, RLS pattern)
- Codebase analysis: `app/services/import_service.py` (full import pipeline, 978 lines)
- Codebase analysis: `app/api/v1/imports.py` (endpoint dispatch, 467 lines)
- Codebase analysis: `app/models/import_job.py` (ImportJob model, ImportStatus enum)
- Codebase analysis: `app/db/rls.py` (set_campaign_context with transaction-scoped set_config)
- Codebase analysis: `app/db/session.py` (pool checkout defense, async_session_factory)
- Codebase analysis: `app/core/config.py` (database_url format)
- Codebase analysis: `app/main.py` (lifespan broker startup/shutdown)
- Codebase analysis: `docker-compose.yml` (service topology, PostgreSQL 17)
- Codebase analysis: `k8s/apps/run-api-prod/deployment.yaml` (production deployment pattern)
- Codebase analysis: `Dockerfile` (multi-stage build, worker would use same image)
- Codebase analysis: `pyproject.toml` (current dependencies: taskiq 0.12.1, taskiq-fastapi 0.4.0)
- Procrastinate documentation (training data, HIGH confidence): PsycopgConnector, App configuration, task decorators, defer_async(), worker CLI, schema management, retry strategies
- Procrastinate GitHub repository (training data, HIGH confidence): psycopg3 requirement, LISTEN/NOTIFY architecture, connection pool management
- Note: WebSearch and WebFetch were unavailable during this research. Procrastinate findings are based on training data (knowledge cutoff May 2025). The library API should be verified against current docs before implementation. Core concepts (PostgreSQL job storage, LISTEN/NOTIFY, PsycopgConnector) are stable across versions.
