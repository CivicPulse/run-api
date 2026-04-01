# Technology Stack: v1.11 Chunked Parallel Imports

**Project:** CivicPulse Run API
**Researched:** 2026-04-01
**Overall confidence:** HIGH (existing stack is proven; no new dependencies needed)

## Executive Summary

The v1.11 chunked parallel import pipeline requires **zero new library dependencies**. Everything needed -- parent/child job orchestration, parallel upsert coordination, chunk splitting, and progress aggregation -- is achievable with the existing stack: Procrastinate for job fan-out, SQLAlchemy async for per-chunk sessions, PostgreSQL advisory locks for coordination, and Python's standard `csv` module for row-based chunking. The only additions are new application-level models (ImportChunk), new task definitions, and configuration settings.

## Recommended Stack

### No New Dependencies

| Technology | Current Version | Purpose | Status |
|------------|----------------|---------|--------|
| Procrastinate | >=3.7.3 (installed) | Parent/child job orchestration via `defer_async` | **No change** |
| SQLAlchemy async | (installed) | Per-chunk independent sessions with `async_session_factory` | **No change** |
| PostgreSQL | 16+ (deployed) | Advisory locks, `INSERT ON CONFLICT`, RLS | **No change** |
| MinIO/S3 | (deployed) | CSV storage, error report storage | **No change** |
| Python csv | stdlib | Row-based CSV parsing (no byte-offset seeking needed) | **No change** |

### New Application Code (not libraries)

| Component | Purpose | Why |
|-----------|---------|-----|
| `ImportChunk` model | Track per-chunk state (row range, status, progress) | Parent needs to aggregate child status |
| `process_chunk` task | Procrastinate task for one chunk range | Fan-out target; one task per chunk |
| `finalize_import` task | Aggregation task after all chunks complete | Merges error reports, sets final status |
| `import_chunk_size` setting | Configurable rows-per-chunk (default ~10,000) | Tunable without code change |

## Procrastinate Parent/Child Job Pattern

### How It Works (no library changes needed)

Procrastinate has no built-in parent/child abstraction, but the pattern is straightforward because `defer_async` can be called from within a running task. The existing `process_import` task becomes the "split" task:

```python
@procrastinate_app.task(name="process_import", queue="imports")
async def process_import(import_job_id: str, campaign_id: str) -> None:
    """Phase 1: Count rows, create chunks, defer child tasks."""
    # 1. Stream CSV header + count total rows (lightweight scan)
    # 2. Create ImportChunk rows in DB (e.g., rows 1-10000, 10001-20000, ...)
    # 3. Defer one process_chunk task per chunk
    for chunk in chunks:
        await process_chunk.defer_async(
            chunk_id=str(chunk.id),
            import_job_id=import_job_id,
            campaign_id=campaign_id,
        )
    # 4. Defer finalize_import (scheduled slightly in future, or polled)
```

**Confidence: HIGH** -- The project already uses `process_import.configure(queueing_lock=...).defer_async()` from the API layer (app/api/v1/imports.py line 263-268). Calling `defer_async` from within a task uses the identical mechanism; Procrastinate tasks run inside `open_async()` context where the connector is available.

### Chunk Completion Detection

Two viable approaches, recommend Option A:

**Option A: Last-chunk-finalizes (simpler)**
Each chunk task, after completing its work, runs a single query: `SELECT COUNT(*) FROM import_chunks WHERE import_job_id = :id AND status != 'completed'`. If count is 0, that chunk is the last one and runs finalization inline. Protected by `pg_try_advisory_lock` to prevent race between two chunks completing simultaneously.

**Option B: Polling finalize task**
Defer a `finalize_import` task with a scheduled time slightly after expected completion. It checks if all chunks are done; if not, it re-defers itself with a short delay. More complex, wastes a poll cycle.

**Recommendation: Option A** because it requires no polling, completes immediately when the last chunk finishes, and advisory locks are already a proven pattern in this codebase (v1.10 uses them for recovery).

### Queueing Lock Compatibility

The existing `queueing_lock=str(campaign_id)` on `process_import` prevents concurrent imports for the same campaign. Child `process_chunk` tasks do NOT need queueing locks -- they are unique by chunk ID and only created by the parent. The parent task retains the queueing lock, so the existing 409 Conflict behavior is preserved.

## Parallel SQLAlchemy Upsert Considerations

### Critical: Deadlock Prevention

**The Problem:** When multiple chunk workers run `INSERT ... ON CONFLICT DO UPDATE` on the `voters` table concurrently, PostgreSQL acquires row-level locks on conflicting rows. If chunk A locks row X then tries to lock row Y, while chunk B locks row Y then tries to lock row X, PostgreSQL detects a deadlock and aborts one transaction.

**Why This Matters Here:** The current upsert uses `(campaign_id, source_type, source_id)` as the conflict key. Two chunks processing different CSV row ranges should NOT have overlapping `source_id` values -- each CSV row has a unique source_id. However, if the same voter appears in the CSV twice (duplicate rows), two chunks could try to upsert the same row.

**Prevention Strategy (sort before upsert):**

```python
# In process_csv_batch, before building the INSERT statement:
valid_voters.sort(key=lambda v: v.get("source_id", ""))
```

Sorting by the conflict key ensures all concurrent transactions acquire locks in the same order, eliminating deadlocks. This is the standard PostgreSQL recommendation.

**Confidence: HIGH** -- PostgreSQL documentation and multiple verified sources confirm that consistent row ordering prevents deadlocks in concurrent upsert scenarios.

### Session Isolation

Each chunk task MUST create its own `AsyncSession` via `async_session_factory()`. The existing pattern in `import_task.py` already does this correctly. Never share a session across concurrent tasks -- SQLAlchemy explicitly prohibits concurrent operations on a single `AsyncSession`.

### RLS Context Per Chunk

Each chunk session must call `set_campaign_context(session, campaign_id)` before any query, and `commit_and_restore_rls(session, campaign_id)` after each batch commit. This is identical to the current single-task pattern -- no changes needed to `app/db/rls.py`.

### VoterPhone Upsert Safety

The `VoterPhone` upsert uses `ON CONFLICT DO UPDATE` on `uq_voter_phone_campaign_voter_value`. Same deadlock risk applies. Same solution: sort phone records by `(voter_id, value)` before the INSERT.

### PostGIS Geometry Update Safety

The current `UPDATE voters SET geom = ST_SetSRID(...)  WHERE id = ANY(:ids)` is safe for parallel execution because each chunk's `voter_ids` list is disjoint (different voters). No contention.

## CSV Chunk Splitting Strategy

### Why NOT Byte-Offset Seeking

The current pipeline streams CSV from MinIO via `stream_csv_lines()` -- an async generator that yields decoded text lines from S3 byte chunks. The file is in S3/MinIO, not on local disk. Byte-offset seeking would require:
1. S3 Range requests (supported but adds complexity)
2. Finding line boundaries at arbitrary byte offsets (encoding-dependent)
3. Handling multi-byte characters split across range boundaries
4. Re-detecting encoding per chunk

This complexity is unnecessary because the bottleneck is DB upsert, not CSV parsing.

### Recommended: Row-Count Chunking (Pre-scan)

**Phase 1 (parent task):** Stream the entire CSV once, counting rows. This is fast -- it is just reading lines, no parsing or DB work. Store total row count on the ImportJob.

**Phase 2 (parent task):** Create ImportChunk records with row ranges:
- Chunk 1: rows 1-10000
- Chunk 2: rows 10001-20000
- etc.

**Phase 3 (child tasks):** Each chunk task streams the CSV from MinIO using the existing `stream_csv_lines()`, skips rows before its start offset (identical to the existing crash-resume skip logic at line 1280), and processes rows in its range.

**Why this works:** The skip cost is linear but cheap (just string iteration, no CSV parsing or DB work). For a 100K-row file with 10K chunks, the worst-case skip is 90K lines which takes <1 second on MinIO streaming. The DB upsert (the actual bottleneck) takes orders of magnitude longer.

**Alternative considered and rejected:** Splitting the CSV into separate S3 objects. This adds upload time, storage cost, cleanup logic, and failure modes -- all for a marginal improvement in skip time that does not matter because DB upsert dominates.

### Memory Safety

Each chunk task has the same memory profile as the current single-task import: ~2 batches + 1 S3 chunk (~64KB). Running N chunks in parallel uses N * that amount, which is negligible.

## Secondary Work Offloading

### What to Offload (Phase 2 of milestone)

Per the user's analysis in `docs/import-parallelization-options.md`, secondary work offloading is the recommended first step:

| Work | Currently | Offloaded To |
|------|-----------|-------------|
| VoterPhone creation | Inline in `process_csv_batch` | Separate post-batch task OR keep inline (see below) |
| PostGIS geometry update | Inline `UPDATE voters SET geom` | Separate post-chunk task |
| Future: analytics counters | N/A | Separate post-import task |

**Recommendation: Keep VoterPhone inline, offload geometry.**

VoterPhone creation is fast (simple INSERT with small payload) and users expect phones to be available immediately after import. Offloading it adds eventual consistency complexity for minimal latency gain.

PostGIS `ST_SetSRID(ST_MakePoint(...))` is heavier and not needed until turf operations. Offload to a `update_voter_geometry` task that runs after each chunk completes.

### Task Definition

```python
@procrastinate_app.task(name="update_voter_geometry", queue="imports")
async def update_voter_geometry(voter_ids: list[str], campaign_id: str) -> None:
    """Update PostGIS geometry for a batch of voters."""
    ...
```

This uses the same `imports` queue. If you want geometry updates to not compete with chunk processing, use a separate queue (e.g., `queue="secondary"`). The worker already filters by queue name, so you would either run a second worker or add the queue to the existing worker's `queues=` list.

## Configuration Additions

| Setting | Default | Purpose |
|---------|---------|---------|
| `import_chunk_size` | 10000 | Rows per chunk for parallel processing |
| `import_max_chunks` | 10 | Cap on parallel chunk tasks (prevents 1M-row file from creating 100 tasks) |
| `import_parallel_enabled` | False | Feature flag; False = existing serial behavior |

`import_parallel_enabled` allows gradual rollout. When False, `process_import` runs the existing serial path. When True, it splits into chunks.

## What NOT to Add

| Library/Tool | Why NOT |
|--------------|---------|
| Celery | Already have Procrastinate; adding a second job queue is madness |
| Redis | Procrastinate uses PostgreSQL; no need for another stateful service |
| Dask / Ray | Overkill for CSV chunking; these are for compute-heavy workloads |
| pandas | CSV parsing is trivial with stdlib `csv`; pandas adds 150MB+ to container |
| asyncio.TaskGroup | Tasks must survive worker restarts; in-process parallelism is not durable |
| S3 Select | Not supported by MinIO; also adds vendor lock-in |
| multiprocessing | Same durability problem as TaskGroup; use Procrastinate tasks instead |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Job orchestration | Procrastinate defer_async from task | Celery canvas (chord/group) | Would require replacing the entire job queue infrastructure |
| Chunk splitting | Row-count pre-scan + skip | S3 Range requests with byte offsets | Complexity for marginal gain; DB is the bottleneck |
| Chunk splitting | Row-count pre-scan + skip | Split into separate S3 files | Upload overhead, cleanup logic, failure modes |
| Completion detection | Last-chunk advisory lock check | Polling finalize task | Wastes cycles, adds latency |
| Completion detection | Last-chunk advisory lock check | PostgreSQL LISTEN/NOTIFY | Over-engineered for this use case |
| Deadlock prevention | Sort by source_id before upsert | Retry on deadlock detection | Retries are wasteful; sorting is deterministic |
| Geometry offloading | Post-chunk Procrastinate task | Keep inline | Geometry is the heaviest per-row operation; offloading it reduces chunk latency |

## Database Schema Additions

New table (managed by Alembic migration):

```sql
CREATE TABLE import_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    chunk_index INTEGER NOT NULL,
    start_row INTEGER NOT NULL,
    end_row INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending/processing/completed/failed
    imported_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    phones_created INTEGER DEFAULT 0,
    error_report_key VARCHAR(500),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(import_job_id, chunk_index)
);

-- RLS policy (same pattern as import_jobs)
ALTER TABLE import_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_chunks_campaign_isolation ON import_chunks
    USING (campaign_id = current_setting('app.current_campaign_id')::uuid);
```

## Worker Scaling

The existing worker runs `queues=["imports"]`. With chunked imports, multiple worker replicas can pick up chunk tasks concurrently. No code changes needed to the worker itself -- just scale the K8s Deployment replicas.

Recommended: Start with 3 worker replicas for parallel chunk processing. Each worker picks up one task at a time (Procrastinate default concurrency=1 per worker). 3 workers = 3 chunks processing in parallel.

For higher parallelism, either increase replicas or configure Procrastinate's `concurrency` parameter (number of concurrent tasks per worker process). However, since each task holds a DB session and does heavy I/O, 1-2 concurrent tasks per worker is safer to avoid connection pool exhaustion.

## Sources

- [Procrastinate documentation](https://procrastinate.readthedocs.io/) -- task deferral, queueing locks, worker configuration
- [Procrastinate GitHub](https://github.com/procrastinate-org/procrastinate) -- source code, discussions
- [PostgreSQL INSERT ON CONFLICT deadlock analysis](https://rcoh.svbtle.com/postgres-unique-constraints-can-cause-deadlock) -- row ordering prevents deadlocks
- [PostgreSQL advisory locks documentation](https://www.postgresql.org/docs/current/explicit-locking.html) -- pg_try_advisory_lock for coordination
- [SQLAlchemy async session discussion](https://github.com/sqlalchemy/sqlalchemy/discussions/9312) -- one session per task, never share
- Existing codebase: `app/tasks/import_task.py`, `app/services/import_service.py`, `app/api/v1/imports.py`, `app/tasks/procrastinate_app.py`
- User analysis: `docs/import-parallelization-options.md`
