# Phase 65: Chunk Planning & Concurrency Cap Closure - Research

**Researched:** 2026-04-03
**Domain:** Chunked import orchestration, adaptive chunk planning, and bounded task fan-out
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No `65-CONTEXT.md` file exists for this phase, so there are no locked decisions, discretion notes, or deferred ideas to copy verbatim.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHUNK-06 | Chunk size adapts based on column count (asyncpg bind-parameter limit) and file size | Extend `plan_chunk_ranges()` to accept object size, derive an estimated bytes-per-row budget from storage metadata plus `total_rows`, and clamp chunk rows by both bind-limit and byte-budget heuristics. |
| CHUNK-07 | Max concurrent chunks per import is configurable (default capped to prevent worker starvation) | Replace eager deferral with rolling-window dispatch: parent defers only the first `import_max_chunks_per_import` chunks, and completed primary chunk workers promote the next pending chunk durably. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Use `uv` for Python package management and Python command execution.
- Python linting and formatting must remain compatible with `uv run ruff check .` and `uv run ruff format .`.
- Tests must run through `uv run pytest`.
- E2E browser work, if needed later, should use `web/scripts/run-e2e.sh`.
- Primary backend stack is FastAPI + async SQLAlchemy + PostgreSQL/PostGIS + Procrastinate.
- Preserve the existing project structure: `app/`, `alembic/`, `tests/`, `.planning/`.

## Summary

Phase 65 is a backend/runtime gap-closure phase, not a new architecture phase. The current implementation already has the right durable building blocks: `ImportChunk` rows, deterministic row-range planning, a single parent entrypoint (`process_import`), independent chunk workers, and chunk-local terminal/finalization behavior. The remaining defects are narrow and concrete: chunk planning never reads object size, and parent orchestration defers every chunk immediately even though `import_max_chunks_per_import` exists in settings.

The correct implementation path is to preserve the existing task graph and repair the two missing decision points. First, make chunk planning pure and deterministic but include file size as an input, using storage metadata instead of a second full-file download. Second, change fan-out from eager deferral to a rolling window: the parent schedules only the first bounded set of primary chunk workers, and each completed primary worker promotes the next pending chunk in order. That closes both audit gaps without changing the chunk schema, parent finalization contract, or secondary-work architecture from Phases 61-63.

The planner should treat this as one backend behavior change plus one documentation/verification sweep. No new framework is needed. The highest-risk mistakes are over-throttling by counting secondary-task time against the primary-worker cap, and introducing non-durable in-memory scheduling that fails across worker crashes.

**Primary recommendation:** Keep the current Procrastinate + `ImportChunk` design, add a file-size-aware chunk planner in `app/services/import_service.py`, and implement durable rolling-window chunk dispatch in `app/tasks/import_task.py`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.135.3 | API/runtime framework | Already owns import endpoints and task-triggering flow in this repo. |
| SQLAlchemy | 2.0.48 | Async ORM + durable chunk state queries | Existing chunk/job lifecycle and RLS-aware session model already depend on it. |
| Procrastinate | 3.7.3 | Background task queue | Existing `process_import` and chunk worker task model already uses it. |
| aioboto3 / S3 API | aioboto3 15.5.0+, S3 `head_object` | Object storage streaming and metadata lookup | Storage already lives behind `StorageService`; file-size lookup belongs here. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pydantic-settings | 2.13.1 | Import cap/default settings | Reuse existing settings surface; do not add config unless a hard requirement appears. |
| pytest | 9.0.2 | Unit and integration verification | Extend existing import task/service suites. |
| pytest-asyncio | 1.3.0 | Async task/service tests | Required for task orchestration coverage. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing Procrastinate tasks + durable chunk rows | Custom scheduler service or producer-consumer queue | Unnecessary architecture churn; duplicates persistence and retry semantics already present. |
| S3 metadata lookup via `head_object` | Full second file scan to infer size | Wastes I/O and still gives no cleaner source of object size. |
| Rolling-window durable promotion | In-memory semaphore inside one task run | Breaks across worker/process boundaries and does not survive task crashes. |

**Installation:**
```bash
uv sync
```

**Version verification:** Verified from the local environment on 2026-04-03 with `uv run python` imports and `uv run pytest --version`. No new packages are required for this phase.

## Architecture Patterns

### Recommended Project Structure
```text
app/
├── services/
│   ├── import_service.py   # pure sizing helpers + chunk state aggregation helpers
│   └── storage.py          # add object metadata helper here
├── tasks/
│   └── import_task.py      # parent rolling-window dispatch and successor promotion
tests/
├── unit/
│   ├── test_import_service.py
│   └── test_import_task.py
└── integration/
    └── test_import_parallel_processing.py
```

### Pattern 1: Pure File-Size-Aware Chunk Planner
**What:** Keep chunk planning as a pure helper, but expand its inputs from `(total_rows, mapped_column_count, chunk_size_default)` to include object size in bytes.
**When to use:** Every time the parent determines an import should use chunking.
**Example:**
```python
# Source: /home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py
def plan_chunk_ranges(
    total_rows: int,
    mapped_column_count: int,
    chunk_size_default: int,
    file_size_bytes: int | None,
) -> list[tuple[int, int]]:
    bind_limited_rows = calculate_effective_rows_per_write(
        mapped_column_count=mapped_column_count,
        target_rows=chunk_size_default,
    )
    file_limited_rows = estimate_rows_from_file_budget(
        total_rows=total_rows,
        file_size_bytes=file_size_bytes,
        fallback_rows=chunk_size_default,
    )
    chunk_rows = max(1, min(bind_limited_rows, file_limited_rows, chunk_size_default))
    ...
```

### Pattern 2: Rolling-Window Primary Chunk Dispatch
**What:** Parent defers only the first `settings.import_max_chunks_per_import` chunk tasks; each completed primary chunk worker promotes the next pending chunk.
**When to use:** For imports on the chunked path only.
**Example:**
```python
# Source: /home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py
initial_limit = min(settings.import_max_chunks_per_import, len(chunks))
for chunk in chunks[:initial_limit]:
    await process_import_chunk.defer_async(str(chunk.id), campaign_id)
    chunk.status = ImportChunkStatus.QUEUED

# Later, from the chunk worker after the primary row range is done:
await service.defer_next_pending_chunk(
    session=session,
    import_job_id=job.id,
    campaign_id=campaign_id,
)
```

### Pattern 3: Durable Successor Promotion, Not In-Memory Coordination
**What:** Promotion of the next chunk must be driven by database state (`ImportChunk.status`, ordered by `row_start`) and committed before/with deferral bookkeeping.
**When to use:** Whenever a primary chunk worker exits its row-range phase and frees a slot.
**Example:**
```python
# Source: recommended new helper in /home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py
next_chunk = await pick_next_pending_chunk_for_update(...)
if next_chunk is not None:
    next_chunk.status = ImportChunkStatus.QUEUED
    next_chunk.last_progress_at = utcnow()
    await commit_and_restore_rls(session, campaign_id)
    await process_import_chunk.defer_async(str(next_chunk.id), campaign_id)
```

### Anti-Patterns to Avoid
- **Do not count only initial deferrals as “cap enforcement”:** Scheduling the first N chunks without promoting successors leaves later chunks stranded.
- **Do not use an in-memory semaphore as the source of truth:** Multiple workers/processes make this non-durable and race-prone.
- **Do not re-download the whole CSV just to learn its size:** S3 metadata already exposes object length.
- **Do not let secondary-task time hold primary-worker slots unless explicitly intended:** It defeats the Phase 63 critical-path offload.
- **Do not add new chunk schema fields unless tests prove current durable state is insufficient:** Existing `PENDING`/`QUEUED`/`PROCESSING` states are likely enough.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File-size lookup | Manual stream-length pass over the whole object | `StorageService` wrapper over S3 `head_object` metadata | One network call, no duplicate streaming cost, authoritative `ContentLength`. |
| Cross-worker scheduling | Ad hoc Python-only queue coordinator | Durable `ImportChunk` row state transitions + ordered selection | Survives retries/crashes and matches the rest of the import lifecycle model. |
| Concurrency accounting | New global runtime registry | Existing chunk statuses plus deterministic successor promotion | Keeps orchestration local to the import and auditable in the DB. |

**Key insight:** The repo already has the durable import orchestration substrate. Phase 65 should tighten the decision logic on top of it, not introduce a second scheduler.

## Common Pitfalls

### Pitfall 1: File-Size Heuristic That Cancels Itself Out
**What goes wrong:** A formula derives its byte budget from the same `chunk_size_default` and average row size, so file-size input never materially changes chunk ranges.
**Why it happens:** File size gets threaded through the API but not used to create an independent constraint.
**How to avoid:** Use a real byte-budget clamp or explicit size tiers; assert in tests that two files with the same row count and column count but different `file_size_bytes` yield different chunk plans.
**Warning signs:** New tests only assert the helper accepts `file_size_bytes`, not that ranges actually change.

### Pitfall 2: Cap Applies Only at Startup
**What goes wrong:** Parent defers only the first N chunks, but nothing launches chunk N+1 after a slot opens.
**Why it happens:** `process_import` runs once; later scheduling work has no owner.
**How to avoid:** Make primary chunk workers promote the next pending chunk after they finish their row-range work.
**Warning signs:** Imports larger than the cap stall with chunks left in `PENDING`.

### Pitfall 3: Secondary Work Accidentally Consumes Primary Slots
**What goes wrong:** A chunk remains “active” for cap math until phone/geometry tasks finish, sharply reducing primary import throughput.
**Why it happens:** `ImportChunk.status` stays `PROCESSING` through secondary work in the current lifecycle.
**How to avoid:** Define the cap around `process_import_chunk` fan-out, not entire chunk terminality, and hand off one successor when the primary worker exits.
**Warning signs:** Only one new chunk launches after all secondary tasks complete, even though multiple primary workers have already finished.

### Pitfall 4: Deferral and Status Updates Split Across Failure Boundaries
**What goes wrong:** A chunk is marked `QUEUED` before deferral succeeds, or deferral succeeds without durable state update.
**Why it happens:** Status mutation and task enqueue happen in the wrong order or outside a clear failure contract.
**How to avoid:** Preserve the existing “defer then mark queued” or an explicitly tested equivalent failure contract, and extend it to successor promotion.
**Warning signs:** Audit logs show queued chunks that were never actually deferred, or duplicate child task launches after retries.

## Code Examples

Verified patterns from current code and official sources:

### Read File Size from Object Metadata
```python
# Source: https://docs.aws.amazon.com/boto3/latest/reference/services/s3/client/head_object.html
async with self.session.client(**self._client_kwargs()) as s3:
    response = await s3.head_object(Bucket=settings.s3_bucket, Key=key)
    return int(response["ContentLength"])
```

### Bound Async Work with a Semaphore
```python
# Source: https://docs.python.org/3/library/asyncio-sync.html#asyncio.Semaphore
sem = asyncio.Semaphore(4)

async with sem:
    await do_work()
```

### Existing Deterministic Chunk Planning Seam
```python
# Source: /home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py
chunk_rows = calculate_effective_rows_per_write(
    mapped_column_count=mapped_column_count,
    target_rows=chunk_size_default,
)
return [
    (row_start, min(row_start + chunk_rows - 1, total_rows))
    for row_start in range(1, total_rows + 1, chunk_rows)
]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Row-count-only default chunk sizing plus bind-limit clamp | Row-count planning must also consider file-size-derived row-width heuristics | Phase 65 | Prevents very large-row files from using chunk sizes chosen only for narrow-row CSVs. |
| Eagerly defer every chunk at parent start | Rolling-window dispatch capped by `import_max_chunks_per_import` | Phase 65 | Prevents a single import from flooding the worker queue and starving unrelated work. |
| One-time parent fan-out | Parent initial launch plus worker-driven successor promotion | Phase 65 | Keeps bounded parallelism without adding a new scheduler service. |

**Deprecated/outdated:**
- Claiming `CHUNK-06` is satisfied by the current `plan_chunk_ranges()` implementation is outdated; the v1.11 audit verified file size is not currently used.
- Claiming `CHUNK-07` is satisfied because the setting exists is outdated; the runtime never enforces the cap today.

## Open Questions

1. **Should the concurrency cap cover only primary chunk workers or the full chunk lifecycle including secondary tasks?**
   - What we know: `ImportChunk.status` remains `PROCESSING` through Phase 63 secondary work, but the audit gap is specifically about parent fan-out of `process_import_chunk`.
   - What's unclear: Whether the team wants conservative whole-lifecycle throttling or faster primary-worker refill.
   - Recommendation: Cap primary chunk worker fan-out only, and let each finished primary worker promote one successor immediately after handing off its secondary tasks.

2. **Should the byte-budget heuristic be configurable now?**
   - What we know: The phase success criteria require file-size-aware planning, not a new setting.
   - What's unclear: Whether tuning pressure is high enough to justify a new `import_chunk_target_bytes` config surface.
   - Recommendation: Start with an internal constant and explicit tests; add a setting only if production tuning becomes necessary.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | Python commands and tests | ✓ | 0.8.14 | None |
| `pytest` via `uv run pytest` | Unit/integration verification | ✓ | 9.0.2 | None |
| Docker | Bringing up DB/MinIO for integration execution | ✓ | 29.3.1 | Use unit-only verification if services stay down |
| Docker Compose | Local service stack | ✓ | v5.1.1 | None |
| PostgreSQL on `localhost:5433` | Integration tests that need the app DB | ✗ | — | Start `docker compose up -d` first |

**Missing dependencies with no fallback:**
- None for research/planning.

**Missing dependencies with fallback:**
- Live PostgreSQL is not currently running on `localhost:5433`; unit tests and static verification are still available, but integration execution will need the compose stack started.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest 9.0.2` + `pytest-asyncio 1.3.0` |
| Config file | [`pyproject.toml`](/home/kwhatcher/projects/civicpulse/run-api/pyproject.toml) |
| Quick run command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x` |
| Full suite command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHUNK-06 | Chunk planner changes ranges when file size changes, while still honoring bind-limit clamps | unit | `uv run pytest tests/unit/test_import_service.py -x` | ✅ |
| CHUNK-07 | Parent defers only capped initial chunks and workers promote later pending chunks without exceeding cap | unit + integration | `uv run pytest tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x` | ✅ |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x`
- **Per wave merge:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Extend [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) with file-size-sensitive chunk-planning assertions, including same-row-count/different-size cases.
- [ ] Extend [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py) with capped initial fan-out assertions and successor-promotion assertions.
- [ ] Extend [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py) to prove end-to-end rolling-window chunk execution under a cap.
- [ ] Add verification/traceability updates for Phase 65 so `CHUNK-06` and `CHUNK-07` move from partial/unsatisfied to satisfied in planning artifacts.

## Sources

### Primary (HIGH confidence)
- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py) - current eager fan-out behavior, chunk worker lifecycle, and successor-launch seam
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py) - current bind-limit-only chunk planning and shared import engine
- [`app/services/storage.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/storage.py) - existing storage abstraction, currently missing object metadata lookup
- [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py) - current parent orchestration unit coverage
- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) - current chunk helper coverage
- [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py) - current integration shape for chunk execution
- [`/.planning/v1.11-MILESTONE-AUDIT.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/v1.11-MILESTONE-AUDIT.md) - audit evidence for `CHUNK-06`, `CHUNK-07`, `INT-01`, `INT-02`, `FLOW-02`, and `FLOW-03`

### Secondary (MEDIUM confidence)
- https://docs.aws.amazon.com/boto3/latest/reference/services/s3/client/head_object.html - confirms `head_object` retrieves object metadata including `ContentLength`
- https://docs.python.org/3/library/asyncio-sync.html#asyncio.Semaphore - reference pattern for bounded async concurrency primitives

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new library choice is required; versions were verified from the local environment and current repo.
- Architecture: HIGH - Recommendations are direct consequences of the inspected code paths and the v1.11 audit evidence.
- Pitfalls: HIGH - Each pitfall maps to a concrete failure mode already present or strongly implied by the current lifecycle.

**Research date:** 2026-04-03
**Valid until:** 2026-05-03
