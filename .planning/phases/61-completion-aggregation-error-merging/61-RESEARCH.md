# Phase 61: Completion Aggregation & Error Merging - Research

**Researched:** 2026-04-03
**Domain:** Chunked import fan-in, exactly-once finalization, and merged error artifact generation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Final outcome policy
- **D-01:** The parent import transitions to `COMPLETED_WITH_ERRORS` when at least one chunk succeeds and at least one chunk fails.
- **D-02:** If all chunks fail, the parent import transitions to `FAILED`, not `COMPLETED_WITH_ERRORS`.
- **D-03:** The parent import remains `PROCESSING` until the finalization path runs exactly once and assigns the terminal outcome.
- **D-04:** Finalization should write one parent-level summary error message while keeping detailed row-level evidence in the merged error artifact.

### Aggregation and finalizer ownership
- **D-05:** Parent `imported_rows`, `skipped_rows`, and `phones_created` must be recomputed from SQL `SUM()` over chunk records instead of incrementally updated by chunk workers.
- **D-06:** Any chunk may detect eligibility for finalization, but only one finalizer may proceed behind a PostgreSQL advisory lock.
- **D-07:** Finalization becomes eligible only after all chunks are in terminal states, using the terminal set appropriate to the current implementation rather than a hard-coded success-only rule.
- **D-08:** Error merging happens only inside the locked finalization path after all chunks are terminal.

### Error merge shape
- **D-09:** The merged parent error artifact should stay in the existing CSV row-level format users already understand.
- **D-10:** Chunk-origin metadata may be added only when needed for debugging, but chunk structure remains an internal detail rather than a user-facing contract.
- **D-11:** Only chunk error rows contribute to the merged file; successful chunks add nothing.
- **D-12:** If merged-error generation fails, finalization should fail explicitly rather than silently reporting success with an untrustworthy artifact.
- **D-13:** Parent-level error detail should stay minimal: one merged artifact plus one summary message.

### Carry-forward constraints
- **D-14:** Phase 60’s chunk-worker contract remains intact: chunk workers write chunk-local progress only and do not directly aggregate or finalize the parent import.
- **D-15:** Phase 61 must not pull forward cancellation propagation, per-chunk crash resume, cross-chunk deadlock handling, or secondary-work offloading from Phases 62-63.

### the agent's Discretion
- Exact SQL query shape for aggregation and terminal-state detection, as long as the source of truth is chunk rows and the result is deterministic.
- Exact advisory-lock keying for parent finalization, as long as it guarantees exactly-once finalization per import.
- Exact parent summary-message wording and CSV merge implementation details, as long as they preserve the locked outcome semantics above.

### Deferred Ideas (OUT OF SCOPE)
- Cancellation propagation to queued/in-flight chunks — Phase 62.
- Per-chunk crash resume and deadlock prevention — Phase 62.
- Secondary work offloading for phones/geometry — Phase 63.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROG-01 | Parent job's imported_rows, skipped_rows, and phones_created are aggregated from chunk records via SQL SUM | Add a parent-finalization query over `ImportChunk` rows and persist only the aggregate result on `ImportJob`; add missing `ImportChunk.phones_created` first |
| PROG-02 | Last completing chunk triggers finalization (error report merge, parent status) guarded by advisory lock | Let every chunk call a shared `maybe_finalize_chunked_import()` helper after reaching a terminal state; guard finalization with a PostgreSQL transaction-level advisory lock |
| PROG-03 | Error reports from individual chunks are merged into a single downloadable file on finalization | Reuse the existing CSV merge pattern, but merge `chunk.error_report_key` files into the parent `error_report_key` only inside the locked finalizer |
| PROG-05 | COMPLETED_WITH_ERRORS status distinguishes partial chunk failures from full success or full failure | Add `COMPLETED_WITH_ERRORS` to the import status model and terminal-status decision tree; widen the DB column because the current `VARCHAR(20)` is too short |
</phase_requirements>

## Summary

Phase 61 should be implemented as a fan-in finalization layer on top of the Phase 60 chunk contract, not as a rewrite of chunk execution. The current code already has the right boundaries: chunk workers persist chunk-local counters and chunk-local merged error CSVs, while the parent `ImportJob` remains the only user-facing surface. The missing work is a deterministic parent finalizer that runs once after all chunks are terminal, aggregates counters from the database, merges chunk error artifacts, and writes the final parent status.

Three codebase facts materially affect planning. First, `ImportChunk` does not currently store `phones_created`, so `PROG-01` cannot be satisfied without a schema/model/service change. Second, `COMPLETED_WITH_ERRORS` is 21 characters, but `import_jobs.status` was created as `VARCHAR(20)` in Alembic, so the phase needs a migration even though the ORM enum uses `native_enum=False`. Third, serial imports still finalize inside `ImportService.process_import_range()`, while chunked imports stop at chunk completion; the clean move is to extract shared parent-finalization helpers into `ImportService` and invoke them from chunk workers after they commit terminal chunk state.

The advisory-lock choice should differ from the long-lived import-owner lock used in `process_import()` and recovery. PostgreSQL documents that transaction-level advisory locks are automatically released at transaction end and are generally the more convenient fit for short critical sections. That matches Phase 61’s locked finalization path better than the current session-level ownership lock. Use a dedicated finalizer lock key per parent import, run aggregation and artifact merge inside that lock, and make the finalizer idempotent by exiting immediately if the parent is already terminal.

**Primary recommendation:** Add a shared `maybe_finalize_chunked_import()` service helper that, under a transaction-scoped advisory lock, re-queries chunk state, aggregates SQL `SUM()` counters, merges chunk error CSVs, and sets the parent terminal status exactly once.

## Project Constraints (from CLAUDE.md)

- Use `uv` for Python commands and package management.
- Run tests with `uv run pytest`.
- Preserve the established stack: FastAPI, async SQLAlchemy, PostgreSQL/PostGIS, MinIO, Procrastinate.
- Respect multi-tenant RLS isolation at every DB access point.
- Keep changes inside the existing project structure and conventions.
- Use the existing Docker Compose services for local integration validation when needed.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | `>=3.13` | Worker/runtime baseline | Project runtime in `pyproject.toml`; no version change needed for this phase |
| PostgreSQL | `17.x` docs current | Aggregation query execution and advisory locks | Parent finalization is fundamentally DB-coordinated and advisory locks are a native Postgres feature |
| SQLAlchemy async | `>=2.0.48` | Aggregate query and ORM persistence | Existing async ORM/session layer already owns import persistence |
| Procrastinate | `>=3.7.3` | Parent task and chunk worker orchestration | Existing durable queue remains the execution model |
| aioboto3 | `>=15.5.0` | Error artifact download/upload in MinIO/S3 | Existing storage path already streams import files and writes CSV artifacts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | `>=9.0.2` | Unit and integration validation | Use for all phase verification and concurrency-shape tests |
| `csv` stdlib | stdlib | Preserve existing row-level CSV format during merge | Use when merging chunk error reports into one parent file |
| PostgreSQL advisory locks | built-in | Exactly-once finalizer ownership | Use only around the short finalization critical section |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL `SUM()` on chunk rows | Incremental parent counter writes from each chunk | Simpler to sketch, but violates D-05 and creates race-prone parent state |
| Transaction-level advisory lock for finalization | Session-level advisory lock reused from import ownership | Reuses existing helper, but is a worse fit for a short critical section and needs explicit unlock discipline |
| Merge `chunk.error_report_key` files | Re-open raw batch-level chunk prefixes | More I/O and more coupling to chunk internals for no user benefit |

**Installation:** None. Phase 61 should use the existing repository stack.

**Version verification:**
- SQLAlchemy 2.0 docs list `2.0.48` as the current release dated March 2, 2026.
- aioboto3 PyPI lists `15.5.0` released October 30, 2025.
- pytest PyPI lists `9.0.2` released December 6, 2025.
- Project minimum versions in `pyproject.toml` already match these recommendations; this phase should not spend scope on dependency upgrades.

## Architecture Patterns

### Recommended Project Structure

```text
app/
├── tasks/
│   └── import_task.py        # chunk completion hook to maybe finalize parent
├── services/
│   └── import_service.py     # aggregate query, merge helper, status decision
├── services/
│   └── import_recovery.py    # finalizer lock helper if shared here
├── models/
│   └── import_job.py         # new parent status + chunk phones_created
└── api/v1/
    └── imports.py            # existing parent response surface, likely unchanged
alembic/
└── versions/                 # migration for status length + chunk phones_created
tests/
├── unit/
│   ├── test_import_service.py
│   └── test_import_task.py
└── integration/
    └── test_import_parallel_processing.py
```

### Pattern 1: Shared Parent Finalizer
**What:** Move chunked-parent fan-in logic into a service helper instead of embedding it in task code.

**When to use:** Every time a chunk transitions to a terminal state.

**Recommended seam:**
- `aggregate_chunk_totals(session, import_job_id) -> AggregatedChunkTotals`
- `determine_chunked_parent_status(chunk_statuses) -> ImportStatus`
- `merge_chunk_error_reports(storage, chunk_error_keys, job, import_job_id) -> None`
- `maybe_finalize_chunked_import(session, storage, job, campaign_id) -> bool`

**Why:** The current serial finalization already lives in `ImportService`. Chunked finalization should also live there so serial and chunked terminal semantics do not drift.

**Example:**
```python
# Source: repo seam in app/tasks/import_task.py and app/services/import_service.py
async def maybe_finalize_chunked_import(
    self,
    *,
    session: AsyncSession,
    storage: StorageService,
    job: ImportJob,
    campaign_id: str,
) -> bool:
    if job.status in TERMINAL_IMPORT_STATUSES:
        return False

    if not await try_claim_finalization_lock(session, job.id):
        return False

    await session.refresh(job)
    if job.status in TERMINAL_IMPORT_STATUSES:
        return False

    summary = await self.aggregate_chunk_summary(session, job.id)
    if summary.terminal_chunks != summary.total_chunks:
        return False

    job.imported_rows = summary.imported_rows
    job.skipped_rows = summary.skipped_rows
    job.phones_created = summary.phones_created
    await self.finalize_chunked_error_outputs(storage, session, job, summary)
    job.status = self.determine_parent_status(summary)
    job.error_message = self.build_parent_summary_message(summary)
    self._mark_progress(job)
    await commit_and_restore_rls(session, campaign_id)
    return True
```

### Pattern 2: Transaction-Scoped Finalizer Lock
**What:** Use a PostgreSQL transaction-level advisory lock for the short finalization section.

**When to use:** Only while checking terminal eligibility, aggregating chunks, merging artifacts, and setting final parent status.

**Why:** PostgreSQL documents that transaction-level advisory locks auto-release at transaction end and are the convenient choice for short-lived usage. The current session-level lock in `import_recovery.py` is appropriate for long-running import ownership, not for a brief fan-in critical section.

**Example:**
```python
# Source: PostgreSQL advisory lock docs + existing advisory_lock_key() helper pattern
async def try_claim_finalization_lock(
    session: AsyncSession,
    import_job_id: uuid.UUID,
) -> bool:
    result = await session.execute(
        text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
        {"lock_key": finalization_lock_key(import_job_id)},
    )
    return bool(result.scalar())
```

### Pattern 3: Aggregate From the Database, Not In-Memory State
**What:** Recompute parent counters from `ImportChunk` rows with one aggregate query under the finalizer lock.

**When to use:** Inside finalization only.

**Why:** SQLAlchemy exposes `func.sum()` and `func.coalesce()`, and the phase decision explicitly requires chunk rows to be the source of truth.

**Recommended query shape:**
- `coalesce(sum(imported_rows), 0)`
- `coalesce(sum(skipped_rows), 0)`
- `coalesce(sum(phones_created), 0)`
- counts of terminal, completed, failed, cancelled chunks
- array/list of non-null `error_report_key` values for merge input

### Pattern 4: Merge Chunk-Level Artifacts, Not Raw Batch Files
**What:** Parent merge should consume the already-merged `chunk.error_report_key` CSVs produced by Phase 60.

**When to use:** After confirming all chunks are terminal and while holding the finalizer lock.

**Why:** `ImportService._merge_error_files()` already implements the correct user-facing CSV behavior: first header kept, later headers skipped. Reusing that behavior at the chunk-file layer minimizes new logic and keeps the CSV contract stable.

### Anti-Patterns to Avoid
- **Child writes directly to parent counters or parent status:** Violates D-05/D-14 and recreates race conditions.
- **Finalization outside the advisory lock:** Two chunks can observe “all terminal” concurrently and both write parent state.
- **Using `COMPLETED_WITH_ERRORS` without a DB migration:** The existing `import_jobs.status` column is `VARCHAR(20)` and the new status string is longer.
- **Deriving `phones_created` from the parent only:** `ImportChunk` currently does not persist this counter, so parent SQL aggregation would be incomplete.
- **Merging errors before all chunks are terminal:** A late-failing chunk would make the parent artifact incomplete and untrustworthy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exactly-once finalization | In-memory flags or queue ordering assumptions | PostgreSQL advisory lock + terminal-state recheck | Worker scheduling is nondeterministic; DB lock is the durable arbiter |
| Parent counter reconciliation | Per-chunk parent increments | SQL `SUM()` over `ImportChunk` | Deterministic and race-resistant |
| Parent error artifact format | New JSON/ZIP error bundle | Existing CSV merge behavior | Users already understand the CSV contract |
| Chunk error discovery | Bucket-prefix scans | Persisted `chunk.error_report_key` values | Avoids storage listing complexity and keeps DB as source of truth |
| Status fan-in rules | Ad hoc nested `if` logic in task code | Small dedicated status-decision helper | Easier to test and prevents terminal-state drift |

**Key insight:** Phase 60 already created the right intermediate state. Phase 61 should consume that durable state, not add another coordination layer.

## Common Pitfalls

### Pitfall 1: Missing `phones_created` on `ImportChunk`
**What goes wrong:** Parent `phones_created` cannot be recomputed via SQL `SUM()` because chunk rows do not store it.

**Why it happens:** Phase 60 intentionally kept `phones_created` parent-only.

**How to avoid:** Add `phones_created` to `ImportChunk`, update chunk processing to persist it, and include it in the aggregate query and tests.

**Warning signs:** Parent totals look correct for imported/skipped rows but stay `0` or stale for phones.

### Pitfall 2: New status value exceeds DB column length
**What goes wrong:** `COMPLETED_WITH_ERRORS` is truncated or rejected because `import_jobs.status` was created as `VARCHAR(20)`.

**Why it happens:** The original migration predates this status value.

**How to avoid:** Include an Alembic migration to widen `import_jobs.status` before using the new terminal state.

**Warning signs:** DB write errors or silent schema drift during finalization tests.

### Pitfall 3: Double finalization after concurrent chunk completion
**What goes wrong:** Two chunk workers both see “all chunks terminal” and both merge/upload parent artifacts.

**Why it happens:** Eligibility is checked without a finalizer lock or without a second recheck after the lock is acquired.

**How to avoid:** Claim the finalizer lock, then re-query the parent and chunk summary inside the lock before writing anything.

**Warning signs:** Duplicate upload/delete calls or flaky concurrent tests.

### Pitfall 4: Treating chunk failure as parent failure too early
**What goes wrong:** The first failed chunk marks the parent `FAILED`, hiding successful work from other chunks.

**Why it happens:** Serial-path assumptions leak into chunked execution.

**How to avoid:** Keep the parent `PROCESSING` until the locked finalizer computes the terminal outcome from all chunk states.

**Warning signs:** Parent `FAILED` while some chunks are still `PROCESSING` or later finish successfully.

### Pitfall 5: Re-merging raw batch files instead of chunk outputs
**What goes wrong:** Parent merge becomes storage-heavy, order-sensitive, and coupled to chunk internals.

**Why it happens:** The code already has `_merge_error_files()`, and it is easy to reach for raw prefixes.

**How to avoid:** Merge only the persisted `chunk.error_report_key` files.

**Warning signs:** Finalizer needs to list MinIO prefixes or reconstruct per-batch ordering.

## Code Examples

Verified patterns from official sources and current repo seams:

### SQL Aggregate for Parent Fan-In
```python
# Source: SQLAlchemy generic function docs + current async ORM usage in repo
stmt = select(
    func.coalesce(func.sum(ImportChunk.imported_rows), 0).label("imported_rows"),
    func.coalesce(func.sum(ImportChunk.skipped_rows), 0).label("skipped_rows"),
    func.coalesce(func.sum(ImportChunk.phones_created), 0).label("phones_created"),
    func.count().label("total_chunks"),
    func.sum(
        case((ImportChunk.status == ImportChunkStatus.COMPLETED, 1), else_=0)
    ).label("completed_chunks"),
    func.sum(
        case((ImportChunk.status == ImportChunkStatus.FAILED, 1), else_=0)
    ).label("failed_chunks"),
).where(ImportChunk.import_job_id == job.id)

summary = (await session.execute(stmt)).one()
```

### Parent Status Decision
```python
# Source: Phase 61 locked decisions in 61-CONTEXT.md
def determine_parent_status(summary: AggregatedChunkSummary) -> ImportStatus:
    if summary.completed_chunks and summary.failed_chunks:
        return ImportStatus.COMPLETED_WITH_ERRORS
    if summary.failed_chunks == summary.total_chunks:
        return ImportStatus.FAILED
    return ImportStatus.COMPLETED
```

### CSV Merge Reuse at Parent Level
```python
# Source: existing _merge_error_files() behavior in app/services/import_service.py
chunk_error_keys = sorted(key for key in summary.error_report_keys if key)
if chunk_error_keys:
    await self._merge_error_files(storage, chunk_error_keys, job, str(job.id))
else:
    job.error_report_key = None
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Serial import finalizes inline after source exhaustion | Chunked import should finalize via a separate fan-in path after all chunks are terminal | Phase 60 introduced chunk-local completion; Phase 61 must complete the design | Keeps chunk execution parallel while still presenting one parent outcome |
| Long-held session advisory lock for import ownership | Short-lived transaction advisory lock for finalizer critical section | PostgreSQL current docs; recommended now for this phase | Reduces unlock bookkeeping and narrows the exactly-once critical section |
| Parent batch-error merge during serial processing | Parent merge of already-merged chunk CSVs during chunked finalization | Phase 61 | Preserves user-facing CSV format without exposing chunk internals |

**Deprecated/outdated:**
- Treating parent counters as mutable during chunk execution: superseded by SQL aggregation from chunk rows.
- Using the current `import_jobs.status` width as-is: incompatible with `COMPLETED_WITH_ERRORS`.

## Open Questions

1. **Should the finalizer reuse the existing import lock key or use a dedicated finalization namespace?**
   - What we know: Phase 61 requires advisory-lock finalization, and the repo already hashes import UUIDs into a bigint lock key.
   - What's unclear: Whether the team wants finalization to share lock identity with recovery/ownership or be isolated.
   - Recommendation: Use a dedicated finalizer key or namespaced derivation so long-lived import ownership and short-lived finalization remain distinct.

2. **Should parent `error_message` mention the exact chunk counts, or stay generic?**
   - What we know: D-04 and D-13 require one parent summary message plus the merged artifact.
   - What's unclear: The preferred level of user-facing detail in the summary line.
   - Recommendation: Keep it concise, e.g. “Import completed with errors. Download the error report for details.” Add counts only if product wants them exposed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | Python commands and tests | ✓ | `0.8.14` | — |
| Docker Compose | Local integration validation with app/worker/Postgres/MinIO | ✓ | Docker `29.3.1` | Mocked unit tests only |
| PostgreSQL service | Advisory locks and aggregate queries | ✓ | container `postgis/postgis:17-3.5` running | No real fallback |
| MinIO service | Error artifact merge/download/upload | ✓ | container `RELEASE.2025-09-07T16-13-09Z` running | Mock storage in unit tests |
| Worker service | End-to-end chunk/finalizer behavior | ✓ | `run-api-worker` running | Direct task invocation in tests |
| `pytest` CLI | Test runner | ✗ | — | `uv run pytest` |
| `psql` host CLI | Ad hoc DB inspection | ✓ | `14.22` | `docker compose exec postgres psql` against PG 17 |

**Missing dependencies with no fallback:**
- None for planning. Real implementation validation still depends on the running Postgres and MinIO containers already present.

**Missing dependencies with fallback:**
- Plain `pytest` is not installed globally; use `uv run pytest`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest `9.0.2` + pytest-asyncio |
| Config file | [`pyproject.toml`](/home/kwhatcher/projects/civicpulse/run-api/pyproject.toml) |
| Quick run command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x` |
| Full suite command | `uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROG-01 | Parent counters equal SQL sums across terminal chunks, including `phones_created` | unit + integration | `uv run pytest tests/unit/test_import_service.py tests/integration/test_import_parallel_processing.py -x` | ✅ |
| PROG-02 | Multiple terminal chunk completions race safely and finalization runs once | unit + integration | `uv run pytest tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x` | ✅ |
| PROG-03 | Parent merged error CSV combines chunk artifacts and fails loudly on merge/upload failure | unit | `uv run pytest tests/unit/test_import_service.py -x` | ✅ |
| PROG-05 | Mixed chunk success/failure becomes `COMPLETED_WITH_ERRORS`; all failed becomes `FAILED` | unit | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x` | ✅ |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x`
- **Per wave merge:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x`
- **Phase gate:** `uv run pytest`

### Wave 0 Gaps
- None in framework or file layout. Existing test infrastructure is sufficient.
- Add new cases to [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) for aggregate query output, parent merge behavior, merge-failure handling, and status decision rules.
- Add new cases to [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py) for “last chunk triggers maybe-finalize” and “losing lock exits cleanly”.
- Extend [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py) with a concurrent chunk-completion/finalization-once assertion.

## Sources

### Primary (HIGH confidence)
- Phase context and locked decisions: [`61-CONTEXT.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/phases/61-completion-aggregation-error-merging/61-CONTEXT.md)
- Prior phase implementation boundary: [`60-RESEARCH.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/phases/60-parent-split-parallel-processing/60-RESEARCH.md), [`60-VERIFICATION.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/phases/60-parent-split-parallel-processing/60-VERIFICATION.md)
- Current code seams: [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py), [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py), [`app/models/import_job.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py), [`app/services/import_recovery.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_recovery.py), [`app/api/v1/imports.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/imports.py)
- PostgreSQL advisory lock docs: https://www.postgresql.org/docs/17/explicit-locking.html
- SQLAlchemy function docs (`func`, `coalesce`, `sum`): https://docs.sqlalchemy.org/en/20/core/functions.html

### Secondary (MEDIUM confidence)
- SQLAlchemy 2.0 release page confirming current release metadata: https://docs.sqlalchemy.org/en/20/
- PyPI package metadata for aioboto3: https://pypi.org/project/aioboto3/
- PyPI package metadata for pytest: https://pypi.org/project/pytest/

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions come from the repo baseline plus official docs/PyPI metadata; no speculative library switch is recommended.
- Architecture: HIGH - the current codebase seams and locked phase decisions point to one clear finalization design.
- Pitfalls: HIGH - each listed pitfall is directly grounded in the current code/migrations, especially the missing `phones_created` chunk field and the `VARCHAR(20)` status column.

**Research date:** 2026-04-03
**Valid until:** 2026-05-03
