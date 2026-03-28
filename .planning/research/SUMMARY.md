# Project Research Summary

**Project:** CivicPulse Run API — v1.6 Large-File Voter Import & L2 Auto-Mapping
**Domain:** Background task processing, resumable batch imports, voter data pipeline
**Researched:** 2026-03-28
**Confidence:** HIGH (based on direct codebase analysis; Procrastinate API details MEDIUM pending version verification)

## Executive Summary

The v1.6 milestone targets two independently valuable but architecturally connected improvements: (1) replacing the non-production TaskIQ InMemoryBroker with Procrastinate, a PostgreSQL-native task queue, and (2) expanding the L2 voter file column alias dictionary to achieve zero-manual-mapping for the industry's dominant voter data format. These two goals are connected because a durable task queue is a prerequisite for the per-batch commit strategy that makes large imports crash-safe and provides real-time progress visibility — and L2 auto-mapping is only valuable if the imports that use it can actually complete reliably on large files.

The recommended approach is a phased migration: establish durable background processing first (Procrastinate integration + per-batch commits), then harden the import pipeline against the documented OOM crash (temp-file or streaming download), then complete L2 column coverage. The Procrastinate swap is the foundational change — everything else depends on it. The existing codebase is well-structured for this migration: the import service is already modular, the session factory is already async, and the voter upsert is already idempotent (ON CONFLICT DO UPDATE), which is the key property that makes per-batch commits safe.

The single largest risk is the RLS context lifecycle interaction with per-batch commits. The current system uses transaction-scoped RLS (`set_config(..., true)`), which deliberately resets on every COMMIT. Moving to per-batch commits means RLS context must be re-set after every batch commit — failure to do this causes silent data invisibility (batches 2-N produce zero rows) without errors, making the bug extremely hard to diagnose. A secondary risk is the documented OOM crash on 30MB+ files (pod killed at 512MB, exit code 3) that must be addressed alongside per-batch commits to prevent re-triggering the same crash with the new pipeline.

## Key Findings

### Recommended Stack

Procrastinate replaces TaskIQ entirely. It stores jobs in the existing PostgreSQL 17 database as rows in `procrastinate_jobs`, uses `LISTEN/NOTIFY` for instant job pickup (no polling), and provides a native async API. The project adds one new Python package (`procrastinate`) and one new driver (`psycopg[binary]` — psycopg 3, distinct from the existing `psycopg2-binary` used by Alembic). These three PostgreSQL drivers (`asyncpg` for SQLAlchemy, `psycopg2-binary` for Alembic, `psycopg[binary]` for Procrastinate) coexist without conflict as separate packages with separate namespaces. No new infrastructure is required.

**Core technologies:**
- `procrastinate >=2.0.0`: PostgreSQL-native async task queue — replaces TaskIQ InMemoryBroker; zero new infrastructure; jobs durable across pod restarts
- `psycopg[binary] >=3.1.0`: psycopg 3 async driver — required by Procrastinate; coexists with existing asyncpg and psycopg2-binary
- `asyncpg`, `rapidfuzz`, `aioboto3`, `sqlalchemy`, `geoalchemy2`: all unchanged — used by the import pipeline as-is

**What to remove:**
- `taskiq` and `taskiq-fastapi` — fully replaced by Procrastinate; remove from `pyproject.toml`

**Version verification required at install time:** exact Procrastinate connector class name (`PsycopgConnector`), `open_async()` method, and schema CLI syntax must be verified against the installed version, as training data may be stale.

### Expected Features

**Must have (table stakes):**
- Background import processing (non-blocking, 202 Accepted response) — a 200K-row file takes 2-10 minutes; blocking HTTP requests causes timeouts and lost imports
- Per-batch commits (partial progress survives crashes) — current single-transaction design loses all progress on pod crash
- Resume from last committed batch — re-importing from scratch after crash is unacceptable for large files; existing upsert idempotency makes replay safe
- Real-time progress reporting — frontend already built (ImportProgress.tsx polls every 3s); per-batch commits make it live automatically at no extra cost
- Error report download — already fully implemented; no changes needed
- L2 column auto-mapping (complete coverage) — campaigns buy L2 files and expect zero-manual-mapping; current alias dictionary covers ~30 L2 column patterns but has documented gaps

**Should have (differentiators):**
- Zero-touch L2 import (skip mapping step when 100% of columns auto-map) — low complexity, high UX value for the most common file format
- Format auto-detection confidence display ("45 of 47 columns mapped") — pure frontend calculation from existing data; no backend changes
- Per-batch error isolation (SAVEPOINT per batch so one bad row does not cascade to invalidate the whole batch)
- Import cancellation (add CANCELLED to ImportStatus; check status between batches in worker loop)
- Voting history format expansion (Gen_YYYY, Prim_YYYY, GeneralElection_YYYY, Voted_in_YYYY_General, and space-separated variants)

**Defer (v2+):**
- WebSocket/SSE progress (polling at 3s is sufficient for 5-20 minute imports; push-based adds infrastructure)
- Parallel batch processing (single-worker sequential is fast enough; parallelism adds lock contention complexity)
- Import scheduling for off-hours runs
- ZIP file or Shapefile/GDB import
- Import rollback (cascading data dependencies make this destructive and hard to reason about)
- AI/LLM column mapping (deterministic dictionary + fuzzy match solves this without external dependencies or latency)
- Stale import cleanup, duplicate detection, file size estimation (good hygiene, low priority)

### Architecture Approach

The integration modifies four existing files and adds two new ones. `app/tasks/broker.py` is deleted and replaced by `app/tasks/procrastinate_app.py`. `app/tasks/import_task.py` is rewritten with the Procrastinate task decorator. `app/services/import_service.py` gains a new `process_import_file_resumable()` method that commits per-batch and re-sets RLS context after each commit. `app/main.py` replaces broker startup/shutdown with `procrastinate_app.open_async()`/`close_async()`. The endpoint dispatch changes from `process_import.kiq(str(id))` to `import_voter_file.defer_async(import_job_id=str(id), campaign_id=str(campaign_id))`. A new docker-compose worker service and Kubernetes worker Deployment reuse the same image with a different command.

**Major components:**
1. `app/tasks/procrastinate_app.py` — Procrastinate App instance; derives PostgreSQL connection string from existing `settings.database_url` by stripping `+asyncpg`; owns Procrastinate's separate psycopg 3 connection pool
2. `app/tasks/import_task.py` (rewritten) — Procrastinate task definition using `@procrastinate_app.task`; receives `campaign_id` as keyword argument to resolve the RLS chicken-and-egg bootstrap problem; delegates to `process_import_file_resumable()`
3. `app/services/import_service.py` (new method `process_import_file_resumable`) — per-batch commit loop with `set_campaign_context()` called after every `session.commit()`; reads `last_completed_batch` to skip already-committed batches on crash resume
4. `app/models/import_job.py` (modified) — adds `last_completed_batch` (int, default 0) and `batch_size` (int, default 1000) columns; requires new Alembic migration
5. Worker process — runs `procrastinate worker --queue=imports` CLI; docker-compose dev service + separate K8s Deployment with higher memory limit (1GB vs API's 512MB)
6. Procrastinate schema — `procrastinate_jobs`, `procrastinate_events`, `procrastinate_periodic_defers` tables created via `procrastinate schema --apply` in init container alongside `alembic upgrade head`, or embedded in an Alembic migration via `op.execute()`

### Critical Pitfalls

1. **RLS context lost after per-batch commit** — Transaction-scoped `set_config('app.current_campaign_id', :id, true)` resets on every COMMIT. Must re-call `set_campaign_context(session, campaign_id)` immediately after every `session.commit()` in the batch loop. Silent failure mode: import reports success but only the first 1,000 rows (one batch) are actually imported. This is the highest-priority pitfall in the entire migration.

2. **Worker cannot read ImportJob before setting RLS (chicken-and-egg)** — `import_jobs` has RLS enabled. The worker needs `campaign_id` to set RLS context before reading ImportJob, but ImportJob stores `campaign_id`. Solution: pass `campaign_id` as a Procrastinate task keyword argument at dispatch time. Cannot be deferred — must be built into Phase 1.

3. **Full file loaded into memory before parsing (OOM)** — Current code joins all S3 download chunks into a single bytestring (~90MB memory for a 30MB CSV). This caused the documented pod OOM crash (113K rows, 30MB file, 512MB limit, exit code 3 after ~30s). Fix: download to a temp file on disk (worker pod has `readOnlyRootFilesystem: false`), or implement line-buffered streaming from S3.

4. **Single transaction means all-or-nothing — no resumability** — Current code calls `session.commit()` once after the entire file. A pod crash loses all progress. Fix: per-batch commits with `last_completed_batch` tracking; replay from beginning on resume (idempotent upsert makes re-processing rows safe).

5. **Procrastinate schema not tracked by Alembic** — Procrastinate creates its own tables outside Alembic's migration history, meaning fresh database setups and CI environments require a separate schema setup step. Embed Procrastinate's schema SQL in an Alembic migration via `op.execute()` (using `procrastinate schema --sql` to dump the SQL), or add `procrastinate schema --apply` as an explicit init container step.

**Additional moderate pitfalls to address during implementation:**
- Double RLS context set in both `import_task.py` and `import_service.py` — consolidate ownership to the batch loop
- Dual connection pool (Procrastinate's psycopg 3 pool + SQLAlchemy's asyncpg pool) — size PostgreSQL `max_connections` to accommodate both
- TaskIQ to Procrastinate is not a find-and-replace — different decorator, keyword-only task args, different dispatch method; existing TaskIQ mocks need rewriting
- Error list accumulates unbounded in memory — cap at 1,000 or stream errors to S3 per-batch
- Concurrent imports for the same campaign can deadlock on voter upsert — use Procrastinate `queueing_lock=f"import:{campaign_id}"`

## Implications for Roadmap

Based on research, the dependency graph dictates phase order: Procrastinate integration is a prerequisite for per-batch commits, which are a prerequisite for crash resilience. L2 mapping is independent but sequenced after reliability work to avoid mixing concerns.

### Phase 1: Procrastinate Integration and Infrastructure

**Rationale:** Foundation phase. Without a durable job queue, per-batch commits cannot be wired up, the worker cannot run separately, and all reliability improvements are impossible. This phase also resolves the RLS chicken-and-egg bootstrap problem (Pitfall 2) and the full TaskIQ API migration (Pitfall 7). Must complete before any other import reliability work.

**Delivers:** Durable background processing (jobs survive pod restarts); Procrastinate schema in the database; worker service in docker-compose; `last_completed_batch` and `batch_size` columns on ImportJob via Alembic migration; endpoint returns 202 Accepted.

**Addresses:** Background import processing (table stakes), non-blocking confirm endpoint.

**Avoids:** Pitfall 2 (pass `campaign_id` as task arg at dispatch time), Pitfall 7 (replace TaskIQ API correctly — not a find-and-replace), Pitfall 8 (Procrastinate schema in init container or Alembic migration).

### Phase 2: Per-Batch Commits and Crash Resumability

**Rationale:** The highest-value reliability improvement and the core goal of v1.6. Requires Phase 1 (Procrastinate must be in place). Implementing per-batch commits also automatically fixes real-time progress visibility (Pitfall 9) — no separate work needed. The RLS-after-commit pattern (Pitfall 1) is the critical implementation detail here.

**Delivers:** Per-batch commits with RLS context restoration after each commit; `last_completed_batch` tracking in the batch loop; crash-safe imports where pod restart preserves committed batches; real-time progress updates visible via the existing polling endpoint (no frontend changes required); crash resume that skips already-committed batches using idempotent upsert.

**Addresses:** Per-batch commits (table stakes), resume from crash (table stakes), real-time progress (frontend already built — now works correctly).

**Avoids:** Pitfall 1 (re-set RLS after every commit — critical, silent failure mode), Pitfall 4 (per-batch instead of single transaction), Pitfall 5 (consolidate RLS context ownership to batch loop only).

### Phase 3: Memory Safety and Production Hardening

**Rationale:** Directly addresses the documented production OOM crash. Per-batch commits from Phase 2 reduce the in-flight data window per batch, but the full file download into memory before parsing remains a distinct problem for large files.

**Delivers:** Temp-file download strategy (or line-buffered streaming) eliminating OOM for files up to practical limits; bounded error accumulation (stream errors to S3 per-batch or cap at a fixed limit); separate K8s Deployment for worker with higher memory limits (1GB); connection pool sizing guidance to prevent pool exhaustion; worker observability (Sentry SDK, structlog) initialized in worker entrypoint.

**Addresses:** Import reliability for files above the 30MB crash threshold.

**Avoids:** Pitfall 3 (full file in memory), Pitfall 10 (unbounded error accumulation), Pitfall 6 (dual connection pool sizing), Pitfall 11 (worker observability), Pitfall 16 (separate K8s Deployment).

### Phase 4: L2 Auto-Mapping Completion

**Rationale:** The L2 mapping improvements are fully independent of the reliability infrastructure. They are sequenced here to keep the critical path unambiguous. They deliver the second major user-facing goal of v1.6.

**Delivers:** Complete alias dictionary for all documented L2 column name patterns (including gaps: `Voters_StateVoterID`, `Voters_RegistrationDate`, `Voters_OfficialRegParty`, component address fields, district columns); extended voting history regex (Gen_YYYY, Prim_YYYY, GeneralElection_YYYY, PrimaryElection_YYYY, Voted_in_YYYY_General, space-separated variants); component address concatenation strategy for split-address L2 exports; date field normalization (MM/DD/YYYY, YYYYMMDD, M/D/YYYY); improved encoding detection (try cp1252 before latin-1 for Windows-exported voter files).

**Addresses:** L2 column auto-mapping (table stakes), voting history format flexibility (table stakes).

**Avoids:** Pitfall 13 (voting history regex gaps documented in PROJECT.md), Pitfall 14 (state variation — exact-match-first before fuzzy matching), Pitfall 15 (date parse failures on non-ISO formats), Pitfall 18 (cp1252 vs latin-1 encoding corruption of voter names).

### Phase 5: Differentiators and Concurrent Safety

**Rationale:** Once the core pipeline is reliable and L2 coverage is complete, the differentiator features add UX value at low implementation cost. Concurrent import safety belongs here since it depends on Procrastinate's `queueing_lock` feature being available.

**Delivers:** Import cancellation (CANCELLED status + cancel endpoint + worker batch-loop status check); concurrent import guard (campaign-level lock via Procrastinate `queueing_lock`); zero-touch L2 detection (skip mapping wizard step when all columns auto-map); format auto-detection confidence display (frontend only, no backend changes); per-batch error isolation (SAVEPOINT per batch).

**Addresses:** Differentiator features from FEATURES.md; Pitfall 12 (concurrent import deadlock).

### Phase Ordering Rationale

- Procrastinate must come first because `defer_async()` replaces `kiq()`, and the worker process must exist before per-batch commits can run persistently
- Per-batch commits must come before memory optimization because the commit structure must be correct before optimizing what happens inside each batch
- L2 mapping is decoupled but sequenced after reliability to avoid touching `import_service.py` while the per-batch commit refactor is also in progress
- Differentiators are last because they depend on the foundation being stable and tested end-to-end

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Procrastinate exact API (connector class name, `open_async()` vs `open()`, schema CLI syntax, `defer_async()` method signature) must be verified at install time via `uv add procrastinate` and reading installed docs

Phases with standard patterns (can skip research-phase):
- **Phase 2:** Per-batch commit + RLS re-set is established SQLAlchemy pattern; all code is internal to this codebase
- **Phase 3:** Temp-file pattern with aioboto3 is straightforward; no external library research needed beyond reading aioboto3's existing usage in the codebase
- **Phase 4:** L2 alias expansion is dictionary and regex work; deterministic; no library research needed
- **Phase 5:** All features use existing patterns (status enum, endpoint structure, Procrastinate `queueing_lock` documented in Procrastinate docs)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Procrastinate is the right tool (HIGH — confirmed by PROJECT.md); exact version numbers and API method names require verification at install time (LOW on specifics) |
| Features | HIGH | Import pipeline and L2 mapping are well-understood from codebase analysis; frontend polling infrastructure already built; upsert idempotency confirmed from models |
| Architecture | HIGH | All modified files identified; per-batch commit pattern is standard SQLAlchemy; RLS lifecycle confirmed by direct reading of `rls.py` (line 28) and `session.py` (lines 23-38) |
| Pitfalls | HIGH | Critical pitfalls confirmed by codebase analysis and existing issue documentation; RLS behavior is fundamental PostgreSQL semantics; OOM crash documented in `docs/issues/` |

**Overall confidence:** HIGH for what to build and why; MEDIUM for exact Procrastinate API syntax (must verify at install time before writing Phase 1 code).

### Gaps to Address

- **Procrastinate exact API surface:** `PsycopgConnector` class name, `open_async()` vs alternatives, `schema --apply` CLI syntax — verify with `uv add procrastinate` and check installed version docs before writing any Phase 1 code
- **psycopg 3 + asyncpg coexistence in practice:** Run `uv run python -c "import psycopg; import asyncpg; import psycopg2; print('OK')"` to confirm no import conflicts in the actual environment
- **L2 component address handling strategy:** The concatenation logic for split address columns (`Residence_Addresses_HouseNumber` + direction + `Residence_Addresses_StreetName` + etc.) requires a concrete implementation decision before Phase 4 — direct alias mapping (to separate model fields) or concatenation in `apply_field_mapping()`
- **Procrastinate schema management approach:** Decide between (a) embedding schema SQL in Alembic migration or (b) `procrastinate schema --apply` as a separate init container step before Phase 1 implementation
- **Worker memory ceiling:** Verify whether the temp-file approach (Phase 3) eliminates the OOM condition entirely or merely raises the threshold for very large files (>100MB)
- **pgBouncer compatibility:** If connection pooling is added to the stack later, verify that Procrastinate's `LISTEN/NOTIFY` mechanism works through pgBouncer (statement mode blocks LISTEN; session mode required)

## Sources

### Primary (HIGH confidence — direct codebase analysis)
- `app/tasks/broker.py` — TaskIQ InMemoryBroker (confirms non-durable baseline)
- `app/tasks/import_task.py` — current task structure, RLS setup, single-session pattern
- `app/services/import_service.py` — full-file memory download (lines 872-876), flush-only progress, error accumulation
- `app/db/rls.py` — transaction-scoped `set_config(..., true)` confirming RLS reset on commit
- `app/db/session.py` — pool checkout RLS reset handler (confirms defense-in-depth design)
- `app/api/v1/imports.py` — `process_import.kiq()` dispatch at line 248
- `app/models/import_job.py` — existing ImportJob columns and status enum
- `docs/issues/large-voter-import-crash.md` — documented OOM crash (113K rows, 30MB file, 512MB limit, exit code 3)
- `alembic/versions/002_voter_data_models.py` — `import_jobs` in `_CAMPAIGN_TABLES` list (line 41), confirming RLS is enabled on import_jobs
- `k8s/apps/run-api-dev/deployment.yaml` — 512MB memory limit, `readOnlyRootFilesystem: false`
- `.planning/PROJECT.md` — v1.6 scope confirming Procrastinate choice and L2 column mapping targets
- `pyproject.toml` — current dependencies (taskiq 0.12.1, taskiq-fastapi 0.4.0)

### Secondary (MEDIUM confidence — training data, recommend verification)
- Procrastinate documentation (procrastinate.readthedocs.io) — async API, FastAPI integration, psycopg 3 requirement, worker CLI, schema management, `queueing_lock` feature
- psycopg 3 documentation (psycopg.org) — async connector, binary package, coexistence with psycopg2
- L2 voter file format patterns — training data knowledge of L2 column naming conventions, supplemented by the existing alias dictionary entries in `import_service.py`

### Tertiary (LOW confidence — needs validation)
- Exact latest Procrastinate version on PyPI at time of implementation
- Exact API method names in the installed Procrastinate release (connector class, open/close methods, defer method signatures)
- L2 column name patterns for states not yet represented in the existing alias dictionary

---
*Research completed: 2026-03-28*
*Ready for roadmap: yes*
