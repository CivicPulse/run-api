# Domain Pitfalls: Chunked Parallel Import Pipeline

**Domain:** Adding parallel chunk processing to an existing serial CSV import pipeline
**System:** CivicPulse Run API (FastAPI, SQLAlchemy async, PostgreSQL + RLS, Procrastinate job queue)
**Researched:** 2026-04-01
**Overall confidence:** HIGH (based on direct codebase analysis + PostgreSQL concurrency documentation)

**Context:** The v1.6 serial pipeline already works: Procrastinate job queue with per-campaign queueing lock, per-batch commits with `commit_and_restore_rls`, crash resume from `last_committed_row`, streaming CSV from MinIO, cooperative cancellation via `cancelled_at`, and upsert on `(campaign_id, source_type, source_id)`. This document covers pitfalls specific to adding parallel chunk processing on top of that working system.

---

## Critical Pitfalls

Mistakes that cause deadlocks, data corruption, silent data loss, or require rewrites.

### Pitfall 1: Deadlock from Parallel Upserts on Overlapping Keys

**What goes wrong:** Two chunk jobs process batches containing the same `source_id` (same voter appearing in different chunks -- duplicate rows in the CSV, or overlapping chunk boundaries). Both execute `INSERT ... ON CONFLICT DO UPDATE` targeting the `(campaign_id, source_type, source_id)` unique index. PostgreSQL acquires row-level locks sequentially during a bulk INSERT. If chunk A locks voter X then tries to lock voter Y, while chunk B already holds Y and tries X, a classic deadlock occurs.

**Why it happens:** The current upsert in `process_csv_batch` (import_service.py lines 962-988) does not sort rows before inserting. With a single serial task, lock ordering is irrelevant because no other transaction competes for the same rows. The moment two chunk tasks run concurrently against the same campaign, non-deterministic lock acquisition order creates deadlock potential.

**Consequences:** PostgreSQL detects the deadlock and kills one transaction with `ERROR: deadlock detected`. The killed chunk fails. If retry logic is naive, the same deadlock repeats. Even if transient, it causes batch-level retries that slow the import and produce confusing error reports.

**Prevention:**
1. **Ensure chunks contain disjoint key sets.** This is the primary defense. During chunk splitting, if the CSV is pre-sorted by `source_id` (L2 files typically are, sorted by `lalvoterid`), splitting by row ranges naturally produces disjoint sets. If not pre-sorted, use hash-partitioning: `hash(source_id) % num_chunks` assigns each voter to exactly one chunk.
2. **Sort rows by `source_id` within each batch before upserting.** Sort the `valid_voters` list by `(source_type, source_id)` before building the INSERT statement. This guarantees all concurrent transactions acquire locks in the same order -- the canonical PostgreSQL deadlock prevention strategy.
3. **Add retry with backoff for deadlock errors.** Even with sorting, edge cases exist (duplicate `source_id` values across chunk boundaries in unsorted files). Catch `DeadlockDetected` (psycopg error code `40P01`) and retry the batch up to 3 times with jittered backoff.

**Detection:** Monitor PostgreSQL logs for `deadlock detected` errors. Add structured log fields for `chunk_id` and `batch_number` so deadlocks can be correlated to specific chunk pairs.

**Phase assignment:** Phase 1 (chunk splitting design). The partitioning strategy determines whether this pitfall is structurally possible.

**Confidence:** HIGH -- PostgreSQL deadlock behavior with concurrent INSERT ON CONFLICT is extensively documented. See [PostgreSQL unique constraints cause deadlock](https://rcoh.svbtle.com/postgres-unique-constraints-can-cause-deadlock) and [Analyzing a deadlock caused by batch INSERT](https://medium.com/@chlp8/analyzing-a-deadlock-in-postgresql-caused-by-batch-insert-f7a568e83c02).

---

### Pitfall 2: RLS Context Isolation Between Concurrent Chunk Jobs

**What goes wrong:** Chunk jobs run as separate Procrastinate tasks, each creating their own session via `async_session_factory()`. If two chunk tasks happen to acquire the same physical connection from the asyncpg pool (one finishes and returns it, the other picks it up), and the sequence is: chunk A commits (clearing transaction-scoped `set_config`), returns connection to pool, chunk B acquires that connection and issues a query before calling `set_campaign_context` -- chunk B operates with no RLS context.

**Why it happens:** The current system correctly uses `set_config('app.current_campaign_id', :id, true)` with transaction-scoped lifetime (third param `true`). COMMIT resets the config. `commit_and_restore_rls` immediately restores it. But this safety depends on each task managing its own session lifecycle. The risk is in error paths: if a chunk task crashes after COMMIT but before `set_campaign_context` restores context, and the pool recycles that connection.

**Consequences:** Silent data isolation failure. Voters could be inserted without proper `campaign_id` filtering, or queries return zero rows. This is a security-critical bug.

**Prevention:**
1. **The existing pool checkout event listener is the primary defense.** The v1.5 `reset_rls_context` handler on pool `checkout` resets `app.current_campaign_id` on every connection acquisition. Verify this fires for worker sessions too.
2. **Each chunk task must call `set_campaign_context` before ANY query.** The current `process_import` task already does this (import_task.py line 34). Replicate this pattern exactly in chunk tasks.
3. **Never share a session between chunk tasks.** Each chunk task must create its own session via `async_session_factory()`. Do not pass a session from the parent coordinator to child chunks.
4. **Wrap commit-then-restore sequences in try/finally.** If `commit_and_restore_rls` raises during `set_campaign_context` after commit, the session is in an undefined RLS state. The outer error handler must catch this and mark the chunk as failed.
5. **Add an assertion at batch start:** `SELECT current_setting('app.current_campaign_id', true)` and verify it matches expected `campaign_id`. Log CRITICAL if mismatch.

**Phase assignment:** Phase 1 (chunk task implementation). This is a copy-paste concern -- the pattern exists, it just must be replicated faithfully.

**Confidence:** HIGH -- verified `set_config(..., true)` is transaction-scoped in `app/db/rls.py` line 28, and `commit_and_restore_rls` exists at line 33.

---

### Pitfall 3: Cancellation Not Propagated to Child Chunk Jobs

**What goes wrong:** User cancels the import via the cancel endpoint, which sets `cancelled_at` on the parent `ImportJob`. Child chunk jobs do not see this because they are separate Procrastinate tasks. Each chunk currently would need to poll a different row (or none at all). Chunks continue processing to completion despite the user requesting cancellation.

**Why it happens:** The current cancellation mechanism is cooperative: the batch loop in `process_import_file` (import_service.py line 1304) refreshes the `ImportJob` row after each batch and checks `cancelled_at`. This works for a single serial task because it is the only task reading that row. With parallel chunks, chunk tasks need to know to check the parent job's `cancelled_at`, not their own chunk record.

**Consequences:** Wasted compute (chunks run to completion after cancel). User sees "cancelling" status but import keeps running. If the parent marks itself CANCELLED while chunks are still writing, final progress aggregation is inconsistent.

**Prevention:**
1. **Chunk tasks must poll the parent job's `cancelled_at` after each batch.** Add a lightweight query: `SELECT cancelled_at FROM import_jobs WHERE id = :parent_id`. Single-row primary key lookup, negligible cost.
2. **Do NOT rely on Procrastinate's built-in job cancellation** for this. The `cancelled_at` timestamp on `ImportJob` is the authoritative signal, and this must remain true for consistency with the existing cancel endpoint.
3. **Parent coordinator should not enqueue new chunks after cancel.** If using a two-phase approach (count/split then enqueue), check `cancelled_at` before each `defer_async`.
4. **On cancellation, mark chunk status** so the parent aggregator knows which chunks were cancelled vs completed vs failed.
5. **For chunks already queued in Procrastinate but not yet started,** the chunk task should check `cancelled_at` at startup (matching the existing pre-check in import_task.py line 55) and exit immediately.

**Detection:** After cancellation, query all child chunk records. If any are still PROCESSING more than a batch-timeout interval after `cancelled_at` was set, log a warning.

**Phase assignment:** Phase 2 (cancellation integration). Can be deferred past basic chunk processing but must be addressed before the feature ships.

**Confidence:** HIGH -- the current cancellation mechanism is verified in `import_service.py` line 1304 and `import_task.py` line 55.

---

### Pitfall 4: Progress Aggregation Race Conditions (Lost Updates)

**What goes wrong:** Multiple chunk tasks update progress concurrently. If the parent job's `imported_rows`, `skipped_rows`, and `total_rows` are updated by each chunk directly (read-modify-write on the ORM object), concurrent updates cause lost writes. Chunk A reads `imported_rows=1000`, chunk B reads `imported_rows=1000`, both add their batch count, both write -- one chunk's progress is lost.

**Why it happens:** The current code updates `job.imported_rows` directly on the SQLAlchemy ORM object within the same session (import_service.py lines 1140-1143). This works for serial processing. With parallel chunks, each chunk has its own session and its own stale copy of the parent job row.

**Consequences:** Progress bar jumps backward, shows incorrect totals, or exceeds 100%. Final `imported_rows` count is wrong (less than actual). The `last_committed_row` value becomes meaningless (see Pitfall 7).

**Prevention:**
1. **Use per-chunk counters, not shared parent counters.** Each chunk should have its own row (in an `import_chunks` table) with `chunk_imported_rows`, `chunk_skipped_rows`, `chunk_total_rows`. Chunks only update their own row -- no contention.
2. **Aggregate progress via SQL SUM.** The progress polling endpoint computes parent totals as: `SELECT SUM(chunk_imported_rows), SUM(chunk_skipped_rows) FROM import_chunks WHERE parent_job_id = :id`. Always consistent regardless of concurrent updates.
3. **Do NOT use `UPDATE import_jobs SET imported_rows = imported_rows + :delta`** (atomic increment) as the sole mechanism. While it avoids lost updates for a single counter, it makes crash recovery harder (you cannot re-derive the correct total from chunk state if increments were partially applied).
4. **The parent job's counters should be denormalized snapshots** updated periodically or at chunk completion, derived from the chunk table SUM.

**Detection:** Compare `SUM(chunk counters)` against `parent counters` in a health check. Divergence indicates an aggregation bug.

**Phase assignment:** Phase 1 (data model design). The chunk state table design determines whether this pitfall is structurally possible.

**Confidence:** HIGH -- classic concurrent counter problem, no PostgreSQL-specific nuance.

---

## Moderate Pitfalls

### Pitfall 5: CSV Chunk Boundaries Split Mid-Row (Quoted Newlines)

**What goes wrong:** If splitting a CSV file into byte-offset ranges for parallel processing, a naive split (every N MB) can land in the middle of a quoted field containing a newline. The chunk starting at the split point sees a partial row and either fails to parse or silently drops/corrupts data.

**Why it happens:** CSV fields can contain literal newlines inside double quotes (RFC 4180). A byte-offset split cannot distinguish row-separating newlines from in-field newlines without parsing context.

**Prevention:**
1. **Split by row count, not byte offset.** The current system uses `stream_csv_lines()` which handles CSV parsing correctly. The coordinator task should stream and count rows, then assign row ranges to chunks (rows 1-10000, 10001-20000, etc.). This is the recommended approach.
2. **Pre-count rows during the upload/mapping phase.** When the user uploads and columns are detected, also count total rows. Store in `ImportJob.total_rows` before processing begins. This enables row-range chunking without a separate counting pass at processing time.
3. **Each chunk task receives a row range (start_row, end_row)** and uses `stream_csv_lines()` to stream the file, skipping rows before `start_row` and stopping after `end_row`. This reuses the existing streaming infrastructure.
4. **If byte-offset splitting is necessary for S3 range-request parallelism,** use a two-pass approach: first pass scans for valid row boundaries (tracking quote state), second pass assigns chunks at verified boundaries. But this adds complexity for marginal gain.

**Phase assignment:** Phase 1 (chunk splitting strategy). This is a design-time decision.

**Confidence:** HIGH -- CSV quoted newline behavior is defined in RFC 4180 and is a well-known parsing pitfall.

---

### Pitfall 6: Procrastinate Queueing Lock Blocks All Chunks

**What goes wrong:** The current import uses `queueing_lock=str(campaign_id)` to prevent concurrent imports for the same campaign (imports.py line 264). If child chunk tasks are deferred with the same queueing lock value, only one chunk can be queued at a time -- the second chunk's `defer_async` raises `AlreadyEnqueued`. Parallelism is accidentally serialized.

**Why it happens:** Procrastinate's queueing lock enforces a unique constraint on the lock value in `procrastinate_jobs` for jobs in `todo` status. All chunk tasks sharing the campaign_id as their queueing lock conflict with each other.

**Prevention:**
1. **Use chunk-specific queueing locks.** Each chunk task should use `queueing_lock=f"{import_job_id}:chunk:{chunk_index}"`.
2. **Keep the campaign-level queueing lock on the parent/coordinator task only.** The parent task that splits chunks uses `queueing_lock=str(campaign_id)` to prevent a second import from starting. Child chunk tasks use different locks.
3. **Alternatively, use no queueing lock on chunk tasks at all.** Since the parent task already prevents concurrent imports per campaign, chunk tasks do not need their own deduplication. They are idempotent by chunk range.

**Phase assignment:** Phase 1 (task registration and deferral).

**Confidence:** HIGH -- verified queueing lock usage in `imports.py` line 264. Procrastinate docs confirm [queueing lock behavior](https://procrastinate.readthedocs.io/en/stable/howto/advanced/queueing_locks.html).

---

### Pitfall 7: Crash Resume Logic Breaks with Parallel Chunks

**What goes wrong:** The current crash-resume logic uses `last_committed_row` on the parent `ImportJob` to skip rows on restart (import_service.py line 1217). With parallel chunks, each chunk processes a different row range. If the system crashes and restarts, `last_committed_row` is meaningless -- it was a serial-processing concept. Row 50000 might be committed while row 30000 is still in-flight.

**Why it happens:** `last_committed_row` assumes linear sequential processing. It is a single integer representing "everything before this row is done." Parallel chunks break this assumption.

**Prevention:**
1. **Track completion per chunk, not per row on the parent.** Each chunk record should have its own status (pending, processing, completed, failed) and its own `last_committed_row` within its range.
2. **On crash resume, query the chunk table.** Find chunks not in COMPLETED status. Re-enqueue only those chunks. Completed chunks are skipped entirely.
3. **Each chunk's `last_committed_row` is relative to its range.** A chunk covering rows 10001-20000 with `last_committed_row=15000` resumes from row 15001 within its range.
4. **The parent job's `last_committed_row` becomes a derived value** (or simply unused in favor of chunk-level tracking).

**Phase assignment:** Phase 1 (data model). The chunk state table must be designed with resume in mind from the start.

**Confidence:** HIGH -- verified that `last_committed_row` drives resume in `import_service.py` line 1217.

---

### Pitfall 8: VoterPhone Upsert Conflicts Between Chunks

**What goes wrong:** If the same voter appears in multiple chunks (duplicate rows in the CSV), both chunks create VoterPhone records. The `uq_voter_phone_campaign_voter_value` constraint handles this via ON CONFLICT DO UPDATE (import_service.py lines 1024-1033), but the phone_records list correlates `voter_ids[i]` with `phone_values[i]` by position (line 1015). If RETURNING order does not match input order under concurrent upsert conditions, phone records could be associated with wrong voters.

**Why it happens:** The current code relies on positional indexing between the voter INSERT's RETURNING clause and the `phone_values` list built from mapped results. PostgreSQL's RETURNING order for INSERT ON CONFLICT is not contractually guaranteed to match input order in all cases under concurrent modification.

**Prevention:**
1. **Ensure chunk partitioning produces disjoint voter sets** (see Pitfall 1). This eliminates cross-chunk duplicate voter problems entirely, making this pitfall impossible.
2. **Defer phone creation to a post-import task.** After all chunks complete, run a single task that creates VoterPhone records for all newly imported voters. This eliminates cross-chunk phone conflicts entirely and aligns with the "parallelize secondary work" strategy from the options doc.
3. **If phones must be created per-chunk,** use a subquery-based approach instead of positional correlation: join the voter upsert result with the phone data by `source_id` rather than by array index.

**Phase assignment:** Phase 1 if using disjoint partitioning (eliminates the issue), or Phase 2 if deferring phone creation to post-import.

**Confidence:** MEDIUM -- the ON CONFLICT on the phone table handles duplicates correctly, but the positional `voter_ids[i]` / `phone_values[i]` correlation (line 1015) is fragile under concurrent conditions. Disjoint partitioning sidesteps this entirely.

---

### Pitfall 9: Parent Job Status Lifecycle Becomes Non-Trivial

**What goes wrong:** The current status lifecycle is: PENDING -> UPLOADED -> QUEUED -> PROCESSING -> COMPLETED/FAILED/CANCELLED. With chunks, the parent must derive its status from children's aggregate state. If 3 of 4 chunks complete and 1 fails, is the parent COMPLETED or FAILED? The existing `ImportStatus` enum (import_job.py lines 16-25) has no PARTIAL state.

**Why it happens:** The serial model has exactly one processing entity that IS the parent job. With chunks, the parent becomes a coordinator whose status is derived.

**Prevention:**
1. **Define clear aggregation rules:**
   - All chunks COMPLETED -> parent COMPLETED
   - Any chunk FAILED + others COMPLETED -> parent COMPLETED (matching existing behavior where per-row errors do not fail the import; chunk failures are reported in error files)
   - All chunks FAILED -> parent FAILED
   - `cancelled_at` set -> parent CANCELLED (regardless of chunk states)
2. **Consider adding `COMPLETED_WITH_ERRORS` status** if distinguishing clean completion from partial failure matters for the frontend. Alternatively, keep using COMPLETED and let `skipped_rows > 0` or `error_report_key IS NOT NULL` signal partial success (matching current behavior).
3. **A dedicated aggregation step runs after all chunks finish** (or fail). This step computes final totals, merges error reports, and sets the parent status.

**Phase assignment:** Phase 1 (status lifecycle design).

**Confidence:** HIGH -- the current enum is visible in `import_job.py` lines 16-25.

---

### Pitfall 10: Procrastinate Has No Built-In Fan-Out/Fan-In

**What goes wrong:** Developers assume Procrastinate has a "job group" or "wait for all children" primitive (like Celery's `chord` or `group`). It does not. Without built-in fan-in, the parent coordinator has no native way to know when all chunks are done. Polling the database for chunk completion status must be implemented manually.

**Why it happens:** Procrastinate is deliberately simple. It provides task deferral, queueing locks, retries, and periodic tasks. It does not provide workflow orchestration primitives.

**Prevention:**
1. **Implement fan-in via database polling.** After deferring all chunk tasks, the coordinator polls the `import_chunks` table periodically (e.g., every 5 seconds) for all chunks reaching a terminal state (COMPLETED or FAILED).
2. **Alternative: last-chunk-triggers-aggregation.** Each chunk task, after completing, checks if it is the last chunk to finish (`SELECT COUNT(*) FROM import_chunks WHERE parent_id = :id AND status NOT IN ('completed', 'failed')`). If count is 0, it triggers the aggregation step. Race-safe if the check + aggregation trigger is in a single transaction with a row-level lock on the parent.
3. **Alternative: defer a separate `aggregate_import` task** with a scheduled delay. It checks if all chunks are done; if not, it re-defers itself with another delay. Simple but adds latency.
4. **Avoid complex Procrastinate workarounds.** Do not try to simulate Celery's chord. The polling or last-chunk-triggers approach is simpler and fits Procrastinate's design.

**Phase assignment:** Phase 1 (coordinator design).

**Confidence:** HIGH -- Procrastinate's feature set is documented. No fan-in/fan-out primitives found in the [API reference](https://procrastinate.readthedocs.io/en/stable/reference.html) or [discussions](https://procrastinate.readthedocs.io/en/stable/discussions.html).

---

## Minor Pitfalls

### Pitfall 11: Chunk Task Registration Naming Collision

**What goes wrong:** If chunk tasks reuse the `process_import` task name, Procrastinate cannot distinguish between the coordinator task and chunk tasks in its job tables. Monitoring, retries, and queueing locks become confused.

**Prevention:** Register chunk tasks with a distinct name: `process_import_chunk`. Keep `process_import` as the coordinator/parent task (or rename it to `coordinate_import`).

**Phase assignment:** Phase 1.

---

### Pitfall 12: Error Report Merging Order

**What goes wrong:** Each chunk writes per-batch error files to MinIO. The current `_merge_error_files` method assumes error files are ordered by batch number within a single serial process. With parallel chunks, error files from different chunks interleave. The merged error report has rows out of CSV order.

**Prevention:** Include chunk index in the error file key (e.g., `{job_id}/errors/chunk_{idx}_batch_{num}.csv`). Merge errors in chunk order, then batch order within each chunk. Or include the original CSV row number in each error record so users can correlate regardless of file order.

**Phase assignment:** Phase 2 (error report consolidation).

---

### Pitfall 13: Dynamic Batch Size Calculation Duplicated

**What goes wrong:** The current batch size calculation in `process_import_file` accounts for asyncpg's 32,767 bind-parameter limit: `batch_size = floor(32767 / num_columns)`. If each chunk task independently calculates this, it works. But if someone changes the batch size in one place and not the other, chunks use different sizes.

**Prevention:** Extract batch size calculation into a shared utility function. Both the coordinator and chunk tasks import the same function.

**Phase assignment:** Phase 1 (refactoring before parallelization).

---

### Pitfall 14: Row-Range Chunks Require Each Chunk to Re-Stream the File

**What goes wrong:** If chunks are defined as row ranges (e.g., rows 1-10000, 10001-20000), each chunk task must stream the CSV from MinIO, parse the header, and skip rows until it reaches its start row. For the last chunk of a 100K-row file, this means streaming and discarding 90K rows before processing 10K.

**Why it happens:** CSV is sequential. There is no random access without byte-offset tracking. The current `stream_csv_lines()` streams efficiently but starts from the beginning.

**Prevention:**
1. **Accept the skip overhead for now.** CSV parsing is fast (Python can parse ~500K rows/sec). Skipping 90K rows takes ~0.2 seconds. The actual upsert work (database I/O) dominates processing time by orders of magnitude. The skip overhead is negligible.
2. **If skip overhead matters at scale,** have the coordinator task record byte offsets of chunk boundaries during the initial row-count pass. Chunks use S3 range requests to start at their byte offset. But this adds complexity and the quoted-newline problem from Pitfall 5.
3. **Recommended: start with simple row-range skipping.** Optimize only if profiling shows file streaming is a bottleneck (it will not be -- the database is the bottleneck).

**Phase assignment:** Phase 1, but accept the simple approach initially.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Data model & chunk splitting design | P1 (deadlocks), P4 (progress races), P5 (CSV boundaries), P7 (crash resume) | Design `import_chunks` table with per-chunk status, counters, row ranges. Use row-range splitting. Ensure disjoint key sets or sort before upsert. |
| Chunk task implementation | P2 (RLS context), P6 (queueing lock), P10 (no fan-in), P11 (naming) | Each chunk gets own session + RLS setup. Chunk-specific queueing lock. Implement manual fan-in via DB polling or last-chunk trigger. |
| Cancellation & error handling | P3 (cancel propagation), P9 (status lifecycle), P12 (error merge) | Chunk tasks poll parent `cancelled_at`. Define aggregation rules for parent status. Merge errors in chunk-then-batch order. |
| Progress & frontend integration | P4 (progress aggregation) | Frontend polls parent endpoint. Backend derives totals via SQL SUM over chunk table. |
| Secondary work (phones, geometry) | P8 (phone conflicts) | Defer phone/geometry creation to post-import task, or ensure disjoint partitioning. |

## Summary of Prevention Priorities

**Decision 1: How chunks are partitioned.** If chunks contain disjoint voter key sets (guaranteed by row-range splitting on a pre-sorted file, or by hash-partitioning on `source_id`), Pitfalls 1 and 8 are structurally eliminated. This should be the first design decision.

**Decision 2: Per-chunk state tracking.** A dedicated `import_chunks` table with per-chunk status, counters, and `last_committed_row` structurally prevents Pitfalls 4 and 7, and simplifies Pitfalls 3 and 9.

**Decision 3: Fan-in mechanism.** Since Procrastinate has no built-in fan-out/fan-in (Pitfall 10), the coordinator pattern must be explicitly designed. The "last chunk triggers aggregation" approach is simplest.

## Sources

- [PostgreSQL unique constraints cause deadlock](https://rcoh.svbtle.com/postgres-unique-constraints-can-cause-deadlock) -- detailed analysis of INSERT deadlock mechanics with concurrent upserts
- [Analyzing a deadlock caused by batch INSERT](https://medium.com/@chlp8/analyzing-a-deadlock-in-postgresql-caused-by-batch-insert-f7a568e83c02) -- lock acquisition order in bulk INSERT
- [Deadlocks while bulk updating in PostgreSQL](https://medium.com/@harshiljani2002/deadlocks-while-bulk-updating-in-postgresql-4af4161b7ff8) -- row ordering as deadlock prevention
- [incident.io: Debugging deadlocks in Postgres](https://incident.io/blog/debugging-deadlocks-in-postgres) -- practical deadlock debugging
- [PostgreSQL explicit locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html) -- lock ordering best practices: "The best defense against deadlocks is generally to avoid them by being certain that all applications using a database acquire locks on multiple objects in a consistent order"
- [PostgreSQL INSERT ON CONFLICT documentation](https://www.postgresql.org/docs/current/sql-insert.html) -- ON CONFLICT atomicity guarantees
- [Why tenant context must be scoped per transaction](https://dev.to/m_zinger_2fc60eb3f3897908/why-tenant-context-must-be-scoped-per-transaction-3aop) -- RLS set_config scoping
- [Procrastinate queueing locks](https://procrastinate.readthedocs.io/en/stable/howto/advanced/queueing_locks.html) -- queueing lock behavior
- [Procrastinate API reference](https://procrastinate.readthedocs.io/en/stable/reference.html) -- configure/defer API, no fan-in primitives
- [Tinybird: Splitting CSV files at 3GB/s](https://www.tinybird.co/blog/simd) -- CSV boundary challenges
- [Microsoft Research: Speculative distributed CSV parsing](https://microsoft.com/en-us/research/uploads/prod/2019/04/chunker-sigmod19.pdf) -- chunk boundary misprediction
- Verified against codebase: `app/services/import_service.py` (upsert logic lines 962-988, batch loop, cancellation check line 1304), `app/tasks/import_task.py` (RLS setup line 34, cancel pre-check line 55), `app/db/rls.py` (transaction-scoped set_config line 28, commit_and_restore_rls line 33), `app/models/import_job.py` (status enum lines 16-25, last_committed_row line 54), `app/api/v1/imports.py` (queueing_lock line 264)
