# Feature Landscape: v1.11 Chunked Parallel Import Pipeline

**Domain:** Parallel CSV import processing with fan-out/fan-in job orchestration
**Researched:** 2026-04-01
**Overall confidence:** MEDIUM-HIGH (patterns well-established in distributed systems; Procrastinate-specific implementation needs validation since docs were inaccessible)

---

## Table Stakes

Features users expect when a serial import becomes parallel. Missing any of these and the parallelization feels broken or regressed from v1.6.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Parent/child job model | Users see one import, not N chunk jobs. The parent ImportJob is the single source of truth for "how is my import doing?" | Medium | New ImportChunk model/table with FK to ImportJob | Parent ImportJob stores overall state; ImportChunk rows track per-chunk progress (start_row, end_row, status, imported_rows, skipped_rows, last_committed_row, error_report_key). |
| Unified progress reporting | Current UI polls one job and shows imported_rows/total_rows. Parallelization must not break this contract. | Medium | Parent/child model, aggregation query | Parent job's imported_rows = SUM(chunk.imported_rows). Frontend polls parent only -- zero UI changes needed if aggregation is correct. The existing `ImportJobResponse` schema stays identical. |
| Chunk failure isolation | One bad chunk (malformed rows, transient DB error) must not kill the entire import. Other chunks proceed independently. | Medium | Per-chunk status tracking, error storage per chunk | Each chunk has its own status lifecycle. Parent status derived: all completed = completed, any failed with others completed = completed_with_errors, all failed = failed. Partial results preserved. |
| Per-chunk error reports merged into one download | Users already expect downloadable error CSVs. With chunks, errors from each chunk must merge into one report. | Low | Existing MinIO error storage pattern | Already have per-batch error files merged at end of serial import (batch_error_keys pattern in process_import_file). Same approach: each chunk writes errors, finalization merges across all chunks. |
| Cancellation propagates to all chunks | User clicks cancel once, all in-flight chunks stop. No orphaned chunk jobs continue processing after cancel. | Medium | cancelled_at timestamp on parent, cooperative check in chunk workers | Chunk workers check parent.cancelled_at between batches (identical to current cancellation pattern). Additionally: queued-but-not-started chunks must check cancelled_at on startup and exit immediately. |
| Per-campaign concurrency lock preserved | Current Procrastinate queueing lock prevents two imports on same campaign. This must still work -- one parallel import at a time per campaign, not one chunk at a time. | Low | Queueing lock on parent dispatch task only | Parent orchestrator task holds the per-campaign queueing lock. Child chunk tasks use a different queue or task name without queueing lock. Children are scoped to one parent anyway. |
| Crash resume per chunk | If a worker dies mid-chunk, that chunk resumes from its last_committed_row within the chunk range. Other chunks unaffected. | Medium | last_committed_row per chunk, v1.10 orphan detection integration | Builds directly on v1.10 recovery engine (last_progress_at, staleness detection). Each chunk is independently resumable. Parent re-derives its state from children on recovery. |
| Existing L2 auto-mapping preserved | Field mapping, format detection, 217 aliases -- all happen before chunking during upload/confirm wizard. | Low | None | No change to mapping flow. Chunks inherit the already-confirmed field_mapping from parent ImportJob. Chunking is a processing concern, not a mapping concern. |
| Deterministic chunk boundaries | Chunks must not overlap or have gaps. Every source row processed exactly once. | Medium | Row-range calculation requiring pre-scan of total rows | Row-range approach (rows 1-25000, 25001-50000) is simpler and fits existing streaming model. Requires a fast pre-scan to count total lines. Alternative: byte-offset approach is faster but complicates the streaming CSV reader and risks splitting multi-byte characters or quoted fields. |
| Idempotent upsert within chunks | If two chunks contain the same source_id (shouldn't happen with proper boundaries, but defense-in-depth), the ON CONFLICT DO UPDATE upsert must produce correct results. | Low | Existing upsert logic | Already handled by the existing `INSERT ... ON CONFLICT (campaign_id, source_id) DO UPDATE` pattern. No change needed. |

## Differentiators

Features that go beyond baseline expectations. Not required for correctness but materially improve the experience or throughput.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Secondary work offloading | VoterPhone creation, PostGIS geometry point updates, and derived-field computation run as separate post-batch or post-import tasks instead of inline with voter upsert | Medium | New task types (process_voter_phones, update_voter_geometry), eventual consistency handling | Reduces per-batch latency by ~20-40%. Phone normalization + VoterPhone INSERT currently runs inline in _process_single_batch. Moving to a separate task means voters appear in search faster; phones populate shortly after. Trade-off: brief window where voter exists without phone records. |
| Completed-with-errors status | Distinct from COMPLETED and FAILED. "8 of 10 chunks succeeded, 2 had errors, here is the report." | Low | New ImportStatus enum value (COMPLETED_WITH_ERRORS), parent status derivation logic | Users currently get COMPLETED (possibly with error_report_key) or FAILED. A middle status is semantically clearer when parallelism makes partial success the norm rather than the exception. Frontend can show "Import completed with errors in 2 chunks" vs generic "completed". |
| Throughput metrics | rows/second, estimated time remaining, displayed in import progress UI | Low | Timestamps on chunk progress updates, frontend calculation | Straightforward: track started_at per chunk, compute rows_per_second = imported_rows / elapsed_seconds, estimate remaining = (total_rows - imported_rows) / rows_per_second. High user value for large imports ("43 minutes remaining" vs just a percentage bar). |
| Adaptive chunk sizing | Chunk row count adjusts based on column count (asyncpg 32,767 bind-parameter limit), file size, and worker count | Low-Medium | Dynamic calculation at fan-out time | Current code already computes effective_batch_size dynamically per import. Chunk count could similarly adapt: small files (under 10K rows) skip chunking entirely; medium files get 2-4 chunks; large files get more. Start with fixed 25K-row chunks; optimize with data later. |
| Configurable parallelism | Campaign admin or system setting for max concurrent chunks per import | Low | Setting in app config, cap on fan-out dispatch | Default to min(chunk_count, worker_count, 4). Prevents one import from starving the entire worker pool. Simple but important for multi-tenant fairness. |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Generic workflow/DAG engine | Procrastinate (v3.7.3) has no built-in fan-out/fan-in, job dependencies, or result aggregation. Building a general-purpose workflow engine is a project unto itself and unnecessary for a single use case. | Implement fan-out/fan-in manually with parent/child job records and status aggregation queries. Purpose-built, no framework overhead. The pattern is: parent task creates chunk records, defers chunk tasks, last-completing chunk triggers finalization. |
| WebSocket/SSE for real-time progress | Current 3-second polling works fine and is simple. WebSocket adds connection management, reconnection, scaling complexity for marginal improvement on a batch operation that takes minutes. | Keep polling. The import takes minutes; polling every 2-3 seconds is perfectly adequate. Parallelism makes it faster, not more interactive. |
| Chunk-level UI with individual chunk visibility | Exposing chunk internals to users creates confusion ("Why did chunk 7 fail? What rows are in chunk 7?"). Campaign staff should not need to understand chunking. | Single cancel button, single progress bar, single error report. Chunks are an implementation detail. The parent job is the only user-facing entity. |
| Per-chunk retry from UI | If chunk 3 of 10 fails, let user retry just that chunk from the UI. | Too complex for v1.11. Automatic retry via Procrastinate task retry is simpler. If a chunk persistently fails, the whole import shows COMPLETED_WITH_ERRORS and the error report explains which rows failed. Manual re-import of the full file handles the rest (upsert is idempotent). |
| Database COPY / staging table approach | Largest behavior change: shifts validation to SQL, makes per-row error reporting much harder, requires fundamentally different import architecture. | Stay with Python-side CSV parsing and batch INSERT. The current approach handles 113K rows. Parallelism addresses speed; COPY addresses throughput at a scale we do not need yet. |
| Producer-consumer with intermediate queue | Separating CSV parsing from DB writing adds durable intermediate state, complicates resume semantics, and is architecturally overkill. | Chunked child jobs with direct DB writes. Each chunk task does its own streaming parse + batch upsert. Simpler, fewer moving parts, same streaming memory model. |
| Horizontal auto-scaling of workers | K8s HPA based on queue depth. Premature optimization -- we do not have production import volume data yet. | Fixed worker replica count in K8s manifests (start with 2-3 replicas). Scale manually if needed after observing real workloads. |
| Cross-chunk transaction coordination | Ensuring all chunks commit atomically (2PC or similar). Massive complexity for no user benefit. | Each chunk commits independently. Partial results are expected and acceptable -- the upsert model means a re-import corrects any inconsistencies. |
| Import rollback (undo a parallel import) | Even harder with parallel chunks than serial. Voters from completed chunks may already have interactions, tags, walk list assignments. | Provide clear error reports. Re-import corrected file (upsert deduplicates). Or delete voters via existing UI. |

## Feature Dependencies

```
Pre-scan row count (fast line count of CSV in MinIO)
  --> Deterministic chunk boundaries (need total to divide)
    --> Parent/child job model (parent stores chunk definitions)
      --> Fan-out dispatch (parent task defers N chunk tasks)
        --> Chunk processing (each chunk = mini serial import)
          --> Per-chunk batch commits with RLS restore
          --> Per-chunk cancellation check (reads parent.cancelled_at)
          --> Per-chunk error writes to MinIO
          --> Per-chunk crash resume (last_committed_row per chunk)
        --> Progress aggregation (parent.imported_rows = SUM(chunks))
        --> Completion detection (last chunk triggers finalization)
          --> Error report merge (combine chunk error files)
          --> Parent status derivation (completed / completed_with_errors / failed)

v1.10 orphan detection
  --> Chunk-level crash resume (recovery engine detects stale chunks)

Secondary work offloading (independent track):
  --> New task types: process_voter_phones, update_voter_geometry
  --> Enqueued after each committed batch or after chunk completion
  --> Completed-with-errors status (secondary failures non-blocking)

Per-campaign queueing lock
  --> Applied to parent orchestrator task only
  --> Chunk tasks use separate queue without queueing lock
```

## MVP Recommendation

### Phase 1: Core parallel infrastructure (all table stakes)

Implement in this order -- each step builds on the previous:

1. **ImportChunk model + migration** -- New table: id, import_job_id (FK), chunk_index, start_row, end_row, status, imported_rows, skipped_rows, last_committed_row, error_report_key, started_at, completed_at. This is the foundation.

2. **Pre-scan row count** -- Fast streaming line count of CSV from MinIO (no parsing, just count newlines). Store total_rows on parent ImportJob before fan-out. Required for chunk boundary calculation.

3. **Chunk boundary calculation + fan-out** -- Parent orchestrator task: create ImportChunk records with row ranges, defer one `process_import_chunk` task per chunk. Parent task then exits (it does not wait -- fire and forget).

4. **process_import_chunk task** -- New task that processes a single chunk range. Reuses existing batch processing logic from ImportService (stream_csv_lines with skip-to-start-row, _process_single_batch, commit_and_restore_rls). Each chunk is a mini serial import within its row range.

5. **Progress aggregation** -- Parent ImportJob's progress fields (imported_rows, skipped_rows, total_rows) updated by aggregation query: `SELECT SUM(imported_rows), SUM(skipped_rows) FROM import_chunks WHERE import_job_id = ?`. Run this on each poll request or update parent after each chunk batch commit.

6. **Cancellation propagation** -- Chunk workers check parent.cancelled_at between batches. Queued chunks check on startup. Cancel endpoint unchanged (sets cancelled_at on parent).

7. **Completion detection + error merge** -- After each chunk completes, check if all sibling chunks are done. If yes, merge error reports across chunks, derive parent status, finalize. Use a simple query: `SELECT COUNT(*) FROM import_chunks WHERE import_job_id = ? AND status NOT IN ('completed', 'failed')`. If zero remaining, finalize.

8. **Crash resume integration** -- Each chunk has last_committed_row. v1.10 orphan detection applies at chunk level. Stale chunks get re-queued; they resume from their last_committed_row within their row range.

### Phase 2: Secondary work offloading (differentiator)

9. **VoterPhone creation as post-batch task** -- After each committed voter batch, enqueue a lightweight task that creates VoterPhone records for voters in that batch. Decouples phone normalization from the critical path.

10. **Geometry/derived-field tasks** -- PostGIS point creation (`ST_SetSRID(ST_MakePoint(lng, lat), 4326)`) runs as a post-import task across all newly imported voters. Currently inline in the upsert; moving it out reduces batch INSERT complexity.

### Defer to later milestones

- **Throughput metrics in UI** -- Can add without schema changes; pure frontend calculation from existing timestamps.
- **Adaptive chunk sizing** -- Start with fixed 25K rows. Optimize after collecting real throughput data.
- **Configurable parallelism** -- Start with a hardcoded cap (e.g., 4 concurrent chunks). Make configurable when multi-tenant contention is observed.

## Key Implementation Notes

### Procrastinate has no built-in fan-out/fan-in

Procrastinate v3.7.3 is a task queue, not a workflow engine. There is no native parent/child relationship, no job dependency graph, no result aggregation primitive. The fan-out/fan-in pattern must be implemented manually in application code:

- **Fan-out:** Parent orchestrator task creates ImportChunk records in the database, then calls `process_import_chunk.defer_async(chunk_id=str(chunk.id), campaign_id=campaign_id)` for each chunk. Parent task then completes (it does not block waiting for children).
- **Progress aggregation:** Computed at query time: `SELECT SUM(imported_rows) FROM import_chunks WHERE import_job_id = ?`. The existing poll endpoint (`GET /imports/{id}`) runs this aggregation and returns it as the parent's imported_rows.
- **Fan-in / completion detection:** Each chunk task, after completing, runs a sibling check query. If all siblings are in terminal status (completed/failed), that chunk triggers finalization (error merge, parent status derivation). To prevent race conditions where two chunks finalize simultaneously, use `SELECT ... FOR UPDATE SKIP LOCKED` on the parent ImportJob row or a pg_advisory_lock.

**Confidence:** MEDIUM on Procrastinate specifics (docs blocked by Cloudflare during research). HIGH on the manual fan-out/fan-in pattern itself -- this is the standard approach in Celery, Dramatiq, and other task queues when built-in workflow primitives are insufficient.

### Chunk boundary strategy: row-count based

**Recommended:** Pre-scan the CSV to count total lines (fast streaming count via MinIO, no CSV parsing needed -- just count newlines). Divide into N chunks of ~25K rows each. Each chunk task skips to its start row via the existing `rows_skipped < rows_to_skip` pattern in process_import_file.

**Why not byte-offset:** Byte-offset splitting risks cutting a row in half, splitting multi-byte UTF-8 characters, or landing inside a quoted CSV field containing newlines. Row-count is slower to pre-scan (must read entire file once) but eliminates all edge cases.

**Pre-scan cost:** For a 113K-row file, streaming line count takes ~1-2 seconds. For a 1M-row file, ~5-10 seconds. Acceptable overhead given the import itself takes minutes.

### Progress reporting backward compatibility

The existing frontend polls `GET /api/v1/campaigns/{id}/imports/{job_id}` and reads `imported_rows`, `total_rows`, `skipped_rows`, `status` from `ImportJobResponse`. If the endpoint returns aggregated values from chunks, **the frontend needs zero changes** for basic progress. This is critical -- parallel infrastructure should be invisible to the existing UI for table stakes functionality.

The only potential UI change: displaying `COMPLETED_WITH_ERRORS` status differently from `COMPLETED`. This is a minor frontend addition (conditional badge color/text) if the differentiator status is implemented.

### Small file optimization

Files under a configurable threshold (e.g., 10K rows) should skip chunking entirely and process serially as today. The overhead of creating chunk records, deferring tasks, and running completion detection is not worth it for small files. The parent orchestrator task should detect this and fall through to direct serial processing.

## Sources

- [Procrastinate GitHub (v3.7.3)](https://github.com/procrastinate-org/procrastinate) -- PostgreSQL-native task queue; no built-in workflow orchestration confirmed via repo review
- [Fan-out/Fan-in Pattern (Microsoft Durable Functions)](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-cloud-backup) -- canonical pattern description applicable to any task queue
- [UI Patterns for Async Workflows (LogRocket)](https://blog.logrocket.com/ux-design/ui-patterns-for-async-workflows-background-jobs-and-data-pipelines/) -- progress visibility, cancellation, partial failure UX best practices
- [Bulk Upload UX Case Study (Medium)](https://medium.com/design-bootcamp/ux-case-study-bulk-upload-feature-785803089328) -- summary reports, progress, error handling patterns
- [Data Pipeline Design Patterns (Dagster)](https://dagster.io/guides/data-pipeline-architecture-5-design-patterns-with-examples) -- chunked processing, aggregation consistency concerns
- [Parallel CSV Ingestion to CloudSQL (Google Cloud)](https://medium.com/google-cloud/parallel-serverless-csv-ingestion-to-cloudsql-using-cloud-dataflow-6c5899cf8d58) -- chunk-based parallel CSV import architecture
- Internal: `docs/import-parallelization-options.md` -- options analysis, recommended sequence (Options 1+2 selected)
- Internal: `app/services/import_service.py` -- current serial batch processing, streaming CSV, RLS restoration, dynamic batch sizing
- Internal: `app/models/import_job.py` -- current ImportJob model, ImportStatus enum, field_mapping storage
- Internal: `app/tasks/import_task.py` -- current single-task import with crash resume and cancellation
- Internal: `app/tasks/procrastinate_app.py` -- Procrastinate app configuration, PsycopgConnector setup
