# Phase 60: Parent Split & Parallel Processing - Research

**Researched:** 2026-04-03
**Domain:** Parallel CSV import orchestration over the existing Procrastinate + SQLAlchemy import pipeline
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Orchestration entrypoint
- **D-01:** `process_import` remains the existing queue entrypoint and becomes the parent coordinator for large imports.
- **D-02:** Phase 60 should extend the current large-file branch inside `process_import` rather than introducing a second orchestration task.

### Chunk dispatch policy
- **D-03:** The parent task creates all `ImportChunk` records up front using deterministic chunk ranges.
- **D-04:** The parent task defers one child job per chunk immediately rather than implementing staged or rolling-wave dispatch in Phase 60.

### Chunk worker contract
- **D-05:** Chunk workers should reuse the current serial import loop and batch-processing semantics rather than introducing a separate chunk-specific import engine.
- **D-06:** Chunk execution must add chunk-aware row bounds around the existing streamed CSV loop so each worker processes only its assigned row range while preserving per-batch commit and RLS restore behavior.

### Startup failure behavior
- **D-07:** If pre-scan, chunk record creation, or initial child deferral fails before chunk processing begins, the import should fail fast.
- **D-08:** Large imports should not silently fall back to the serial path after they qualify for chunked processing; orchestration failures must be explicit and debuggable.

### Carry-forward constraints
- **D-09:** Files below the serial threshold remain on the existing serial path with no behavior change.
- **D-10:** `ImportChunk` remains internal implementation state; the parent `ImportJob` stays the only user-facing progress/status surface in this phase.
- **D-11:** Completion aggregation, merged error reporting, partial-success status, cancellation propagation, and secondary-work offloading are deferred to Phases 61-63.

### Claude's Discretion
- Exact parent/child task names and helper boundaries, as long as `process_import` remains the public queue entrypoint and chunk workers preserve current durability semantics.
- Exact mechanism for persisting initial chunk metadata and queued state, as long as it cleanly supports later aggregation and resilience phases.
- Exact child-worker session lifecycle shape, as long as each chunk runs with independent database sessions and restored RLS context after each commit.

### Deferred Ideas (OUT OF SCOPE)
- Parent-level aggregation and merged finalization state — Phase 61.
- Cancellation propagation, per-chunk crash resume, and deadlock hardening — Phase 62.
- Secondary work offloading after voter commits — Phase 63.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHUNK-02 | System pre-scans CSV to count total rows for deterministic chunk boundary calculation | Reuse `stream_csv_lines()` for an O(1)-memory row-count pre-scan before the serial/chunk routing decision |
| CHUNK-03 | Parent split task creates chunk records and defers one Procrastinate child task per chunk | Keep `process_import` as the sole entrypoint, create all `ImportChunk` rows up front, then eager-fan-out one child task per chunk |
| CHUNK-04 | Chunk workers process their row range with per-batch commits, RLS restore, and independent sessions | Refactor the existing streamed import loop into a shared ranged engine so chunk workers preserve current batch durability semantics |
</phase_requirements>

## Summary

Phase 60 should not introduce a new import architecture. The existing serial pipeline already has the two hardest guarantees: streamed CSV consumption and per-batch durability with `commit_and_restore_rls()`. The right move is to keep `process_import` as the parent coordinator, add a deterministic pre-scan for row counting, fan out durable `ImportChunk` rows, and then run child workers through the same loop the serial path already trusts.

The main implementation decision is where to cut the reuse seam. The cleanest seam is not “new chunk engine”; it is “same engine with row bounds and a different progress sink.” That keeps Phase 60 aligned with D-05/D-06 and avoids drifting away from the proven serial semantics in [import_service.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py). The parent path should remain responsible for lock ownership, initial status transition, pre-scan, chunk creation, and child deferral. Child tasks should own only their chunk row range and should each create their own DB session.

This phase should also stay disciplined about what it does not solve yet. Do not add parent SQL SUM aggregation, merged error reports, chunk retry/resume, cancellation propagation, or offloaded secondary work. Those are already assigned to later phases. Phase 60 succeeds if large imports split safely, child workers run concurrently without sharing sessions, and the serial path remains unchanged for small files.

**Primary recommendation:** Refactor `process_import_file()` into one shared row-bounded engine, then call it from both the existing serial path and a new `process_import_chunk` task while keeping `process_import` as the sole orchestration entrypoint.

## Project Constraints (from CLAUDE.md)

- Use `uv` for Python commands and package management.
- Run tests with `uv run pytest`.
- Preserve the established stack: FastAPI, async SQLAlchemy, PostgreSQL, MinIO, Procrastinate.
- Respect multi-tenant RLS isolation at every DB access point.
- Keep changes inside the existing project structure and conventions.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | `>=3.13` | Runtime for the import worker | Project baseline and test/runtime target |
| Procrastinate | `>=3.7.3` | Parent and child job orchestration | Existing durable queue already used for imports |
| SQLAlchemy async | `>=2.0.48` | Per-task DB sessions and ORM access | Current import path already depends on it |
| asyncpg | `>=0.31.0` | PostgreSQL driver | Current bind-limit math and DB writes are built around it |
| aioboto3 | `>=15.5.0` | Streaming CSV bytes from object storage | Existing `StorageService.download_file()` contract |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PostgreSQL advisory locks | repo existing | Parent import ownership | Keep parent import single-owned while children run independently |
| `csv` stdlib | stdlib | Header parsing and row decoding | Keep row semantics identical between serial and chunked paths |
| MinIO/S3 object storage | repo existing | Input CSV and per-batch error files | Reuse current streamed I/O and error artifact patterns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared ranged import engine | Separate chunk-specific engine | Faster to hack initially, but duplicates the serial semantics that must stay aligned |
| Parent pre-scan in `process_import` | Pre-scan during API confirm | Pushes worker concerns into API flow and complicates user-facing latency |
| Eager fan-out | Rolling scheduler | Better worker smoothing later, but directly conflicts with D-04 in this phase |

**Installation:** None. Phase 60 should use the existing repository stack.

## Architecture Patterns

### Recommended Project Structure

```text
app/
├── tasks/
│   └── import_task.py        # parent coordinator + new child chunk task
├── services/
│   └── import_service.py     # pre-scan helper + shared ranged import engine
└── models/
    └── import_job.py         # existing ImportJob / ImportChunk state only
tests/
├── unit/
│   ├── test_import_task.py
│   └── test_import_service.py
└── integration/
    └── test_import_recovery_flow.py
```

### Pattern 1: Parent-Owns-Orchestration, Child-Owns-Range
**What:** `process_import` keeps the parent lock and performs pre-scan, routing, chunk creation, and child deferral. A new child task processes one `ImportChunk` by ID.

**When to use:** For large imports where `total_rows > settings.import_serial_threshold`.

**Use:**
- Parent task:
  - claim parent advisory lock
  - pre-scan row count if `job.total_rows` is unknown
  - route to serial path if still below threshold
  - compute chunk ranges with `plan_chunk_ranges()`
  - insert all `ImportChunk` rows up front
  - defer one child task per chunk immediately
- Child task:
  - create a fresh session with `async_session_factory()`
  - set RLS before queries
  - load `ImportChunk` and parent `ImportJob`
  - process only `row_start..row_end`

### Pattern 2: One Import Engine, Two Progress Sinks
**What:** Extract the shared streamed loop from `process_import_file()` into a lower-level method that accepts row bounds and a progress target.

**When to use:** Always. Serial imports and chunk imports should share the same loop.

**Recommended seam:**
- `count_csv_data_rows(storage, file_key) -> int`
- `process_import_range(import_job_id, session, storage, campaign_id, row_start=1, row_end=None, chunk_id=None) -> None`
- `process_import_file(...)` becomes a thin wrapper around `process_import_range(..., chunk_id=None)`
- `process_import_chunk(...)` calls `process_import_range(..., chunk_id=<chunk.id>)`

**Reasoning:** This is the smallest refactor that satisfies D-05/D-06 and preserves current behavior in one place.

### Pattern 3: Absolute File Row Bounds Over Relative Chunk Offsets
**What:** Keep chunk ranges and `last_committed_row` in 1-based data-row coordinates relative to the full CSV file, excluding the header.

**When to use:** For all chunk bookkeeping in this phase.

**Why:** The existing `plan_chunk_ranges()` already produces global file-row ranges. Using absolute positions keeps skip/break logic simple and sets up later per-chunk resume work cleanly.

### Anti-Patterns to Avoid
- **Separate chunk import engine:** It will drift from the serial path and multiply regression risk.
- **Updating parent counters directly from each child:** Phase 61 owns aggregation; direct parent writes create future race cleanup.
- **Falling back to serial after large-file orchestration fails:** Violates D-08 and hides real failures.
- **Sharing the parent session with child tasks:** Violates the independent-session requirement and risks broken RLS context after commit.
- **Reusing the parent advisory lock in child workers:** That would serialize chunk processing and defeat the phase goal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV pre-scan | Full-file materialization or a second parser stack | `stream_csv_lines()` count pass | Already handles chunked download, encoding detection, CRLF, and empty-line skipping |
| Chunk math | New chunk-sizing formula | `plan_chunk_ranges()` + existing bind-limit helper | Phase 59 already centralized the safe row math |
| Batch durability | Chunk-specific commit code | `_process_single_batch()` + `commit_and_restore_rls()` | Existing semantics are the contract that must survive chunking |
| Error artifact format | New per-chunk report format | Existing CSV batch error files under a chunk-specific prefix | Phase 61 can merge them later without conversion work |

**Key insight:** The repo already contains the hard parts. Phase 60 should compose them, not replace them.

## Implementation Approach

### CHUNK-02: Pre-scan before routing
- Add a lightweight service helper that counts data rows by iterating `stream_csv_lines(storage, job.file_key)`.
- Count only rows after the header. Keep row numbering aligned with `plan_chunk_ranges()`.
- Persist `job.total_rows` immediately after a successful pre-scan.
- Re-run `should_use_serial_import(job.total_rows, settings.import_serial_threshold)` after the pre-scan result is known.
- If pre-scan fails, mark the import `FAILED` with an orchestration-specific error message and do not continue.

### CHUNK-03: Create all chunks, then eager fan-out
- Use the existing mapped-column count to call `plan_chunk_ranges(job.total_rows, mapped_column_count, settings.import_chunk_size_default)`.
- Insert all `ImportChunk` rows up front with deterministic `row_start`, `row_end`, `status=PENDING`, and zeroed counters.
- After chunk rows exist, defer one child task per chunk immediately.
- Update each deferred chunk to `QUEUED` once the defer call succeeds.
- If chunk creation or deferral fails before any worker begins processing, fail the parent import fast. Do not route back to serial.
- Keep the API contract unchanged: `confirm_mapping()` still only defers `process_import`.

### CHUNK-04: Independent child workers over bounded row ranges
- Add a new Procrastinate task, preferably `process_import_chunk(chunk_id: str, campaign_id: str)`.
- Each child task opens its own async session, sets RLS before reads, and loads its `ImportChunk` row plus the parent job.
- Refactor the serial loop so the child can:
  - skip rows before `chunk.row_start`
  - stop after `chunk.row_end`
  - batch rows exactly as today
  - commit after each batch with `commit_and_restore_rls()`
  - restore RLS immediately after every commit
- Child progress should update the chunk row, not the parent job counters:
  - `chunk.imported_rows`
  - `chunk.skipped_rows`
  - `chunk.last_committed_row`
  - `chunk.last_progress_at`
- Keep batch error files under a chunk-specific prefix such as `imports/{campaign_id}/{import_job_id}/chunks/{chunk_id}/errors/`.
- Do not add final parent completion aggregation in this phase. A chunk can mark itself `COMPLETED`, but parent finalization belongs to Phase 61.

## Reusable Seams

### Best seam to extract from `ImportService`
- The current serial loop already has the right concerns: row streaming, batch accumulation, batch processing, commit-and-restore, and end-of-file handling.
- The reusable seam is the row iteration and commit orchestration, not the upsert logic.

### Concrete refactor boundary
- Keep `process_csv_batch()` unchanged.
- Keep `_process_single_batch()` mostly unchanged, but allow it to write counters to either `ImportJob` or `ImportChunk`.
- Introduce a small progress-target abstraction:
  - serial target writes `ImportJob.total_rows/imported_rows/skipped_rows/phones_created/last_committed_row`
  - chunk target writes `ImportChunk.imported_rows/skipped_rows/last_committed_row/last_progress_at`
- Keep `phones_created` parent-only for now. Secondary work offloading is deferred, and per-chunk phone aggregation is also deferred.

### Why this seam is worth reusing later
- Phase 61 can aggregate chunk counters without changing child behavior.
- Phase 62 can add chunk resume and cancellation checks at batch boundaries without duplicating loop logic.
- Phase 63 can remove inline phone work from one place instead of two.

## Common Pitfalls

### Pitfall 1: Off-by-one row bounds
**What goes wrong:** Workers either reprocess or skip rows at chunk boundaries.

**Why it happens:** The code mixes header-inclusive line counts with data-row counts.

**How to avoid:** Treat `row_start`/`row_end` as 1-based data-row indexes only. Increment the row counter only after the header has been consumed.

**Warning signs:** Adjacent chunks report overlapping or missing `source_id` ranges in tests.

### Pitfall 2: Accidentally serializing chunk execution
**What goes wrong:** Child tasks never run in parallel even though multiple jobs are queued.

**Why it happens:** Reusing parent import locking or queue-level locking in the child task.

**How to avoid:** Parent keeps the import advisory lock; child tasks do not claim the parent import lock and should not use the campaign queueing lock.

**Warning signs:** A concurrency test shows child tasks executing strictly one after another despite separate tasks.

### Pitfall 3: Parent/child progress contract drift
**What goes wrong:** Parent counters partially update in Phase 60 and then conflict with SQL SUM aggregation in Phase 61.

**Why it happens:** Child tasks write directly to `ImportJob.imported_rows` or `skipped_rows`.

**How to avoid:** Treat chunk rows as the durable source of truth for chunk work. Only `job.total_rows` should be updated in this phase.

**Warning signs:** Tests need special-casing to reconcile parent counters with chunk counters.

### Pitfall 4: Partial fan-out ambiguity
**What goes wrong:** Some child tasks are queued before a later deferral fails, leaving startup state unclear.

**Why it happens:** Parent setup and queue insertion are not one atomic action.

**How to avoid:** Create all chunk rows first, defer immediately, update chunk status per successful defer, and fail fast on the first orchestration error with a clear parent error message. Child workers should refuse to run if their chunk is not in an executable queued/processing state.

**Warning signs:** PENDING chunks remain after a parent orchestration failure.

### Pitfall 5: RLS loss after commit in child tasks
**What goes wrong:** Chunk workers start reading or writing outside campaign scope after a batch commit.

**Why it happens:** `COMMIT` clears transaction-local context and a new chunk path forgets to restore it.

**How to avoid:** Reuse `commit_and_restore_rls()` exactly as the serial path does now.

**Warning signs:** Integration coverage sees missing rows or cross-campaign visibility after batch commits.

## Code Examples

Verified repo-aligned patterns:

### Streaming row count pre-scan
```python
# Source: app/services/import_service.py::stream_csv_lines
async def count_csv_data_rows(storage, file_key: str) -> int:
    total = 0
    header_seen = False
    async for line in stream_csv_lines(storage, file_key):
        if not header_seen:
            header_seen = True
            continue
        total += 1
    return total
```

### Parent routing shape inside `process_import`
```python
# Source: app/tasks/import_task.py::process_import
if job.total_rows is None:
    job.total_rows = await service.count_csv_data_rows(storage, job.file_key)
    await commit_and_restore_rls(session, campaign_id)

if should_use_serial_import(job.total_rows, settings.import_serial_threshold):
    await service.process_import_file(import_job_id, session, storage, campaign_id)
    return

ranges = plan_chunk_ranges(
    total_rows=job.total_rows,
    mapped_column_count=num_mapped,
    chunk_size_default=settings.import_chunk_size_default,
)
```

### Chunk-bounded loop
```python
# Source shape: app/services/import_service.py::process_import_file
data_row_number = 0
async for line in stream_csv_lines(storage, job.file_key):
    if header is None:
        header = next(csv.reader([line]))
        continue

    data_row_number += 1
    if data_row_number < row_start:
        continue
    if row_end is not None and data_row_number > row_end:
        break

    batch.append(dict(zip(header, next(csv.reader([line])), strict=False)))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single worker processes whole file | Parent fan-out to chunk workers over shared import logic | Phase 60 | Large-file wall-clock time drops without replacing the import engine |
| Unknown `total_rows` tolerated on serial path | Deterministic pre-scan establishes row count before chunk routing | Phase 60 | Chunk boundaries become stable and reproducible |
| One session for one import task | One independent session per chunk task | Phase 60 | Parallel workers can commit independently and restore RLS safely |

**Deferred/outdated for this phase:**
- Parent progress aggregation from chunk rows: Phase 61, not Phase 60.
- Chunk crash resume and cancellation propagation: Phase 62, not Phase 60.
- Secondary work offloading: Phase 63, not Phase 60.

## Open Questions

1. **Should `ImportChunk.last_committed_row` be absolute file row or chunk-relative?**
   - What we know: `row_start`/`row_end` are already absolute 1-based file row bounds.
   - What's unclear: The model field name does not encode the coordinate system.
   - Recommendation: Use absolute data-row numbers now. It keeps skip logic and later resume logic simpler.

2. **How should startup fan-out failure be represented on the parent record?**
   - What we know: D-07/D-08 require explicit failure, not silent serial fallback.
   - What's unclear: Whether to use a generic or orchestration-specific `error_message`.
   - Recommendation: Use a distinct orchestration error string so later debugging can separate setup failures from row-processing failures.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | test and lint commands | ✓ | `0.8.14` | — |
| Node.js | GSD tooling | ✓ | `v24.13.1` | — |
| `pytest` via `uv run` | automated validation | ✓ | `pytest 9.0.2` | — |
| Docker | local integration environment | ✓ | `29.3.1` | mock storage/unit tests only |
| `psql` | DB inspection/debugging | ✓ | `14.22` | SQLAlchemy integration tests |
| MinIO CLI | direct storage CLI inspection | ✗ | — | use app `StorageService` or Docker service |

**Missing dependencies with no fallback:**
- None for planning. Docker-backed integration execution still depends on the local stack being up.

**Missing dependencies with fallback:**
- MinIO CLI is absent, but storage behavior is already mockable and the app uses S3 APIs, not the CLI.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest 9.0.2` + `pytest-asyncio` |
| Config file | [pyproject.toml](/home/kwhatcher/projects/civicpulse/run-api/pyproject.toml) |
| Quick run command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x` |
| Full suite command | `uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHUNK-02 | Parent pre-scan counts CSV rows without materializing the file and persists `total_rows` before routing | unit | `uv run pytest tests/unit/test_import_service.py -x` | ✅ |
| CHUNK-03 | Parent creates deterministic chunk rows and defers one child task per chunk | unit | `uv run pytest tests/unit/test_import_task.py -x` | ✅ |
| CHUNK-04 | Child worker processes only its row range with independent session semantics and per-batch RLS restore | unit + integration | `uv run pytest tests/unit/test_import_service.py tests/integration/test_import_recovery_flow.py -x` | ✅ |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x`
- **Per wave merge:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_recovery_flow.py -x`
- **Phase gate:** `uv run pytest`

### Wave 0 Gaps
- [ ] Extend [test_import_service.py](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) with pre-scan row-count coverage and chunk-bounded loop coverage.
- [ ] Extend [test_import_task.py](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py) with parent fan-out assertions, no-serial-fallback failure assertions, and chunk defer count assertions.
- [ ] Add a focused integration test for parallel chunk execution shape, preferably by mocking storage and DB writes while asserting separate session factories per child task.

## Sources

### Primary (HIGH confidence)
- [60-CONTEXT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/phases/60-parent-split-parallel-processing/60-CONTEXT.md) - locked Phase 60 decisions and scope boundaries
- [REQUIREMENTS.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/REQUIREMENTS.md) - CHUNK-02/03/04 requirement definitions
- [ROADMAP.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/ROADMAP.md) - milestone sequencing and Phase 60 success criteria
- [v1.11-ROADMAP.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/milestones/v1.11-ROADMAP.md) - milestone-specific Phase 60 detail
- [import_task.py](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py) - current parent task behavior and lock ownership
- [import_service.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py) - existing streamed serial engine, chunk helpers, and batch durability logic
- [import_job.py](/home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py) - `ImportJob` and `ImportChunk` state surfaces
- [imports.py](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/imports.py) - API dispatch contract

### Secondary (MEDIUM confidence)
- [57-CONTEXT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/phases/57-recovery-engine-completion-hardening/57-CONTEXT.md) - carry-forward recovery and advisory-lock constraints
- [59-CONTEXT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/phases/59-chunk-schema-configuration/59-CONTEXT.md) - chunk schema/config decisions that Phase 60 builds on
- [test_import_service.py](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) - current helper coverage
- [test_import_task.py](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py) - current task coverage seams
- [test_streaming_csv.py](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_streaming_csv.py) - authoritative streaming behavior expectations
- [test_import_recovery_flow.py](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_recovery_flow.py) - existing resume/durable processing expectations

### Tertiary (LOW confidence)
- None. This research relied on repo-local authoritative sources rather than unverified web search.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - the repository already declares and uses the required runtime stack
- Architecture: HIGH - the locked Phase 60 decisions strongly constrain the shape of the solution
- Pitfalls: HIGH - they fall directly out of the current serial implementation, RLS model, and deferred-phase boundaries

**Research date:** 2026-04-03
**Valid until:** 2026-05-03

## Planner Checklist

- [ ] Keep `process_import` as the only public queue entrypoint and extend its current large-file branch.
- [ ] Add a streamed pre-scan that counts data rows before the serial/chunk routing decision.
- [ ] Preserve serial behavior unchanged for files at or below `import_serial_threshold`.
- [ ] Create all `ImportChunk` rows up front from deterministic `plan_chunk_ranges()` output.
- [ ] Defer one child task per chunk immediately after chunk creation.
- [ ] Introduce a child task with its own async DB session and RLS setup.
- [ ] Refactor the serial import loop into a shared row-bounded engine instead of building a chunk-only engine.
- [ ] Keep chunk row bounds in absolute 1-based data-row coordinates.
- [ ] Preserve per-batch `commit_and_restore_rls()` behavior inside chunk workers.
- [ ] Keep chunk progress on `ImportChunk` records only; do not implement parent aggregation or finalization in this phase.
- [ ] Fail fast on pre-scan/chunk-creation/deferral errors; never silently fall back to serial once a file qualifies for chunking.
- [ ] Add unit coverage for pre-scan, fan-out, range bounds, and no-fallback failure behavior, plus one integration test for concurrent chunk-worker shape.
