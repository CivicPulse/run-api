# Phase 59: Chunk Schema & Configuration - Research

**Researched:** 2026-04-03
**Domain:** Import pipeline schema/config foundation for future chunked processing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### ImportChunk data model
- **D-01:** `ImportChunk` is an internal child record attached to the parent `ImportJob`, not a user-facing import entity.
- **D-02:** Each chunk record should track row range, lifecycle status, counters, `last_committed_row`, `error_report_key`, and timestamps needed for later aggregation and crash-resume behavior.
- **D-03:** Parent `ImportJob` remains the only API/UI status surface in this phase; chunk details stay implementation-only.

### Serial bypass policy
- **D-04:** Files below a configurable row threshold must stay on the existing serial import path by default.
- **D-05:** The serial bypass should be conservative so chunk orchestration is introduced only where it is likely to improve a materially large import.

### Chunk sizing strategy
- **D-06:** Chunk sizing should reuse the existing bind-limit-aware sizing logic instead of inventing a separate formula from scratch.
- **D-07:** Phase 59 should establish a deterministic chunk sizing function that starts from a default chunk target and clamps it using mapped-column count and total file size.

### Per-import chunk concurrency
- **D-08:** Maximum concurrent chunks per import should be configurable in application settings.
- **D-09:** The default concurrency cap should be intentionally low to avoid worker starvation until real throughput data justifies raising it.

### Carry-forward constraints
- **D-10:** This phase must preserve the current serial import behavior, including per-batch commits, RLS restoration, and resume semantics on the parent import path.
- **D-11:** Chunk-level execution, progress aggregation, error merge/finalization, cancellation propagation, and secondary-work offloading are deferred to Phases 60-64.

### the agent's Discretion
- Exact table/enum field names for `ImportChunk`, as long as they align with existing model and migration conventions.
- Exact settings names for chunk threshold, default chunk size, and max concurrent chunks, as long as they fit the current `Settings` pattern cleanly.
- Whether chunk status uses the same enum values as `ImportJob` or a closely related dedicated enum, as long as later phases can express partial completion and failure cleanly.

### Deferred Ideas (OUT OF SCOPE)
- Parent CSV pre-scan and child task fan-out belong to Phase 60.
- Parent progress aggregation, merged error reports, and `COMPLETED_WITH_ERRORS` belong to Phase 61.
- Chunk-level failure isolation, cancellation propagation, per-chunk resume, and deadlock prevention belong to Phase 62.
- VoterPhone creation and geometry/derived updates moving off the critical path belong to Phase 63.
- Throughput/ETA UI remains Phase 64 work.
- Fixing the stale GSD phase resolver so Phase 59 resolves to the active v1.11 phase instead of archived v1.7 planning should be handled separately from this feature phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHUNK-01 | System splits a CSV import into ImportChunk records with row ranges and tracks per-chunk status | Add `ImportChunk` ORM + Alembic table now, but keep it internal and unfan-out until Phase 60 |
| CHUNK-05 | Files under a configurable row threshold bypass chunking and run the existing serial path | Add settings plus a pure routing helper that defaults to serial when row count is unknown |
| CHUNK-06 | Chunk size adapts based on column count (asyncpg bind-parameter limit) and file size | Extract/reuse current bind-limit math from `ImportService.process_import_file()` into a chunk sizing helper |
| CHUNK-07 | Max concurrent chunks per import is configurable (default capped to prevent worker starvation) | Add settings only in this phase; actual concurrent execution remains deferred |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Use `uv` for Python package and script execution.
- Python runtime is 3.13+.
- Backend stack is FastAPI + async SQLAlchemy + PostgreSQL/PostGIS.
- Follow Ruff style with 88-char lines.
- Test command is `uv run pytest`.
- Preserve PostgreSQL RLS isolation patterns.
- Existing import flow is background Procrastinate work; API/UI must stay parent-job based.

## Summary

Phase 59 should be treated as a schema-and-seams phase, not a behavior phase. The codebase already has the core ingredients you need: `ImportJob` is the durable parent record, `ImportService.process_import_file()` already computes a safe effective batch size from mapped-column count, RLS conventions are stable across migrations, and the API/task layer already exposes exactly one user-facing import job. The correct plan is to add chunk state and configuration without changing the current serial execution path for any existing import.

The main implementation choice that matters for later phases is to make `ImportChunk` look like a durable sibling to the existing parent import state, not like a temporary queue artifact. That means a real ORM model, an Alembic migration with direct `campaign_id` RLS, and fields that support later progress aggregation and resume without another schema rethink. At the same time, the code should not start chunk fan-out yet. Introduce pure helpers now: one for chunk sizing and one for deciding whether an import stays serial. Both helpers should be callable from future split logic, but in Phase 59 they should preserve today's behavior.

**Primary recommendation:** Add an internal `ImportChunk` table plus pure chunk sizing/routing helpers, but keep `process_import` on the existing serial path unless and until Phase 60 supplies a trusted total-row count for chunk fan-out.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.135.3 | Import API endpoints and response models | Existing API surface already owns import initiation, confirm, cancel, and status polling |
| SQLAlchemy | 2.0.48 | Async ORM models and query layer | Existing import models, sessions, and migration autoload conventions already depend on it |
| Alembic | 1.18.4 | Schema migration for new `import_chunks` table | Existing schema changes are migration-driven and include manual RLS SQL |
| asyncpg | 0.31.0 | PostgreSQL driver enforcing bind-parameter ceiling | Current batch-size math already targets this limit and should be reused |
| Procrastinate | 3.7.3 | Background import task execution | Existing serial import already runs here; Phase 59 must preserve that path |
| pydantic-settings | 2.13.1 | Environment-backed application settings | Current import configuration already lives in `app/core/config.py` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | 9.0.2 | Unit and integration verification | For helper behavior, model registration, and routing regressions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `campaign_id` on `ImportChunk` | RLS via subquery through `import_job_id` | Saves one column but breaks the project's standard direct-table RLS pattern and complicates policy/indexing |
| Dedicated `ImportChunk` model now | Delay schema until Phase 60 | Pushes planning debt forward and forces behavior work plus migration work into one phase |
| Shared `ImportStatus` enum | Dedicated `ImportChunkStatus` enum | A dedicated chunk enum is slightly more code now but avoids parent-status coupling later |

**Installation:**
```bash
# No new packages recommended for Phase 59.
```

**Version verification:** No new dependency adoption is recommended. The versions above were verified from the project environment on 2026-04-03 using `uv run python` imports.

## Architecture Patterns

### Recommended Project Structure

```text
app/
├── core/config.py             # add chunk settings
├── models/import_job.py       # add ImportChunk + chunk status enum
├── services/import_service.py # extract chunk sizing + serial routing helpers
└── tasks/import_task.py       # call routing helper but preserve serial behavior

alembic/versions/
└── <new_revision>_import_chunks.py  # table, indexes, RLS policy, grants

tests/
├── unit/
│   ├── test_import_service.py       # chunk math + serial bypass helper
│   ├── test_import_task.py          # task routing stays serial
│   └── test_model_coverage.py       # model import registration catches new model
└── integration/
    └── test_voter_rls.py or new import chunk RLS test
```

### Pattern 1: Internal Child Record With Direct RLS

**What:** `ImportChunk` should be a durable child of `ImportJob`, with its own `campaign_id` and `import_job_id`.

**When to use:** Immediately in Phase 59.

**Why:** The codebase's migration pattern prefers direct `campaign_id` RLS for campaign-scoped tables. That keeps policy SQL simple and avoids subquery-only visibility for a core operational table.

**Recommended shape:**

```python
class ImportChunkStatus(enum.StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ImportChunk(Base):
    __tablename__ = "import_chunks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id"), nullable=False)
    import_job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_jobs.id"), nullable=False)
    row_start: Mapped[int] = mapped_column(nullable=False)
    row_end: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[ImportChunkStatus] = mapped_column(
        Enum(ImportChunkStatus, name="import_chunk_status", native_enum=False),
        default=ImportChunkStatus.PENDING,
    )
    imported_rows: Mapped[int | None] = mapped_column(default=0)
    skipped_rows: Mapped[int | None] = mapped_column(default=0)
    last_committed_row: Mapped[int | None] = mapped_column(default=0)
    error_report_key: Mapped[str | None] = mapped_column(String(500))
    error_message: Mapped[str | None] = mapped_column()
    last_progress_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
```

**Example:**
```python
# Source: /home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py
# Pattern adapted to match existing ImportJob enum + mapped_column style.
```

### Pattern 2: Extract Bind-Limit Math Into a Reusable Helper

**What:** Move the current effective-batch-size calculation into a pure helper and build chunk sizing on top of it.

**When to use:** In Phase 59 before any chunk fan-out exists.

**Why:** The current logic already encodes the real constraint: bind parameters scale with mapped columns. Phase 59 should reuse that exact ceiling for chunk boundaries.

**Recommended helper contract:**

```python
def calculate_effective_rows_per_write(
    mapped_column_count: int,
    target_rows: int,
    max_bind_params: int = 32_767,
    extra_columns_per_row: int = 4,
) -> int:
    cols_per_row = max(mapped_column_count + extra_columns_per_row, 1)
    return max(1, min(target_rows, max_bind_params // cols_per_row))


def plan_chunk_ranges(
    total_rows: int,
    mapped_column_count: int,
    chunk_size_default: int,
) -> list[tuple[int, int]]:
    chunk_rows = calculate_effective_rows_per_write(
        mapped_column_count=mapped_column_count,
        target_rows=chunk_size_default,
    )
    return [
        (start, min(start + chunk_rows - 1, total_rows))
        for start in range(1, total_rows + 1, chunk_rows)
    ]
```

**Important inference:** Because `ImportService.process_import_file()` currently uses mapped-column count, not raw CSV column count, chunk sizing should do the same. Using raw header width would underutilize chunk size for sparsely mapped files.

### Pattern 3: Routing Helper That Defaults to Serial

**What:** Add a pure decision helper such as `should_use_serial_import(total_rows, serial_threshold)`.

**When to use:** Now, even before row pre-scan exists.

**Why:** Phase 59 needs the seam, but Phase 60 owns deterministic row counting. The safe rule for Phase 59 is: if row count is unknown, stay serial.

**Recommended behavior:**

```python
def should_use_serial_import(
    total_rows: int | None,
    serial_threshold: int,
) -> bool:
    if total_rows is None:
        return True
    return total_rows <= serial_threshold
```

**Placement:** Call this from the task/service boundary, not the API surface. `confirm_mapping` should keep dispatching the same parent task and remain unaware of chunk internals.

### Anti-Patterns to Avoid

- **Do not expose chunks in API schemas:** `ImportJobResponse` must remain the only status surface in this phase.
- **Do not branch in `confirm_mapping` based on guessed file size:** row-count-based routing belongs in background processing once trusted metadata exists.
- **Do not invent a second chunk-size formula:** reuse the existing bind-limit math from `ImportService`.
- **Do not omit `app/db/base.py` registration:** the repo has a regression test that fails if the new model file is not imported there.
- **Do not create the table without RLS grants/policy:** every campaign-scoped table in this repo explicitly enables RLS and grants `app_user`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chunk sizing | New heuristic based on CSV byte size alone | Existing mapped-column bind-limit math plus default chunk target | The real hard constraint is PostgreSQL bind count, not file bytes |
| Chunk visibility | New API/schema surface for chunk progress | Keep `ImportJobResponse` as the only response model | Product requirements explicitly keep chunks implementation-only |
| Multi-tenant access control | Ad hoc app-layer filtering for chunk rows | Table-level PostgreSQL RLS with `campaign_id` policy | The rest of the repo already relies on RLS as the enforcement boundary |
| Serial fallback | Duplicated conditionals in API, task, and service layers | One pure routing helper consumed by the background path | Prevents diverging behavior once Phase 60 adds chunk fan-out |

**Key insight:** Phase 59 succeeds by creating extension points, not by simulating chunk orchestration early.

## Common Pitfalls

### Pitfall 1: Following the roadmap field name literally

**What goes wrong:** The success criteria mention `error_key`, but the existing parent model and context use `error_report_key`.
**Why it happens:** Roadmap wording is shorter than the actual code convention.
**How to avoid:** Keep `error_report_key` on `ImportChunk` for consistency with `ImportJob`.
**Warning signs:** New code introduces both `error_key` and `error_report_key`.

### Pitfall 2: Breaking current runtime behavior while adding routing seams

**What goes wrong:** Phase 59 accidentally starts chunk fan-out or changes task dispatch behavior.
**Why it happens:** The planner treats routing helper introduction as permission to change execution flow.
**How to avoid:** Keep `confirm_mapping()` unchanged and make the new helper default to serial when `total_rows` is unknown.
**Warning signs:** `confirm_mapping` starts creating child tasks or `process_import` stops calling `process_import_file()` directly.

### Pitfall 3: Forgetting direct RLS support in the migration

**What goes wrong:** `import_chunks` exists but `app_user` cannot read/write it under normal request/task sessions.
**Why it happens:** The migration creates the table but skips `ENABLE ROW LEVEL SECURITY`, policy creation, or grants.
**How to avoid:** Mirror the pattern used in `002_voter_data_models.py` for direct campaign tables.
**Warning signs:** Integration tests need superuser access to see rows that should be visible through app sessions.

### Pitfall 4: Using header width instead of mapped-column count

**What goes wrong:** Chunk size is smaller than needed for sparse mappings, or later phases over-constrain throughput.
**Why it happens:** It is tempting to count all detected CSV columns.
**How to avoid:** Count only truthy mapped fields, exactly like the current batch-size code.
**Warning signs:** Helper tests use `len(detected_columns)` rather than confirmed mapping width.

### Pitfall 5: Creating the model without base registration

**What goes wrong:** Alembic autoload or model coverage tests miss `ImportChunk`.
**Why it happens:** This repo requires explicit imports in `app/db/base.py`.
**How to avoid:** Add the model definition in an already-imported model module or update `app/db/base.py`.
**Warning signs:** `tests/unit/test_model_coverage.py` fails with a missing import message.

## Code Examples

Verified patterns from the codebase:

### Existing RLS Commit-Restore Pattern

```python
# Source: /home/kwhatcher/projects/civicpulse/run-api/app/db/rls.py
async def commit_and_restore_rls(session: AsyncSession, campaign_id: str) -> None:
    await session.commit()
    await set_campaign_context(session, campaign_id)
```

Use this unchanged for the serial parent path. Chunk execution phases later should mirror it per chunk worker.

### Existing Bind-Limit Batch Math

```python
# Source: /home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py
max_params = 32_767
num_mapped = sum(1 for v in (job.field_mapping or {}).values() if v)
cols_per_row = max(num_mapped + 4, 1)
effective_batch_size = min(
    settings.import_batch_size,
    max_params // cols_per_row,
)
```

Phase 59 should extract this idea into a reusable helper and not change the formula.

### Existing Import Dispatch Surface

```python
# Source: /home/kwhatcher/projects/civicpulse/run-api/app/api/v1/imports.py
await process_import.configure(
    queueing_lock=str(campaign_id),
).defer_async(
    import_job_id=str(import_id),
    campaign_id=str(campaign_id),
)
```

Keep this parent-task dispatch intact in Phase 59.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous import in request path | Background `process_import` Procrastinate task with durable parent state | v1.10 / 2026-04-01 | Parent import state is already durable enough to host chunk children |
| Inline batch sizing only | Reusable chunk sizing helper should be extracted from inline batch math | Phase 59 | Future chunking can share the same throughput safety logic |
| Parent-only import state | Parent + internal child chunk records | Phase 59 | Enables later fan-out without API changes |

**Deprecated/outdated:**
- Treating large-import acceleration as an API concern: the codebase and design docs already chose background orchestration, not a new frontend flow.

## Open Questions

1. **Should `ImportChunk` live in `app/models/import_job.py` or its own file?**
   - What we know: `ImportJob` already lives there, and the phase context allows naming discretion.
   - What's unclear: whether the team prefers keeping import-related models together or isolating chunk state in its own module.
   - Recommendation: Keep `ImportChunk` in `app/models/import_job.py` for Phase 59 to minimize registration churn unless the file becomes unwieldy.

2. **How much future recovery metadata should be added now?**
   - What we know: context D-02 explicitly calls for timestamps needed by later crash-resume behavior.
   - What's unclear: whether Phase 59 should stop at `last_progress_at` or also add orphan/recovery timestamps now.
   - Recommendation: Add `last_progress_at`, `created_at`, and `updated_at` now; defer `orphaned_at`/`recovery_started_at` unless the team wants to avoid another migration in Phase 62.

3. **How should Phase 59 satisfy serial-threshold routing before Phase 60 pre-scan exists?**
   - What we know: row-count-based routing is a requirement, but deterministic row counting is explicitly Phase 60.
   - What's unclear: whether Phase 59 is expected to count rows opportunistically or just add the routing seam.
   - Recommendation: Implement the helper now and make unknown `total_rows` route serial. This preserves the success criterion without inventing a premature pre-scan.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio |
| Config file | `/home/kwhatcher/projects/civicpulse/run-api/pyproject.toml` |
| Quick run command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/unit/test_model_coverage.py -x` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHUNK-01 | `ImportChunk` model exists, is registered, and migration/RLS pattern is correct | unit + integration | `uv run pytest tests/unit/test_model_coverage.py tests/integration/test_voter_rls.py -x` | ✅ extend existing |
| CHUNK-05 | Unknown or low-row-count imports stay on serial path | unit | `uv run pytest tests/unit/test_import_task.py -x` | ✅ extend existing |
| CHUNK-06 | Chunk boundary helper clamps by mapped-column bind limit | unit | `uv run pytest tests/unit/test_import_service.py -x` | ✅ extend existing |
| CHUNK-07 | Chunk settings exist with safe defaults | unit | `uv run pytest tests/unit/test_batch_resilience.py -x` | ✅ extend existing |

### Sampling Rate

- **Per task commit:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/unit/test_model_coverage.py -x`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Add unit coverage for the new chunk sizing helper, including high-column-count edge cases.
- [ ] Add unit coverage for `should_use_serial_import()` with `None`, below-threshold, and above-threshold totals.
- [ ] Add schema/model assertions for `ImportChunkStatus` and `ImportChunk` fields.
- [ ] Add integration coverage that `import_chunks` obeys campaign RLS under app-user sessions.
- [ ] Add migration verification if the team has an Alembic smoke-test pattern available; otherwise review migration SQL manually during implementation.

## Sources

### Primary (HIGH confidence)

- Local codebase: [app/models/import_job.py](/home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py) - parent import schema and enum conventions
- Local codebase: [app/services/import_service.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py) - bind-limit-aware batch sizing and serial import behavior
- Local codebase: [app/tasks/import_task.py](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py) - parent task boundary and status handling
- Local codebase: [app/api/v1/imports.py](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/imports.py) - dispatch surface that must remain unchanged
- Local codebase: [app/core/config.py](/home/kwhatcher/projects/civicpulse/run-api/app/core/config.py) - settings pattern
- Local codebase: [alembic/versions/002_voter_data_models.py](/home/kwhatcher/projects/civicpulse/run-api/alembic/versions/002_voter_data_models.py) - campaign-table RLS policy/grant pattern
- PostgreSQL protocol docs - https://www.postgresql.org/docs/current/protocol-message-formats.html

### Secondary (MEDIUM confidence)

- Local design note: [docs/import-parallelization-options.md](/home/kwhatcher/projects/civicpulse/run-api/docs/import-parallelization-options.md) - rationale for chunked child jobs over alternatives
- Local incident note: [docs/issues/large-voter-import-crash.md](/home/kwhatcher/projects/civicpulse/run-api/docs/issues/large-voter-import-crash.md) - operational motivation for faster imports

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all recommended components already exist in the repo and were version-verified locally
- Architecture: HIGH - recommendations are constrained by current code paths, phase context, and established RLS/task patterns
- Pitfalls: HIGH - all listed pitfalls come directly from current conventions or already-tested failure modes

**Research date:** 2026-04-03
**Valid until:** 2026-05-03
