# Architecture Patterns

**Domain:** Chunked parallel CSV import pipeline for multi-tenant campaign platform
**Researched:** 2026-04-01

## Current Architecture (Baseline)

```
Frontend           API                    Procrastinate Queue        Worker
  |                  |                          |                      |
  |--POST /confirm-->|                          |                      |
  |                  |--defer(process_import)--->|                      |
  |                  |  queueing_lock=campaign   |                      |
  |<--202 QUEUED-----|                          |                      |
  |                  |                          |---process_import----->|
  |                  |                          |                      |
  |                  |                          |  stream_csv_lines()   |
  |                  |                          |  for each batch:      |
  |                  |                          |    upsert voters      |
  |                  |                          |    create phones      |
  |                  |                          |    update geom        |
  |                  |                          |    COMMIT + RLS       |
  |                  |                          |    check cancelled_at |
  |                  |                          |  merge error files    |
  |                  |                          |  set COMPLETED        |
```

**Key characteristics:**
- One Procrastinate task per import, serial batch loop
- Per-batch COMMIT with RLS restore (`commit_and_restore_rls`)
- Crash-resume from `last_committed_row` (skip already-processed rows)
- Per-campaign `queueing_lock` prevents concurrent imports
- Cancellation via `cancelled_at` timestamp, checked between batches
- Phones, geometry, and derived fields computed inline per-batch
- Batch size dynamically capped by asyncpg 32,767 bind-parameter limit
- Default `import_batch_size = 1000`

## Recommended Architecture: Parent/Child Chunk Model

```
                         confirm_mapping()
                               |
                    defer(split_import)
                    queueing_lock=campaign_id
                               |
                      +--------v--------+
                      |  split_import   |  (Phase 1 task: the "splitter")
                      |  task           |
                      +--------+--------+
                               |
               count CSV rows via stream_csv_lines()
               create ImportChunk rows in DB
               defer N process_chunk tasks
               set parent status = PROCESSING
                               |
            +------------------+------------------+
            |                  |                  |
   +--------v------+  +-------v-------+  +-------v-------+
   | process_chunk |  | process_chunk |  | process_chunk |
   | chunk_id=A    |  | chunk_id=B    |  | chunk_id=C    |
   | rows 1-10000  |  | rows 10001-   |  | rows 20001-   |
   +--------+------+  +-------+-------+  +-------+-------+
            |                  |                  |
            |  Each chunk:     |                  |
            |  - open own session                 |
            |  - set RLS context                  |
            |  - seek to start_row                |
            |  - batch loop (same as today)       |
            |  - update chunk status              |
            |  - on last chunk done:              |
            |    aggregate into parent            |
            +------------------+------------------+
                               |
                     Parent marked COMPLETED
                     (or COMPLETED_WITH_ERRORS)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `ImportJob` model (modified) | Parent job lifecycle, aggregate progress, user-facing status | API endpoints, frontend polling |
| `ImportChunk` model (NEW) | Per-chunk state: row range, status, counters, error key | Chunk tasks, aggregation logic |
| `split_import` task (NEW) | Count rows, create chunks, defer chunk tasks | Procrastinate queue, ImportChunk model |
| `process_chunk` task (NEW) | Process one row range, update chunk status, trigger aggregation | ImportChunk, ImportJob, ImportService |
| `ImportService` (modified) | Batch processing logic (mostly unchanged), new chunk-aware entry point | DB session, StorageService |
| API endpoints (modified) | Confirm triggers splitter instead of processor; cancel propagates to chunks | ImportJob, Procrastinate |

## New Model: ImportChunk

```python
class ChunkStatus(enum.StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ImportChunk(Base):
    __tablename__ = "import_chunks"

    id: Mapped[uuid.UUID]           # PK
    import_job_id: Mapped[uuid.UUID]  # FK -> import_jobs.id
    campaign_id: Mapped[uuid.UUID]    # FK -> campaigns.id (for RLS)
    chunk_index: Mapped[int]          # 0-based ordering
    start_row: Mapped[int]            # inclusive, 1-based row offset
    end_row: Mapped[int]              # inclusive
    status: Mapped[ChunkStatus]       # lifecycle
    imported_rows: Mapped[int | None]
    skipped_rows: Mapped[int | None]
    phones_created: Mapped[int | None]
    last_committed_row: Mapped[int | None]  # for crash-resume within chunk
    error_report_key: Mapped[str | None]    # per-chunk error CSV in MinIO
    error_message: Mapped[str | None]
    started_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    created_at: Mapped[datetime]
```

**RLS note:** `import_chunks` MUST have a `campaign_id` column with an RLS policy identical to `import_jobs`. Without this, chunk queries from the worker would fail or leak data. The FK to `import_jobs.id` alone is insufficient because RLS filters require `campaign_id` on every table.

**Why a separate table, not JSONB on ImportJob:** Concurrent chunk workers updating JSONB on the same parent row creates write contention and lost-update races. Separate rows allow independent, lock-free updates. Aggregation reads (SUM/COUNT) are cheap.

## Modified Model: ImportJob

Add to existing `ImportJob`:

```python
# New columns
total_chunks: Mapped[int | None]       # how many chunks were created
completed_chunks: Mapped[int | None]   # aggregated count for fast polling
is_chunked: Mapped[bool]               # False for legacy/small imports
```

`is_chunked` distinguishes between the new parallel path and the existing serial path. Small files (below a threshold, e.g., 10,000 rows) skip chunking entirely and use the current serial `process_import` task unchanged. This preserves backward compatibility and avoids overhead for small imports.

## Data Flow: Split Phase

The `split_import` task runs as a single serial step before any parallel work begins:

1. **Open session, set RLS context** for `campaign_id`
2. **Count total CSV rows** by streaming through `stream_csv_lines()` and counting lines (header excluded). This is I/O only, no parsing. For a 114K-row file this takes seconds.
3. **Compute chunk boundaries**: `chunk_size = settings.import_chunk_size` (default 25,000 rows). Divide total rows into chunks with `(start_row, end_row)` ranges.
4. **Insert ImportChunk rows** in a single batch INSERT.
5. **Update parent**: `total_rows`, `total_chunks`, `is_chunked = True`, `status = PROCESSING`.
6. **COMMIT** (single transaction for all chunk rows + parent update).
7. **Defer chunk tasks**: one `process_chunk.defer_async(chunk_id=..., campaign_id=...)` per chunk. NO queueing_lock on chunk tasks -- they must run in parallel.

**Why count first, not split on the fly:** Row counting gives deterministic chunk boundaries before any processing starts. This makes crash-resume trivial (each chunk knows its exact row range) and avoids the complexity of a producer-consumer pipeline. The count pass is fast because it only reads bytes and counts newlines.

**Queueing lock design:** The `split_import` task uses `queueing_lock=str(campaign_id)` (same as today's `process_import`), preserving the per-campaign concurrency prevention. Individual `process_chunk` tasks use NO queueing lock, so Procrastinate schedules them concurrently across workers.

## Data Flow: Chunk Processing

Each `process_chunk` task:

1. **Open its own session** via `async_session_factory()`.
2. **Set RLS context** for `campaign_id`.
3. **Load the ImportChunk** and parent ImportJob (for `field_mapping`, `file_key`, `source_type`).
4. **Check cancellation**: if parent `cancelled_at IS NOT NULL`, mark chunk CANCELLED and return.
5. **Resume detection**: if chunk `status = PROCESSING` and `last_committed_row > start_row`, this is crash recovery. Skip to `last_committed_row`.
6. **Stream CSV** via `stream_csv_lines()`, skip rows before `start_row`, process rows until `end_row`.
7. **Batch loop** (identical to current `_process_single_batch`): upsert voters, create phones, update geom, COMMIT + RLS restore, check parent `cancelled_at`.
8. **Update chunk counters** after each batch commit: `imported_rows`, `skipped_rows`, `phones_created`, `last_committed_row`.
9. **On completion**: mark chunk `COMPLETED`, write chunk error CSV to MinIO if any.
10. **Trigger aggregation** (see below).

**Each chunk opens its own DB session.** This is critical. Chunks run as independent Procrastinate tasks, potentially on different worker pods. They cannot share a session. Each session gets its own RLS context via `set_campaign_context`.

**Row seeking:** `stream_csv_lines()` yields lines sequentially. Each chunk must skip lines before its `start_row`. This means every chunk reads from the beginning of the file. For a 3-chunk file, chunk 3 skips 2/3 of the lines before processing. This is acceptable because:
- S3 streaming is fast (network I/O, not disk)
- Skipping is just counting newlines, no CSV parsing
- The alternative (byte-offset seeking with S3 Range headers) requires a pre-pass to find newline positions, adding complexity for marginal gain

**Optimization note:** If skip overhead becomes measurable for very large files (1M+ rows), a future enhancement can store byte offsets during the count pass and use S3 Range requests. This is not needed for the initial implementation.

## Progress Aggregation

Two strategies, use both:

### 1. Per-batch incremental update (for polling responsiveness)

After each batch commit within a chunk, execute:

```sql
UPDATE import_jobs
SET imported_rows = (SELECT COALESCE(SUM(imported_rows), 0) FROM import_chunks WHERE import_job_id = :job_id),
    skipped_rows  = (SELECT COALESCE(SUM(skipped_rows), 0)  FROM import_chunks WHERE import_job_id = :job_id),
    phones_created = (SELECT COALESCE(SUM(phones_created), 0) FROM import_chunks WHERE import_job_id = :job_id),
    last_committed_row = (SELECT COALESCE(SUM(last_committed_row - start_row + 1), 0) FROM import_chunks WHERE import_job_id = :job_id AND status != 'pending')
WHERE id = :job_id;
```

This runs inside the same transaction as the batch commit, so it is consistent. The subqueries read committed data from other chunks (READ COMMITTED isolation, which is PostgreSQL's default).

**Cost:** One extra query per batch commit. The `import_chunks` table has at most ~50 rows per import (1M rows / 25K chunk size), so the SUM is trivial.

### 2. Chunk completion aggregation (for status transitions)

When a chunk completes, check if ALL chunks are done:

```python
async def maybe_finalize_parent(session, job_id, campaign_id):
    result = await session.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'completed') AS done,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) AS total
            FROM import_chunks
            WHERE import_job_id = :job_id
        """),
        {"job_id": str(job_id)},
    )
    row = result.one()
    if row.done + row.failed == row.total:
        # All chunks finished -- try to claim finalization lock
        lock_result = await session.execute(
            text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
            {"lock_key": hash(str(job_id)) & 0x7FFFFFFFFFFFFFFF},
        )
        if not lock_result.scalar():
            return  # Another chunk is finalizing

        job = await session.get(ImportJob, job_id)
        # Final aggregation
        agg = await session.execute(text("""
            SELECT SUM(imported_rows), SUM(skipped_rows), SUM(phones_created)
            FROM import_chunks WHERE import_job_id = :job_id
        """), {"job_id": str(job_id)})
        sums = agg.one()
        job.imported_rows = sums[0] or 0
        job.skipped_rows = sums[1] or 0
        job.phones_created = sums[2] or 0
        # Merge per-chunk error CSVs into single error report
        # ...
        if job.cancelled_at is not None:
            job.status = ImportStatus.CANCELLED
        elif row.failed > 0:
            job.status = ImportStatus.COMPLETED
            job.error_message = f"{row.failed} of {row.total} chunks failed"
        else:
            job.status = ImportStatus.COMPLETED
        await commit_and_restore_rls(session, campaign_id)
```

**Race condition prevention:** Multiple chunks may complete near-simultaneously. `pg_try_advisory_xact_lock` serializes finalization attempts. Only one chunk task wins the lock and performs finalization; others see the lock is held and exit cleanly. The lock is transaction-scoped (released on COMMIT), so it cannot be held permanently.

## Cancellation Design

Cancellation must propagate from parent to all active chunks.

**Current mechanism preserved:** `cancelled_at` timestamp on ImportJob, set by the cancel endpoint.

**Chunk cancellation flow:**
1. User hits `POST /cancel` -> sets `cancelled_at` on ImportJob, status = CANCELLING.
2. Each chunk task checks `parent.cancelled_at IS NOT NULL` between batches (same cooperative check as today).
3. When a chunk detects cancellation, it marks itself CANCELLED and exits.
4. The finalization logic (above) sees all chunks either COMPLETED or CANCELLED and finalizes the parent as CANCELLED.

**Chunks not yet started:** Pending chunk tasks in the Procrastinate queue will start, immediately check `cancelled_at`, see it is set, mark themselves CANCELLED, and return. This is fast (one DB read + one status update per chunk).

**No need to delete queued Procrastinate jobs:** Procrastinate does not support deleting queued jobs easily. The cooperative check is simpler and already proven.

## Crash-Resume Design

Each chunk is independently crash-resumable using the same mechanism as today:

- `ImportChunk.last_committed_row` tracks progress within the chunk's row range.
- If a chunk task crashes mid-processing, the v1.10 recovery engine (being built in the sibling milestone) detects the orphaned Procrastinate job and re-queues it.
- On re-execution, the chunk task sees `status = PROCESSING` and `last_committed_row > start_row`, skips to `last_committed_row`, and continues.

**Parent recovery:** If the `split_import` task crashes after creating chunks but before deferring all chunk tasks, the recovery engine re-queues it. On re-execution, `split_import` checks if chunks already exist for this job. If they do, it only defers tasks for chunks still in PENDING status.

**Idempotency:** Chunk tasks are idempotent because:
- Voter upsert uses `ON CONFLICT DO UPDATE` (same source_id + campaign_id + source_type)
- Phone upsert uses `ON CONFLICT DO UPDATE` (same campaign_id + voter_id + value)
- Re-processing already-committed rows produces the same result

## RLS Context with Parallel Chunks

**Critical constraint:** PostgreSQL `set_config('app.current_campaign_id', ..., true)` is transaction-scoped. Each COMMIT resets it. This is already handled by `commit_and_restore_rls()`.

**With parallel chunks:** Each chunk task runs in its own session on potentially different worker processes/pods. Each session independently calls `set_campaign_context()` before any query and `commit_and_restore_rls()` after each batch. There is no shared state between chunks.

**No change needed to RLS helpers.** The existing `set_campaign_context` and `commit_and_restore_rls` work correctly because each chunk has its own session and transaction.

**Defense-in-depth:** The `checkout` event on the engine (`reset_rls_context`) already resets to a null campaign UUID on every pool checkout. This protects against cross-campaign leaks even if a chunk task somehow fails to set context.

## Patterns to Follow

### Pattern 1: Small File Fast Path
**What:** Files below a threshold (e.g., 10,000 rows) bypass chunking entirely and use the current serial `process_import` task.
**When:** `total_rows < settings.import_chunk_threshold`
**Why:** Chunking overhead (count pass + chunk row creation + per-chunk S3 seeking) is not worth it for small files. The serial path is simpler and likely faster.

Implementation: `split_import` counts rows, and if below threshold, calls `process_import_file()` directly (or defers a single `process_import` task) instead of creating chunks.

### Pattern 2: One Session Per Chunk
**What:** Each chunk task creates its own `async_session_factory()` session.
**When:** Always, for all chunk tasks.
**Why:** Chunks may run on different worker pods. Even on the same pod, shared sessions between concurrent tasks would corrupt RLS context.

### Pattern 3: Aggregation via SQL, Not In-Memory
**What:** Parent job counters are computed via `SUM()` over chunk rows, not by accumulating in Python.
**When:** On every batch commit (for polling) and on chunk completion (for finalization).
**Why:** SQL aggregation is atomic and correct even with concurrent chunk updates. In-memory accumulation across tasks is impossible (different processes).

### Pattern 4: Advisory Lock for Finalization
**What:** Use `pg_try_advisory_xact_lock()` when finalizing the parent job.
**When:** A chunk completes and checks if all chunks are done.
**Why:** Multiple chunks completing near-simultaneously could race to finalize. The advisory lock serializes this safely.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared Session Across Chunks
**What:** Passing one DB session to multiple concurrent chunk processors.
**Why bad:** RLS context is per-transaction. Concurrent transactions on the same session corrupt each other's campaign context.
**Instead:** One session per chunk task, always.

### Anti-Pattern 2: JSONB Chunk State on Parent
**What:** Storing chunk progress as a JSONB array on the ImportJob row.
**Why bad:** Multiple chunks writing to the same JSONB column creates lost-update races (last writer wins). Even with JSONB merge operators, this is fragile under concurrency.
**Instead:** Separate `import_chunks` table with one row per chunk.

### Anti-Pattern 3: Byte-Offset Seeking Without Pre-Pass
**What:** Trying to seek to byte offsets in S3 for each chunk without first mapping newline positions.
**Why bad:** CSV rows are variable-length. Seeking to an arbitrary byte offset lands mid-row, producing corrupt data.
**Instead:** Line-based seeking (skip N lines from start), or pre-pass that records byte offsets per chunk boundary.

### Anti-Pattern 4: Deleting Procrastinate Jobs for Cancellation
**What:** Trying to remove queued chunk tasks from the Procrastinate queue on cancel.
**Why bad:** Procrastinate does not expose a clean job deletion API. Manipulating queue rows directly is fragile.
**Instead:** Cooperative cancellation via `cancelled_at` check at chunk task startup and between batches.

### Anti-Pattern 5: Using queueing_lock on Chunk Tasks
**What:** Setting `queueing_lock` on individual `process_chunk` tasks.
**Why bad:** Procrastinate's queueing_lock prevents jobs with the same lock from being enqueued simultaneously. If all chunks share a lock, only one chunk would be queued at a time -- defeating parallelism entirely.
**Instead:** Only the parent `split_import` task uses `queueing_lock=campaign_id`. Chunk tasks have no queueing lock.

## File Inventory: New vs Modified

### New Files

| File | Purpose |
|------|---------|
| `alembic/versions/xxxx_add_import_chunks.py` | Migration: create `import_chunks` table, add columns to `import_jobs` |
| `app/models/import_chunk.py` | `ImportChunk` model and `ChunkStatus` enum |
| `app/schemas/import_chunk.py` | Pydantic schemas for chunk responses (if exposed to API) |
| `app/tasks/split_import_task.py` | `split_import` task: count rows, create chunks, defer chunk tasks |
| `app/tasks/process_chunk_task.py` | `process_chunk` task: process one row range |

### Modified Files

| File | Changes |
|------|---------|
| `app/models/import_job.py` | Add `total_chunks`, `completed_chunks`, `is_chunked` columns |
| `app/schemas/import_job.py` | Add new fields to `ImportJobResponse` |
| `app/api/v1/imports.py` | `confirm_mapping` defers `split_import` instead of `process_import`; cancel endpoint unchanged (cooperative check) |
| `app/services/import_service.py` | Extract chunk-aware entry point; batch processing logic mostly unchanged |
| `app/tasks/procrastinate_app.py` | Add `import_paths` for new task modules |
| `app/core/config.py` | Add `import_chunk_size` and `import_chunk_threshold` settings |

### Unchanged Files

| File | Why Unchanged |
|------|---------------|
| `app/db/rls.py` | RLS helpers work as-is; each chunk uses them independently |
| `app/services/storage.py` | S3 streaming unchanged; each chunk streams the full file |
| `app/models/voter.py` | Voter upsert logic unchanged |
| Frontend polling | Polls `ImportJob` status and counters, which are aggregated from chunks transparently |

## Suggested Build Order

### Phase A: Schema and Models (foundation, no behavior change)
1. Create `ImportChunk` model with `ChunkStatus` enum
2. Add `total_chunks`, `completed_chunks`, `is_chunked` to `ImportJob`
3. Write and run Alembic migration
4. Add `import_chunk_size` (default 25,000) and `import_chunk_threshold` (default 10,000) to settings
5. Add chunk-related fields to Pydantic schemas

**Rationale:** Models and migration first because everything depends on them. No behavior change means existing imports continue to work.

### Phase B: Split Task and Chunk Processing
1. Implement `split_import` task (count rows, create chunks, defer chunk tasks, small-file fast path)
2. Extract chunk-aware processing from `ImportService` (new method `process_chunk_range` that takes start_row/end_row)
3. Implement `process_chunk` task (own session, RLS, batch loop, chunk status updates)
4. Implement progress aggregation (per-batch SQL SUM + chunk completion check)
5. Implement parent finalization with advisory lock
6. Wire `confirm_mapping` to defer `split_import` instead of `process_import`

**Rationale:** This is the core parallel processing logic. Split task and chunk processing are tightly coupled and should be built together. Progress aggregation is essential for the frontend to work.

**Dependency:** Phase A (models must exist).

### Phase C: Cancel and Resume Integration
1. Verify cancellation propagation (parent `cancelled_at` -> chunk cooperative check)
2. Implement chunk-level crash-resume (skip to `last_committed_row` within chunk range)
3. Handle split task crash-resume (re-defer only PENDING chunks)
4. Implement per-chunk error CSV merging on parent finalization

**Rationale:** Cancel and resume are correctness-critical but build on the core processing from Phase B. Testing them requires the full pipeline to be functional.

**Dependency:** Phase B.

### Phase D: Tests
1. Unit tests for chunk boundary calculation
2. Unit tests for progress aggregation SQL
3. Unit tests for finalization race (advisory lock)
4. Integration test: full chunked import end-to-end
5. Integration test: cancel mid-import with active chunks
6. Integration test: crash-resume within a chunk
7. Regression: no duplicate voters after chunked import

**Rationale:** Tests last because they need the full implementation. However, each phase should include basic smoke testing during development.

**Dependency:** Phase C.

## Scalability Considerations

| Concern | 10K rows (1 chunk) | 100K rows (4 chunks) | 1M rows (40 chunks) |
|---------|--------------------|-----------------------|----------------------|
| Processing | Serial fast path | 4 parallel chunks | 40 parallel chunks, limited by worker count |
| Memory per worker | ~2 batches + 1 S3 chunk (~200KB) | Same per chunk | Same per chunk |
| DB connections | 1 session | 4 concurrent sessions | Bounded by worker pool size (not 40) |
| S3 reads | 1 full file read | 4 full file reads (skip overhead) | 40 reads with significant skip for later chunks |
| Row seeking overhead | None | Chunk 4 skips 75K rows (~2s) | Chunk 40 skips 975K rows (~15s) |
| Parent row contention | None | Low (aggregation every 1000 rows) | Moderate but acceptable (advisory lock on finalize) |

**Worker scaling:** The real speedup comes from running multiple worker pods. With 4 worker pods and 40 chunks, ~4 chunks process concurrently (one per pod, assuming 1 concurrent task per worker). Procrastinate workers can be configured for concurrency, but each concurrent task needs its own DB session and S3 stream, so memory scales linearly.

**Future optimization:** If S3 skip overhead becomes a bottleneck for very large files, store byte offsets during the count pass and use S3 Range requests. This is a targeted optimization, not needed for the initial implementation.

## Sources

- Procrastinate v3.7.3 source code (installed at `.venv/lib/python3.13/site-packages/procrastinate/`)
- [Procrastinate documentation](https://procrastinate.readthedocs.io/) -- queueing_lock prevents duplicate enqueue, lock prevents concurrent execution
- [Procrastinate PyPI](https://pypi.org/project/procrastinate/) -- latest release 3.7.3
- Existing codebase: `app/services/import_service.py`, `app/tasks/import_task.py`, `app/db/rls.py`
- `docs/import-parallelization-options.md` -- user's analysis of parallelization strategies
- `IMPORT-RECOVERY-PLAN.md` -- v1.10 recovery engine design (sibling milestone)

**Confidence levels:**
- Architecture pattern: HIGH (derived from existing codebase analysis + PostgreSQL concurrency semantics)
- RLS behavior with parallel sessions: HIGH (verified from `app/db/rls.py` -- transaction-scoped `set_config` is well-documented PostgreSQL behavior)
- Procrastinate queueing_lock behavior: HIGH (verified from installed source code `tasks.py` line 181-184)
- S3 streaming skip overhead: MEDIUM (estimate based on I/O characteristics, not benchmarked)
- Advisory lock for finalization: HIGH (standard PostgreSQL pattern for serializing concurrent updates)
