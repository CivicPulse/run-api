# Domain Pitfalls

**Domain:** Background task processing, resumable imports, L2 voter file parsing
**Project:** CivicPulse Run API v1.6 Imports
**Researched:** 2026-03-28
**Overall confidence:** HIGH (based on direct codebase analysis of existing import pipeline, RLS architecture, transaction scoping, and documented crash behavior)

---

## Critical Pitfalls

Mistakes that cause data corruption, security breaches, or require rewrites.

### Pitfall 1: RLS Context Lost After Per-Batch Commit

**What goes wrong:** The current `set_campaign_context()` uses `set_config('app.current_campaign_id', :campaign_id, true)` where the third parameter `true` means transaction-scoped. When the import commits after each batch (required for resumability), the RLS context is cleared. The next batch's INSERT hits RLS policies that compare `campaign_id = current_setting('app.current_campaign_id', true)::uuid` against the reset zero-UUID from the `reset_rls_context` checkout handler, causing either silent data invisibility or INSERT failures.

**Why it happens:** This is a deliberate security design in the current system (see `app/db/rls.py` line 28 and `app/db/session.py` lines 23-38). Transaction-scoped RLS prevents cross-campaign leaks when connections return to the pool. But this same protection breaks when you need multiple commits in one logical operation.

**Consequences:**
- First batch imports successfully, all subsequent batches fail with RLS violations or silently produce zero rows
- Import appears to complete but only imported the first 1000 rows (one batch)
- Or: the defense-in-depth checkout handler does not fire between commits on the same connection (since no pool checkout occurs), leaving the context cleared by the transaction commit with no new context set

**Prevention:**
- Re-call `set_campaign_context(session, campaign_id)` immediately after every `session.commit()` inside the batch loop -- this is the simplest and most reliable fix
- For the worker process specifically, consider using session-scoped RLS (`false` as the third parameter to `set_config`) since worker connections are not shared with HTTP request handlers and do not return to a shared pool
- Add an assertion check after each commit: `SELECT current_setting('app.current_campaign_id', true)` must return the expected value before proceeding with the next batch
- Create a helper `commit_and_restore_rls(session, campaign_id)` that wraps both operations atomically

**Detection:** Import job shows `imported_rows = 1000` (exactly one batch size) with status COMPLETED but actual voter count in the database is only 1000 out of 113K. No errors reported because the RLS violation silently filters results or the upsert returns zero affected rows.

**Phase:** Must be addressed in the very first implementation phase when converting to per-batch commits. This is the single most dangerous pitfall in the entire migration.

---

### Pitfall 2: Worker Cannot Read ImportJob Due to RLS Chicken-and-Egg

**What goes wrong:** The `import_jobs` table has RLS enabled (it is listed in `_CAMPAIGN_TABLES` in migration 002, line 41). The background worker needs to read the ImportJob to discover `campaign_id` so it can set RLS context -- but it cannot read the ImportJob without RLS context already being set. The current `process_import` task (line 37 in `import_task.py`) does `session.get(ImportJob, uuid)` before `set_campaign_context()`, which works only because TaskIQ's InMemoryBroker runs in the same process as the API where the connection may still have residual context.

**Why it happens:** The current system uses an `InMemoryBroker` (broker.py line 9) that runs tasks in the API process. Connections may retain RLS context from the HTTP request that queued the task. Moving to Procrastinate (a separate worker process with its own connection pool) means fresh connections with the zero-UUID default set by `reset_rls_context` at checkout time.

**Consequences:**
- Worker starts, tries to load ImportJob, gets `None` (RLS filters it out), raises `ValueError("ImportJob not found")`
- Job permanently stuck in QUEUED status
- User sees "processing" forever with no progress and no error

**Prevention:**
- Pass `campaign_id` as a task argument alongside `import_job_id` so the worker can set RLS context before reading anything. The campaign_id is already available at dispatch time in `imports.py` line 248 where `process_import.kiq(str(import_id))` is called
- Alternative: query `import_jobs` with a raw SQL query that bypasses RLS (e.g., `text("SELECT campaign_id FROM import_jobs WHERE id = :id")` executed before enabling RLS), but this is fragile and defeats the purpose of RLS
- Recommended approach: pass `campaign_id` as a Procrastinate task keyword argument. Change dispatch from `process_import.kiq(str(import_id))` to `process_import.defer_async(import_job_id=str(import_id), campaign_id=str(campaign_id))`

**Detection:** All background imports fail immediately with "ImportJob not found" in worker logs. Zero rows ever processed. Every import stays in QUEUED status indefinitely.

**Phase:** Must be solved in the first phase alongside Procrastinate integration. Cannot be deferred.

---

### Pitfall 3: Entire File Downloaded Into Memory Before Parsing

**What goes wrong:** The current `process_import_file` (import_service.py lines 872-876) downloads the entire CSV into memory: `chunks = []; async for chunk in storage.download_file(job.file_key): chunks.append(chunk); file_content = b"".join(chunks)`. It then decodes into a Python string (line 881) and wraps in `StringIO` (line 892). For a 30MB CSV, this means approximately 30MB raw bytes + 30MB decoded string + 30MB StringIO buffer = ~90MB just for the file content, before any row processing begins. With 113K rows of parsed dicts, error accumulation, and SQLAlchemy object tracking, total memory easily exceeds 512MB.

**Why it happens:** The S3 download is already chunked (`storage.download_file` yields chunks via `response["Body"].iter_chunks()`), but the code immediately joins all chunks into one bytestring. The `csv.DictReader` API requires a file-like object, which is easy to create from a full string but requires a custom wrapper for streaming.

**Consequences:**
- Pod OOM-killed at 512MB limit (the documented crash in `docs/issues/large-voter-import-crash.md`)
- Exit code 3 after ~30 seconds, 0 rows imported
- Sentry may not capture the error because OOM kills the process before the error handler runs

**Prevention:**
- Download to a temporary file on disk and parse from disk -- this is the simplest fix and avoids memory pressure entirely. The worker pod's filesystem is writable (`readOnlyRootFilesystem: false` in the deployment spec)
- Alternatively: write a line-buffered wrapper around the S3 chunk stream that yields complete lines, feeding them to `csv.reader` one line at a time
- Or: increase the worker pod's memory limit (separate from API pods) to accommodate full-file loading for files up to ~100MB, with streaming as a future optimization
- Track the decoded file size on the ImportJob so the worker can pre-check whether the file fits in available memory

**Detection:** Pod exit code 3 (OOM) or exit code 137 (SIGKILL from K8s OOM killer). The `docs/issues/large-voter-import-crash.md` documents exactly this: 113K rows, 30MB file, 512MB limit, exit code 3 after ~30s.

**Phase:** Address in the streaming/memory optimization phase. Can be partially mitigated by just moving processing to a separate worker pod with higher memory limits, but proper streaming or temp-file approach is needed for production reliability.

---

### Pitfall 4: Single Transaction Means All-or-Nothing (No Resumability)

**What goes wrong:** The current `process_import` task (import_task.py line 50) calls `session.commit()` only once after the entire `process_import_file()` completes. If the pod crashes at row 80,000, all 80,000 rows of work are rolled back. The job stays in PROCESSING status with no way to resume.

**Why it happens:** The service uses `session.flush()` (not `commit()`) after each batch to write progress counters to the database, but all changes remain within one transaction. This is correct for data integrity in the single-request model but prevents any form of resumability.

**Consequences:**
- 30+ minutes of processing lost on any failure (pod crash, network error, database timeout)
- User must re-upload and re-import the entire file
- No partial data available for verification
- Creates anxiety about importing large files, pushing users toward the workaround of splitting files manually

**Prevention:**
- Commit after each batch (typically 1000 rows) with proper RLS re-establishment (see Pitfall 1)
- Track `last_committed_batch` or `rows_committed` on the ImportJob model so the worker knows where to resume after a crash
- On resume, the simplest correct approach is to replay the entire file from the beginning. The upsert `ON CONFLICT DO UPDATE` on `(campaign_id, source_type, source_id)` is already idempotent, so re-processing committed rows is a no-op (they just get updated to the same values)
- The ImportJob model needs a new status value (e.g., `RESUMING`) or the worker should detect `PROCESSING` status as "needs resume" on startup
- Ensure each batch's upsert is truly idempotent, including the VoterPhone upsert and PostGIS geom update

**Detection:** Import job stuck in PROCESSING status after pod restart. `imported_rows` shows 0 in the database because the flush was never committed. Database shows 0 new voters despite minutes of processing.

**Phase:** Core resumability phase -- must be designed alongside the per-batch commit strategy (Pitfall 1).

---

### Pitfall 5: Import Task Double-Sets RLS Context, Masking the Real Problem

**What goes wrong:** The background task in `import_task.py` (line 42) calls `set_campaign_context(session, str(job.campaign_id))`, then `process_import_file` in `import_service.py` (line 863) calls it AGAIN. This double-call currently works because everything stays in one transaction. But when migrating to per-batch commits, the second call in `process_import_file` will be the only effective one for the first batch, and then neither call will fire for subsequent batches after commits clear the context.

**Why it happens:** The import pipeline was built in phases. The task wrapper added its own RLS setup, and the service method has its own setup because it was originally designed to run independently. The redundancy masks the real lifecycle requirement.

**Consequences:**
- During migration, developers may fix the context in the task wrapper but miss that `process_import_file` also sets it (or vice versa), leading to the Pitfall 1 scenario
- The double-call creates confusion about which layer "owns" the RLS context lifecycle

**Prevention:**
- Consolidate RLS context ownership to ONE layer. Recommended: the batch processing loop should own it, re-setting after each commit
- Remove the redundant `set_campaign_context` call in `process_import_file` -- the task/worker is responsible for session lifecycle
- Or refactor `process_import_file` to accept `campaign_id` as a parameter and call `set_campaign_context` explicitly in its batch loop after each commit

**Detection:** Code review -- search for all `set_campaign_context` calls in the import code path and verify there is exactly one canonical location that fires at the right time.

**Phase:** Must be resolved as part of the Procrastinate migration, before implementing per-batch commits.

## Moderate Pitfalls

### Pitfall 6: Procrastinate Uses Its Own Connection Pool, Not SQLAlchemy's

**What goes wrong:** Procrastinate manages PostgreSQL connections through its own async connector (`PsycopgConnector` for psycopg3 or `AiopgConnector` for aiopg). The task function still needs SQLAlchemy sessions for business logic (voter upserts, RLS context). This creates two separate connection pools competing for PostgreSQL connections. The `reset_rls_context` checkout handler on the SQLAlchemy engine (session.py lines 23-38) fires for SQLAlchemy connections but has no effect on Procrastinate's connections.

**Why it happens:** Procrastinate was designed as a standalone job queue that owns its database connections. It does not integrate with SQLAlchemy's session or engine. The task code already creates its own SQLAlchemy session (import_task.py line 34: `async with async_session_factory() as session`), which is correct, but this means both pools exist simultaneously.

**Consequences:**
- Connection pool exhaustion if both pools are sized independently without accounting for each other. Default PostgreSQL `max_connections` is 100; if the API pool uses 20 and Procrastinate uses 10 and the worker's SQLAlchemy pool uses another 20, that is 50 connections consumed
- Procrastinate's internal tables (`procrastinate_jobs`, `procrastinate_events`) require their own schema setup alongside Alembic migrations
- Potential deadlocks if Procrastinate's connection and SQLAlchemy's connection contend for the same rows during job state transitions

**Prevention:**
- Size PostgreSQL `max_connections` to accommodate all pools: API SQLAlchemy pool + Procrastinate worker connectors + worker SQLAlchemy pool
- Keep pool sizes small: API pool 5-10, worker pool 2-3 (imports are sequential within a campaign)
- Use the same async driver family: if Procrastinate uses psycopg3, consider whether to align the API's asyncpg usage or accept the dual-driver situation
- Monitor `pg_stat_activity` during imports to verify connection usage

**Phase:** Procrastinate integration/setup phase.

---

### Pitfall 7: TaskIQ to Procrastinate API Migration Is Not a Find-and-Replace

**What goes wrong:** The current code uses `@broker.task` decorator and `process_import.kiq(str(import_id))` for task dispatch (imports.py line 248). Procrastinate has a completely different API: `@app.task` decorator and `await task.defer_async(import_job_id=str(import_id))`. Key differences: Procrastinate uses keyword-only arguments, has different retry/queue configuration, and requires an `App` object instead of a `Broker`.

**Why it happens:** TaskIQ and Procrastinate have fundamentally different design philosophies. TaskIQ is broker-agnostic (Redis, RabbitMQ, in-memory); Procrastinate is PostgreSQL-native. Their APIs reflect these different architectures.

**Consequences:**
- Import confirmation endpoint breaks silently if dispatch method is wrong (returns 200 but task never queues)
- Or raises `AttributeError` at runtime when calling `.kiq()` on a Procrastinate task object
- Tests that mock the TaskIQ broker need complete rewriting

**Prevention:**
- Replace the entire `app/tasks/broker.py` module with Procrastinate app configuration
- Update `import_task.py` to use `@app.task(name="process_import")` decorator
- Update `imports.py` dispatch from `.kiq(str(import_id))` to `.defer_async(import_job_id=str(import_id), campaign_id=str(campaign_id))`
- Procrastinate tasks must accept keyword arguments only (no positional args)
- Remove `taskiq` and `taskiq-fastapi` from `pyproject.toml` dependencies and add `procrastinate`
- Add an integration test that verifies task dispatch and pickup work end-to-end

**Phase:** First implementation phase (Procrastinate integration).

---

### Pitfall 8: Procrastinate Schema Not Managed by Alembic

**What goes wrong:** Procrastinate requires its own database tables (`procrastinate_jobs`, `procrastinate_events`, `procrastinate_periodic_defers`, etc.) and provides a CLI command `procrastinate schema --apply` to create them. Running this separately from Alembic means the migration history does not track Procrastinate's schema, making it impossible to reproduce the database state from Alembic migrations alone. The init container currently runs only `alembic upgrade head` (deployment.yaml line 28).

**Why it happens:** Procrastinate was designed for Django (which has its own migration system) and standalone scripts. It does not natively integrate with Alembic.

**Consequences:**
- Fresh database setups require running both Alembic AND Procrastinate schema setup
- Init container must run two commands instead of one, or one must be embedded in the other
- Schema drift if Procrastinate version upgrade changes table structure without a corresponding Alembic migration
- CI test databases missing Procrastinate tables

**Prevention:**
- Create an Alembic migration that executes Procrastinate's schema SQL via `op.execute()`. Procrastinate provides `procrastinate schema --sql` to dump the raw SQL without applying it -- capture this output and embed it in a migration
- Pin the Procrastinate version in `pyproject.toml` and regenerate the schema migration when upgrading
- Alternatively, call `App.admin.setup_schema()` programmatically during application startup (idempotent, runs every startup but only creates tables if missing)
- For CI: include Procrastinate schema setup in the test database fixture

**Phase:** Procrastinate integration phase -- must be part of the initial setup before any tasks can be deferred.

---

### Pitfall 9: Progress Polling Returns Stale Data Until Final Commit

**What goes wrong:** The current code uses `session.flush()` to update `job.imported_rows` and `job.total_rows` after each batch (import_service.py line 923). A `flush()` writes to the database within the current transaction but is not visible to other sessions (the polling endpoint's `GET /imports/{id}` creates its own session via `get_campaign_db`). PostgreSQL's MVCC isolation means uncommitted changes are invisible. So the progress endpoint returns 0/0/0 for the entire import duration, then jumps to the final counts after the single commit.

**Why it happens:** The entire import runs in one transaction with only flushes, not commits. The progress polling endpoint runs in a separate transaction that cannot see in-flight data.

**Consequences:**
- User sees 0% progress for the entire import duration (potentially 30+ minutes for large files), then instantly 100%
- No way to distinguish "stuck/crashed" from "actively working" during long imports
- User may cancel and re-import, creating wasted processing or duplicate data

**Prevention:**
- Per-batch commits (for resumability) automatically solve this -- each committed batch's progress becomes visible to the polling endpoint immediately
- This is a "two birds, one stone" situation: implementing per-batch commits for resumability also gives real-time progress visibility at no additional cost
- After implementing per-batch commits, verify the polling endpoint returns incrementally updating counts

**Detection:** Import polling returns `imported_rows: 0, total_rows: 0` for the entire import duration, then jumps to final values.

**Phase:** Resolved automatically when per-batch commits are implemented for resumability. No separate work needed.

---

### Pitfall 10: Error List Grows Unbounded in Memory

**What goes wrong:** The current code accumulates `all_errors` as a list of dicts (import_service.py line 894), each containing the full original CSV row (up to 55 column key-value pairs) plus the error reason. For a file with 10% error rate on 113K rows, that is ~11,300 error dicts with ~55 string values each. Combined with the full file in memory, this contributes to the OOM condition.

**Why it happens:** The error report CSV is generated at the end of processing from the accumulated list. This requires all errors to be held in memory simultaneously.

**Consequences:**
- Memory pressure scales linearly with error count, unbounded
- Files with many invalid rows (common with dirty voter data) amplify the OOM risk
- The error report generation itself creates another in-memory CSV string via `StringIO`

**Prevention:**
- Stream errors to S3 as they occur: open a streaming upload and write error rows as each batch completes
- Or write error batches to temporary files on disk
- Or cap error collection at a reasonable limit (e.g., first 1000 errors) and add a summary note: "X additional errors omitted"
- Track total error count on the job model but limit detailed error retention

**Phase:** Address alongside the streaming/memory optimization phase.

---

### Pitfall 11: Worker Process Lacks Application State and Observability

**What goes wrong:** The current import task creates `StorageService()` and `ImportService()` inline (import_task.py lines 27-28). This works because `StorageService.__init__` reads from `app.core.config.settings` which loads from environment variables. In a separate Procrastinate worker process, these environment variables must be present, and observability infrastructure (Sentry, structlog) must be separately initialized since the worker does not run through FastAPI's lifespan startup.

**Why it happens:** Background workers run outside the FastAPI request lifecycle. There is no `Request` object, no `app.state`, no dependency injection, no middleware chain, no lifespan startup hooks.

**Consequences:**
- `StorageService()` fails silently if S3 credentials are not in the worker's environment
- Worker errors not captured by Sentry (SDK not initialized)
- No structured logging (structlog not configured)
- Difficult to debug production worker issues without observability

**Prevention:**
- Ensure the Procrastinate worker's K8s Deployment references the same ConfigMap and Secret as the API deployment (same env vars)
- Initialize Sentry SDK in the worker entrypoint separately from FastAPI's lifespan
- Configure structlog in the worker entrypoint
- The current task code already avoids `request.app.state` by creating services directly -- maintain this pattern
- Add a worker startup smoke test that verifies S3 connectivity and database access before accepting jobs

**Phase:** Worker deployment/infrastructure phase.

---

### Pitfall 12: Concurrent Imports for Same Campaign Can Deadlock

**What goes wrong:** If a user starts a second import for the same campaign while the first is still processing, both workers may try to upsert the same voter (matching on the unique index `ix_voters_campaign_source` on `campaign_id, source_type, source_id`). PostgreSQL's `ON CONFLICT DO UPDATE` takes row-level locks. If batch A from import 1 locks rows 1-1000 and batch A from import 2 locks rows 500-1500 in a different order, a deadlock occurs.

**Why it happens:** The current `confirm_mapping` endpoint (imports.py line 222) checks the individual job's status but does not check whether another import for the same campaign is already running.

**Consequences:**
- PostgreSQL detects deadlock and aborts one transaction
- Worker retry (if configured) may succeed, but the race persists
- Partial data from both imports in unpredictable state

**Prevention:**
- Enforce one active import per campaign: before dispatching a new import task, check for any existing job with status QUEUED or PROCESSING for the same campaign_id, and return 409 Conflict
- Use Procrastinate's `queueing_lock` feature: set `queueing_lock=f"import:{campaign_id}"` to ensure only one import task per campaign can be queued at a time
- Additionally, sort voter dicts by `source_id` before upserting to ensure consistent lock ordering across concurrent batches (defense in depth)

**Phase:** Background processing phase -- add campaign-level import locking alongside Procrastinate integration.

## Minor Pitfalls

### Pitfall 13: L2 Voting History Column Patterns Not Exhaustive

**What goes wrong:** The current regex `^(General|Primary)_(\d{4})$` (import_service.py line 414) only matches `General_YYYY` and `Primary_YYYY` patterns. The PROJECT.md (line 103) explicitly lists additional target patterns for v1.6: `"Voted in YYYY"` and `"Voted in YYYY Primary"`. These will not match the current regex.

**Prevention:**
- Add support for the documented patterns: `"Voted in YYYY"` (maps to General), `"Voted in YYYY Primary"` (maps to Primary)
- Consider a secondary detection pass after the regex: scan for columns containing 4-digit years with Y/A/E values
- Test against actual L2 sample files from multiple states since column naming varies by state

**Phase:** L2 auto-mapping enhancement phase.

---

### Pitfall 14: L2 Column Headers Vary by State and Export Format

**What goes wrong:** L2 data is delivered in different formats depending on the state, subscription tier, and export method. Column headers may use different casing (`Voters_FirstName` vs `voters_firstname`), different prefixes, or entirely different naming conventions. The current fuzzy matching with RapidFuzz at 75% threshold may mismap columns when L2 uses an unexpected alias, or fail to map columns that should match.

**Why it happens:** L2 Political is a data aggregator normalizing voter files from 50+ states. Their export format has evolved over time. The PROJECT.md specifies "all 55 columns from L2 CSV files auto-map without manual intervention" as a target.

**Prevention:**
- Build L2 mapping as an exact-match lookup table first (all known L2 column names lowercased), falling through to fuzzy matching only for unknown columns
- The current alias lists in `CANONICAL_FIELDS` are a good start but need expansion to cover all 55 L2 columns
- Include case-insensitive exact matching before fuzzy matching. The current code does `normalized = col.strip().lower().replace(" ", "_")` before fuzzy matching, which helps, but exact match should be checked first
- Log unmatched columns at WARNING level so operators can identify and add missing aliases

**Phase:** L2 auto-mapping enhancement phase.

---

### Pitfall 15: Date Fields Not Parsed, May Fail on Non-ISO Formats

**What goes wrong:** The `date_of_birth` and `registration_date` fields are mapped to SQLAlchemy `Date` columns. The current `apply_field_mapping` code handles propensity, phone, age, lat/lon, and party normalization but does not include date parsing logic. SQLAlchemy/asyncpg may auto-coerce `YYYY-MM-DD` format but will raise `DataError` on `MM/DD/YYYY`, `M/D/YYYY`, or `YYYYMMDD` formats that appear in some L2 exports.

**Consequences:**
- Database error on INSERT causes the entire batch to fail, losing up to 1000 good rows alongside one bad date
- Without per-row error handling for dates, one malformed date sinks the batch

**Prevention:**
- Add explicit date parsing in `apply_field_mapping` with a set of known format strings: `YYYY-MM-DD`, `MM/DD/YYYY`, `YYYYMMDD`, `M/D/YYYY`
- On parse failure, set to `None` and log a warning rather than failing the batch
- Use `dateutil.parser.parse()` as a fallback, with `dayfirst=False` for US date conventions

**Phase:** L2 parsing robustness phase.

---

### Pitfall 16: Procrastinate Worker Needs Separate K8s Deployment

**What goes wrong:** Procrastinate workers run as a long-lived process (`procrastinate worker` command) separate from the API server (`uvicorn`). If the worker runs inside the API pod (as a background thread or subprocess), a worker crash takes down the API, and import memory pressure affects API responsiveness.

**Why it happens:** The current TaskIQ InMemoryBroker runs in-process with the API. Moving to Procrastinate is an architectural change from "in-process task execution" to "separate worker process."

**Prevention:**
- Create a separate K8s Deployment for the Procrastinate worker using the same container image but a different entrypoint command
- Worker Deployment should have different resource limits: higher memory (e.g., 1GB) for import processing, lower CPU since imports are I/O-bound
- Share the same ConfigMap and Secret for database and S3 credentials
- For local development, add a `worker` service to `docker-compose.yml` running the same image with `procrastinate worker` command
- Worker pods need health monitoring -- Procrastinate supports heartbeat-based health checks

**Phase:** Infrastructure/deployment phase.

---

### Pitfall 17: Resume from Crash Requires Re-Parsing Skipped Rows

**What goes wrong:** If the import crashes at batch 80 (row 80,000) and the ImportJob records `rows_committed = 79000`, resuming requires re-reading the CSV from the beginning and skipping the first 79,000 rows. For a 30MB file, this means re-downloading from S3 and re-parsing 79K rows of CSV just to find the resume point.

**Why it happens:** CSV is a sequential format with no random access. You cannot seek to "row 80,000" without counting newlines from the start (and even that breaks with multiline quoted fields).

**Prevention:**
- Simplest correct approach: replay the entire file from the beginning. Since the upsert is idempotent (`ON CONFLICT DO UPDATE`), re-processing already-committed rows is safe -- they just get updated to the same values. The overhead is re-parsing and re-upserting 79K rows, but this is much simpler than byte-offset tracking
- Optimization (if resume time matters): store a byte offset in the ImportJob and use S3 Range requests (`bytes=N-`) to skip ahead. But this requires careful handling of CSV line boundaries and encoding
- Recommended: start with the simple "replay from start" approach. Only optimize if users report that resume is too slow

**Phase:** Resumability implementation phase.

---

### Pitfall 18: CSV Encoding Detection Picks Latin-1 for Windows-1252 Files

**What goes wrong:** The current code tries `utf-8-sig` then falls back to `latin-1` (import_service.py lines 879-889). Latin-1 never fails (it maps every byte 0-255 to a character), so the fallback always "succeeds." But if the file is Windows-1252 (common for files exported from Excel), characters like smart quotes, em dashes, and accented characters (common in voter names) map to different Unicode code points under Latin-1 vs Windows-1252. Names with accented characters get silently corrupted.

**Prevention:**
- Use `charset-normalizer` library for automatic encoding detection on the first chunk
- Or try `utf-8-sig` -> `cp1252` -> `latin-1` (Windows-1252 is more common than raw Latin-1 for US voter files from Excel/Access exports)
- Store detected encoding on the ImportJob so resume uses the same encoding

**Phase:** Robustness improvement -- can be addressed alongside L2 parsing enhancements.

---

## Architecture-Specific Risks

### Transaction-Scoped vs Session-Scoped RLS in Workers

The entire RLS system was hardened in v1.5 with the explicit design decision to use transaction-scoped (`true`) context. The per-batch commit approach directly conflicts with this design. The migration path should be:

1. **Worker sessions use session-scoped RLS** (`false` parameter to `set_config`), since worker connections are not shared with HTTP requests and the security rationale for transaction-scoped context (preventing cross-request leaks in a shared pool) does not apply to a dedicated worker process
2. **The defense-in-depth `reset_rls_context` checkout handler must still fire for API connections** -- this handler is on the shared SQLAlchemy engine, so if the worker uses the same engine, it will also fire for worker connections
3. **Worker connections should ideally use a separate SQLAlchemy engine/pool** to avoid the API's checkout handler resetting context at inconvenient times (e.g., if the worker's pool recycles a connection mid-import)

This is not a bug to fix -- it is a deliberate architectural tension between "secure by default for HTTP" and "practical for long-running batch operations." The solution is connection pool isolation between API and worker processes.

### Procrastinate's PostgreSQL-Native Advantage and Risk

Procrastinate stores jobs in PostgreSQL itself (unlike Redis-backed queues like Celery/ARQ/TaskIQ-Redis). This is an advantage for this project:

- No Redis in the stack (one fewer infrastructure dependency)
- ACID guarantees for job state transitions
- Import job count is low (a few per day, not thousands per minute)
- Job metadata is queryable with standard SQL

But the risk: if PostgreSQL is under heavy load from a large voter upsert (113K rows with ON CONFLICT), Procrastinate's job polling queries may experience increased latency. This is unlikely to be a problem at current scale but should be monitored.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Procrastinate Integration | P2 (RLS chicken-and-egg), P7 (API migration), P8 (schema migration) | Pass campaign_id as task arg; replace TaskIQ entirely; embed Procrastinate schema in Alembic migration |
| Per-Batch Commits | P1 (RLS lost on commit), P5 (double RLS set), P9 (progress visibility) | Re-set RLS after each commit; consolidate RLS ownership; progress auto-visible with commits |
| Resumability | P4 (all-or-nothing), P17 (resume re-parsing) | Track batch cursor on ImportJob; replay from start using upsert idempotency |
| Streaming/Memory | P3 (full file in memory), P10 (error accumulation) | Temp file or streaming parser; cap or stream errors |
| L2 Auto-Mapping | P13 (voting history patterns), P14 (state variation), P15 (date parsing) | Extend regex for documented patterns; exact-match-first; add date normalization |
| Worker Deployment | P11 (application state/observability), P16 (separate K8s deployment), P6 (dual connection pools) | Shared ConfigMap/Secret; separate Deployment with higher memory; size pools appropriately |
| Concurrent Safety | P12 (upsert deadlocks) | Campaign-level import lock via Procrastinate queueing_lock |

---

## Sources

- Direct codebase analysis: `app/db/rls.py` (transaction-scoped `set_config` with `true`), `app/db/session.py` (pool checkout RLS reset handler), `app/tasks/import_task.py` (TaskIQ task, RLS context flow), `app/services/import_service.py` (full memory download, flush-only progress, error accumulation), `app/api/v1/imports.py` (dispatch via `.kiq()`)
- Issue documentation: `docs/issues/large-voter-import-crash.md` (113K row OOM crash, 512MB limit, exit code 3)
- RLS policy definitions: `alembic/versions/001_initial_schema.py`, `002_voter_data_models.py` (import_jobs in `_CAMPAIGN_TABLES` list, line 41)
- K8s resource configuration: `k8s/apps/run-api-dev/deployment.yaml` (512MB memory limit, `readOnlyRootFilesystem: false`)
- TaskIQ broker configuration: `app/tasks/broker.py` (`InMemoryBroker`)
- PostgreSQL `set_config()` transaction scoping behavior (HIGH confidence -- fundamental PostgreSQL behavior documented in official docs)
- Procrastinate architecture: task registration, `defer_async`, `queueing_lock`, schema management, connector model (MEDIUM confidence -- based on training data, verify connector API and schema management against current Procrastinate docs during implementation)
