# Project Research Summary

**Project:** CivicPulse Run API — v1.11 Chunked Parallel Import Pipeline
**Domain:** Parallel CSV import processing with fan-out/fan-in job orchestration
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

V1.11 upgrades the existing v1.6 serial CSV import pipeline into a parallel, chunked system without introducing any new library dependencies. The existing stack — Procrastinate for job orchestration, SQLAlchemy async for session management, PostgreSQL for upserts and advisory locks, and MinIO for CSV storage — is fully capable of supporting the parent/child job fan-out pattern. The primary architectural addition is a new `ImportChunk` model and table that tracks per-chunk state (row range, status, progress counters, crash-resume row), enabling N chunk tasks to run independently and concurrently while the parent `ImportJob` aggregates their results via SQL SUM queries.

The recommended approach is a phased build: (A) schema and model foundation with no behavior change, (B) core parallel processing with split task, chunk tasks, and progress aggregation, (C) cancellation propagation and crash-resume integration, and (D) test coverage. Each phase builds on the previous, and the system can be deployed behind a feature flag (`import_parallel_enabled`) so existing serial imports continue to work throughout development. Files below a configurable threshold (e.g., 10,000 rows) bypass chunking entirely, preserving simplicity for small imports.

The key risks are all well-understood concurrent-systems problems with known solutions already present in the codebase or in PostgreSQL. Deadlocks from parallel upserts are prevented by sorting rows by `source_id` before INSERT. RLS context isolation between chunk sessions is preserved by the existing `reset_rls_context` pool checkout handler and the established `set_campaign_context` / `commit_and_restore_rls` pattern. Progress aggregation races are prevented by storing counters per chunk and computing parent totals via SQL SUM rather than distributed increment. Every critical pitfall resolves to "follow the existing pattern, but per-chunk."

## Key Findings

### Recommended Stack

No new libraries are needed. Procrastinate's `defer_async` can be called from within a running task to fan out child chunk tasks — the project already uses this mechanism from the API layer. SQLAlchemy async session isolation (one session per task, `async_session_factory()`) handles concurrent worker coordination. PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) serialize the race-prone finalization step where multiple chunks may complete simultaneously.

**Core technologies:**
- **Procrastinate** (>=3.7.3, installed): Parent/child job fan-out via `defer_async` from within a running task — no new primitives needed
- **SQLAlchemy async** (installed): Per-chunk independent sessions; existing `async_session_factory()` pattern is correct
- **PostgreSQL** (16+, deployed): Advisory locks for finalization races, `INSERT ON CONFLICT` for idempotent upserts, RLS for tenant isolation
- **Python `csv` stdlib**: Row-count pre-scan and chunk row-range seeking; no byte-offset complexity needed
- **MinIO/S3** (deployed): Unchanged; each chunk streams the full file and skips to its start row

**New application code (not libraries):** `ImportChunk` model, `split_import` task, `process_chunk` task, Alembic migration, and three new config settings (`import_chunk_size`, `import_chunk_threshold`, `import_parallel_enabled`).

### Expected Features

**Must have (table stakes):**
- **Parent/child job model** — users see one import job; chunks are an implementation detail invisible to the UI
- **Unified progress reporting** — parent `ImportJob.imported_rows` = SUM of chunk counters; existing frontend poll endpoint needs no changes
- **Chunk failure isolation** — one bad chunk does not kill the import; other chunks proceed independently
- **Merged error reports** — per-chunk error CSVs merged into a single downloadable report at finalization
- **Cancellation propagation** — cancel sets `cancelled_at` on parent; chunk tasks poll it between batches (same cooperative mechanism as today)
- **Per-campaign concurrency lock preserved** — `queueing_lock=campaign_id` on parent split task only; chunk tasks have no lock
- **Crash resume per chunk** — `last_committed_row` per chunk; v1.10 orphan detection applies at chunk granularity
- **Deterministic chunk boundaries** — row-range splitting (not byte-offset) guarantees no gaps or overlaps
- **Small file fast path** — files below threshold skip chunking and use existing serial path unchanged

**Should have (competitive differentiators):**
- **Secondary work offloading** — PostGIS geometry updates as post-chunk tasks (reduces chunk critical-path latency ~20-40%); VoterPhone stays inline
- **`COMPLETED_WITH_ERRORS` status** — semantically clearer when some chunks fail but others succeed
- **Throughput metrics** — rows/second and ETA for large imports (pure frontend calculation from timestamps)

**Defer to later milestones:**
- Adaptive chunk sizing based on column count and file size (start with fixed 25K rows; optimize with real data)
- Configurable parallelism per campaign (hardcode cap initially; make configurable when multi-tenant contention is observed)
- Byte-offset S3 range seeking for very large files (skip overhead is negligible vs DB I/O time for realistic file sizes)
- Per-chunk retry UI, import rollback, WebSocket/SSE progress, chunk-level UI visibility

### Architecture Approach

The architecture replaces the single `process_import` task with a two-level task hierarchy: a `split_import` task that counts rows, creates `ImportChunk` records, and fans out to N `process_chunk` tasks; and N `process_chunk` tasks that each independently stream the CSV (seeking to their row range), execute the existing batch upsert loop, and trigger finalization when they are the last chunk to complete. The parent `ImportJob` is updated at each batch commit via SQL SUM aggregation over chunk counters, keeping the polling endpoint compatible with the existing frontend. Finalization races (multiple chunks completing simultaneously) are serialized with `pg_try_advisory_xact_lock`.

**Major components:**
1. **`ImportChunk` model** — per-chunk state: row range, status, counters, `last_committed_row`, error file key; one row per chunk; separate table (not JSONB on parent) to allow concurrent independent updates
2. **`split_import` task** — streams CSV to count rows, creates `ImportChunk` rows, defers N `process_chunk` tasks, holds `queueing_lock=campaign_id`; small-file fast path falls through to existing serial task
3. **`process_chunk` task** — own session, RLS context, batch loop identical to today, polls parent `cancelled_at`, updates chunk counters, triggers finalization on last completion
4. **`maybe_finalize_parent` function** — SQL SUM aggregation over chunk table, `pg_try_advisory_xact_lock` for race safety, error CSV merge, parent status derivation
5. **Modified `ImportService`** — extracts `process_chunk_range(start_row, end_row)` entry point while keeping existing batch logic unchanged; batch size calculation extracted to shared utility

**Files inventory:** 5 new files, 6 modified files, 4 unchanged files. See ARCHITECTURE.md for full list.

### Critical Pitfalls

1. **Deadlock from parallel upserts on overlapping keys** — sort `valid_voters` by `(source_type, source_id)` before every batch INSERT to guarantee consistent lock acquisition order; also sort `VoterPhone` records by `(voter_id, value)` for the same reason; add catch for psycopg `DeadlockDetected` (`40P01`) with retry + jitter as defense-in-depth

2. **RLS context isolation between concurrent chunk sessions** — each chunk task must create its own `async_session_factory()` session and call `set_campaign_context` before any query; never pass a session from parent to child; existing `reset_rls_context` pool checkout handler is the primary defense against connection pool reuse with stale context

3. **Progress aggregation lost updates** — never update `ImportJob.imported_rows` directly from chunk tasks (read-modify-write races cause lost updates); each chunk updates only its own `ImportChunk` row; parent totals derived exclusively via `SELECT SUM(...) FROM import_chunks WHERE import_job_id = :id`

4. **Cancellation not propagated to chunk jobs** — chunk tasks poll `SELECT cancelled_at FROM import_jobs WHERE id = :parent_id` between batches and at startup; cooperative check is sufficient and matches the existing proven pattern; no need to delete Procrastinate jobs from the queue

5. **queueing_lock accidentally blocks all chunks** — apply `queueing_lock=str(campaign_id)` to `split_import` task only; chunk tasks use NO queueing lock; if chunks share the campaign lock, Procrastinate's `AlreadyEnqueued` behavior serializes them instead of running in parallel

## Implications for Roadmap

Based on combined research, the natural build order follows data-model-first then behavior, exactly matching the existing codebase's layer conventions. The dependency graph is strict: schema must precede all behavior; core processing must precede correctness features (cancel/resume); tests require the full implementation.

### Phase A: Schema and Model Foundation

**Rationale:** Every other component depends on the `ImportChunk` table existing. Schema changes first means all subsequent phases develop against real models with no behavior change to existing imports — zero regression risk.
**Delivers:** `ImportChunk` model + `ChunkStatus` enum, `ImportJob` additions (`total_chunks`, `completed_chunks`, `is_chunked`), Alembic migration, config settings (`import_chunk_size=25000`, `import_chunk_threshold=10000`, `import_parallel_enabled=False`), Pydantic schema additions
**Addresses:** Foundational table stakes — parent/child job model structure, crash resume per chunk (data design)
**Avoids:** Progress aggregation race (Pitfall 4) and crash resume breakage (Pitfall 7) — both prevented structurally by the schema design before any behavior is written

### Phase B: Core Parallel Processing

**Rationale:** The split task and chunk task are tightly coupled and must be built together. Progress aggregation is inseparable from chunk processing — without it, the frontend immediately regresses. This is the highest-complexity phase and the core value delivery of the milestone.
**Delivers:** `split_import` task (row count, chunk creation, fan-out, small-file fast path), `process_chunk` task (own session, RLS, batch loop, chunk status), SQL SUM progress aggregation per batch commit, finalization with advisory lock, `confirm_mapping` wired to `split_import`, `import_parallel_enabled` feature flag for gradual rollout
**Uses:** `defer_async` from within Procrastinate task (verified from installed source), `pg_try_advisory_xact_lock`, `async_session_factory()` per chunk
**Implements:** Full parent/child architecture; existing frontend zero-change for progress polling
**Avoids:** Deadlock (Pitfall 1) via sort-before-upsert, RLS leak (Pitfall 2) via per-chunk sessions, queueing lock paralysis (Pitfall 6), naming collision (Pitfall 11), shared session anti-pattern, JSONB chunk state anti-pattern

### Phase C: Cancellation and Crash Resume Integration

**Rationale:** Correctness-critical but builds on the operational pipeline from Phase B. Cannot be meaningfully tested until the full pipeline exists. Integrates with v1.10 recovery engine for chunk-level orphan detection.
**Delivers:** Chunk-level cancellation (polls parent `cancelled_at`, marks chunk CANCELLED), split task crash-resume (re-defer only PENDING chunks on re-execution), chunk-level crash-resume (skip to `last_committed_row` within chunk range), per-chunk error CSV writing + merge on finalization, parent status derivation rules (all complete, any failed, all failed, cancelled)
**Avoids:** Cancel propagation failure (Pitfall 3), parent status non-triviality (Pitfall 9), error merge ordering (Pitfall 12)

### Phase D: Tests

**Rationale:** Tests require the full implementation to exercise meaningful concurrent scenarios. Each earlier phase includes smoke tests during development; comprehensive coverage finalizes here including race condition scenarios that require the full system.
**Delivers:** Unit tests for chunk boundary calculation and progress SQL, integration tests for full chunked import end-to-end, cancel mid-import with active chunks, crash-resume within a chunk, regression for no duplicate voters, race condition test for advisory lock finalization

### Phase E: Secondary Work Offloading (differentiator)

**Rationale:** Independent track; does not block Phases A-D. PostGIS geometry offloading reduces chunk critical-path latency but imports are functionally correct without it. `COMPLETED_WITH_ERRORS` is a pure additive status change.
**Delivers:** `update_voter_geometry` post-chunk Procrastinate task, `COMPLETED_WITH_ERRORS` ImportStatus enum value, frontend badge update for new status, VoterPhone phone creation kept inline (fast, users expect immediate availability)
**Avoids:** VoterPhone positional-index conflict under concurrent conditions (Pitfall 8) — geometry offloading isolates the heaviest per-row secondary work onto a separate task

### Phase Ordering Rationale

- Schema must precede all behavior because models are imported everywhere; no task or service can reference `ImportChunk` until the table and model exist
- Core processing (Phase B) must precede correctness features (Phase C) because cancellation and crash-resume testing require an operational parallel pipeline
- Tests (Phase D) finalize after Phase C because edge cases like finalization races require the complete implementation; each phase includes smoke tests during development
- Secondary offloading (Phase E) is decoupled and can run concurrently with Phase D or be deferred to a follow-on milestone without blocking the core feature

### Research Flags

Phases with well-documented patterns (standard — skip additional research):
- **Phase A (Schema):** Alembic migrations and SQLAlchemy model additions are standard patterns with no novel territory
- **Phase B (Core processing):** Procrastinate `defer_async` from within a task verified from installed source code; RLS per-session pattern verified from `app/db/rls.py`; advisory lock pattern is documented PostgreSQL behavior and used in v1.10

Phases that may benefit from targeted research during planning:
- **Phase B (Finalization advisory lock):** The exact interaction between `pg_try_advisory_xact_lock` and SQLAlchemy's transaction commit lifecycle should be verified against the installed Procrastinate connector before writing the finalization function
- **Phase C (v1.10 crash resume integration):** Depends on v1.10 recovery engine design in `IMPORT-RECOVERY-PLAN.md`; implementation details of how orphan detection surfaces chunk-level staleness require coordination with the v1.10 design decisions

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies; existing Procrastinate, SQLAlchemy, and PostgreSQL patterns verified from installed source code and direct codebase analysis |
| Features | MEDIUM-HIGH | Table stakes patterns well-established in distributed systems; Procrastinate-specific fan-out validated from source; Procrastinate docs were inaccessible during research (Cloudflare block) but installed source covered the gaps |
| Architecture | HIGH | Derived from direct codebase analysis + PostgreSQL concurrency semantics + verified RLS behavior; all component boundaries confirmed against actual file line numbers |
| Pitfalls | HIGH | Most pitfalls verified against specific line numbers in the existing codebase; PostgreSQL concurrency behavior is well-documented with multiple cited sources |

**Overall confidence:** HIGH

### Gaps to Address

- **Procrastinate docs inaccessibility:** Research was partially blocked by Cloudflare. The installed source at `.venv/lib/python3.13/site-packages/procrastinate/` fills this gap for implementation details, but edge cases in `defer_async` behavior under worker restart should be verified during Phase B implementation by reading the installed source directly.
- **S3 skip overhead at scale:** The estimate that skipping 90K rows takes ~0.2 seconds is based on I/O characteristics, not benchmarked against actual MinIO. Accept the row-range approach now; add profiling instrumentation in Phase D tests to validate.
- **Worker concurrency under load:** Procrastinate's per-worker `concurrency` parameter behavior with heavy I/O (DB sessions + S3 streams) is estimated but not load-tested. Start conservatively at 1-2 concurrent tasks per worker; tune with production data after initial rollout.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `app/services/import_service.py` (upsert lines 962-988, batch loop, cancellation check line 1304), `app/tasks/import_task.py` (RLS setup line 34, cancel pre-check line 55), `app/db/rls.py` (transaction-scoped `set_config` line 28, `commit_and_restore_rls` line 33), `app/models/import_job.py` (status enum lines 16-25), `app/api/v1/imports.py` (queueing_lock line 264)
- Procrastinate v3.7.3 installed source: `.venv/lib/python3.13/site-packages/procrastinate/` — `defer_async`, queueing_lock behavior, worker configuration
- [PostgreSQL explicit locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html) — advisory locks, deadlock prevention via consistent lock ordering
- [PostgreSQL INSERT ON CONFLICT documentation](https://www.postgresql.org/docs/current/sql-insert.html) — ON CONFLICT atomicity guarantees
- `docs/import-parallelization-options.md` — user's options analysis (recommends Options 1+2: chunked parallel + secondary offloading)
- `IMPORT-RECOVERY-PLAN.md` — v1.10 recovery engine design (sibling milestone, crash-resume integration)

### Secondary (MEDIUM confidence)
- [PostgreSQL unique constraints cause deadlock](https://rcoh.svbtle.com/postgres-unique-constraints-can-cause-deadlock) — INSERT deadlock mechanics with concurrent upserts
- [Analyzing a deadlock caused by batch INSERT](https://medium.com/@chlp8/analyzing-a-deadlock-in-postgresql-caused-by-batch-insert-f7a568e83c02) — lock acquisition order in bulk INSERT
- [Fan-out/Fan-in Pattern (Microsoft Durable Functions)](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-cloud-backup) — canonical pattern applicable to any task queue
- [Procrastinate documentation](https://procrastinate.readthedocs.io/) — queueing_lock behavior, API reference (partially accessible during research)
- [Parallel CSV ingestion to CloudSQL (Google Cloud)](https://medium.com/google-cloud/parallel-serverless-csv-ingestion-to-cloudsql-using-cloud-dataflow-6c5899cf8d58) — chunk-based parallel CSV import architecture

### Tertiary (LOW confidence — validate during implementation)
- S3 skip overhead estimates (~0.2s per 90K rows) — based on I/O characteristics, not measured against this environment
- Worker concurrency recommendations (1-2 concurrent tasks per worker) — based on resource model analysis, not load-tested

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
