# Phase 50: Per-Batch Commits & Crash Resilience - Research

**Researched:** 2026-03-28
**Domain:** SQLAlchemy async session transaction management, PostgreSQL RLS with per-batch commits, MinIO per-batch error storage
**Confidence:** HIGH

## Summary

This phase transforms the existing single-transaction import pipeline into a per-batch commit pipeline where each batch of ~1000 rows is independently committed. The core technical challenge is that PostgreSQL `set_config(..., true)` (used for RLS) resets on COMMIT -- this is a well-documented PostgreSQL behavior, not a bug, and it means RLS context must be explicitly restored after every `session.commit()`. The existing codebase already uses `expire_on_commit=False` on the session factory, which means ImportJob attributes remain accessible after commit without requiring a refresh.

The refactoring is concentrated in two files: `app/tasks/import_task.py` (orchestration) and `app/services/import_service.py` (the `process_import_file` method). The existing `process_csv_batch` method needs no changes -- it already returns `(imported_count, errors, phones_created)` and operates within whatever transaction context the caller provides. The schema change is a single column addition (`last_committed_row`) to ImportJob with a straightforward Alembic migration. Error storage shifts from accumulating `all_errors` in memory to per-batch writes to MinIO, with a final merge step.

**Primary recommendation:** Refactor `process_import_file` to commit after each batch, re-set RLS, write per-batch errors to MinIO, and track `last_committed_row`. Add resume logic at the top of the method to skip already-committed rows. Add `IMPORT_BATCH_SIZE` to Settings. The existing `process_csv_batch` stays unchanged.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Add `last_committed_row` (integer, default 0) column to ImportJob -- stores the CSV row offset of the last fully committed batch. On resume, skip that many rows from the CSV and continue.
- **D-02:** Resume is silent -- worker detects PROCESSING status + non-zero `last_committed_row`, skips ahead, and continues. No new ImportStatus value needed. Polling endpoint shows progress incrementing naturally.
- **D-03:** Upsert (INSERT ON CONFLICT DO UPDATE) provides natural idempotency -- if a crash happens mid-batch, the uncommitted batch gets re-processed on resume. `last_committed_row` only increments after successful commit, so no gap is possible.
- **D-04:** Per-batch error files written to MinIO (e.g., `imports/{campaign_id}/{job_id}/errors/batch_001.csv`). Memory freed after each batch write. No in-memory `all_errors` accumulation.
- **D-05:** On import completion, merge per-batch error CSVs into one final `errors.csv`, update `error_report_key`, and clean up batch files. User downloads a single consolidated error report.
- **D-06:** ImportJob counters (`imported_rows`, `skipped_rows`, `total_rows`, `last_committed_row`) are committed with each batch transaction. Polling endpoint sees incremental progress immediately.
- **D-07:** Existing `ImportStatus.PROCESSING` + incrementing `imported_rows` is sufficient for frontend -- no new batch progress fields needed.
- **D-08:** Single long-lived session with commit + RLS re-set per batch. After each batch: `session.commit()` (clears RLS context), then `set_campaign_context(session, campaign_id)` before the next batch. Matches existing import_task.py pattern.
- **D-09:** If a single batch fails (DB constraint error, etc.): rollback that batch, write its rows to the error file, re-set RLS, and continue with the next batch. Import completes with partial success. Already-committed batches are safe.
- **D-10:** Add `last_committed_row` (Integer, nullable, default 0) to ImportJob model and create Alembic migration. `phones_created` column already exists. Combined with existing `imported_rows`/`skipped_rows`/`total_rows`, this is sufficient for full state reconstruction on resume.
- **D-11:** Add `IMPORT_BATCH_SIZE` to Settings (`app/core/config.py`) with default 1000. Configurable per deployment via environment variable. Follows existing Settings pattern.

### Claude's Discretion
- Exact MinIO path structure for per-batch error files
- Error CSV merge implementation details (streaming concatenation vs. in-memory)
- Whether to add structured logging around batch commit/resume events (likely yes)
- Alembic migration naming and sequencing
- Any necessary test fixtures or mocking approach

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESL-01 | Each batch of rows is committed independently so partial progress persists through crashes | Per-batch `session.commit()` in `process_import_file` loop; `expire_on_commit=False` ensures job attributes remain accessible; SQLAlchemy autobegin creates new transaction for next batch |
| RESL-02 | RLS campaign context is re-set after each batch commit to maintain data isolation | PostgreSQL `set_config(..., true)` resets on COMMIT (verified); `set_campaign_context()` must be called after every commit; existing helper at `app/db/rls.py` |
| RESL-03 | On crash or restart, import resumes from the last committed batch instead of starting over | `last_committed_row` column tracks offset; on resume, detect `status=PROCESSING` + `last_committed_row > 0`, skip that many CSV rows; upsert idempotency handles edge cases |
| RESL-04 | Polling endpoint returns real-time committed row counts updated after each batch | `imported_rows`/`skipped_rows`/`total_rows` committed (not flushed) with each batch; polling endpoint reads committed data via separate session; no endpoint changes needed |
| RESL-05 | Error rows are written to MinIO per-batch so memory usage stays constant regardless of error count | Per-batch error CSV uploaded via `StorageService.upload_bytes()`; batch error files merged at completion; new `list_objects` and `delete_objects_by_prefix` methods needed on StorageService |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` (not pip/poetry)
- **Python linting:** `uv run ruff check .` / `uv run ruff format .` before commits
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008)
- **Line length:** 88 chars
- **Tests:** `uv run pytest` with asyncio_mode=auto
- **Git:** Conventional Commits, commit after each task, never push unless asked
- **Python:** Never use system python; prefix all commands with `uv run`

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | Async ORM, session management, per-batch commit | Already in use; `expire_on_commit=False` configured |
| asyncpg | 0.31.0 | PostgreSQL async driver | Already in use |
| aioboto3 | 15.5.0 | MinIO/S3 async operations | Already in use for upload/download |
| Alembic | 1.18.4 | Database migrations | Already in use for schema changes |
| pydantic-settings | 2.13.1 | Environment-based configuration | Already in use for Settings class |
| loguru | 0.7.3 | Structured logging | Already in use throughout |
| Procrastinate | 3.7.3 | Background task queue | Already integrated in Phase 49 |

### No New Dependencies Required
This phase adds no new packages. All required functionality is available through existing libraries.

## Architecture Patterns

### Current Architecture (Before Phase 50)
```
import_task.py:process_import()
  -> Creates session, sets RLS once
  -> Calls service.process_import_file()
     -> Downloads entire file into memory
     -> Loops through CSV in batches of 1000
     -> Calls process_csv_batch() per batch (flush, not commit)
     -> Accumulates all_errors in memory
     -> Single commit at end (in import_task.py)
```

### Target Architecture (After Phase 50)
```
import_task.py:process_import()
  -> Creates session, sets RLS
  -> Detects resume state (PROCESSING + last_committed_row > 0)
  -> Calls service.process_import_file(session, storage, campaign_id)
     -> Downloads file (still full download -- streaming is Phase 51)
     -> Skips already-committed rows if resuming
     -> Per batch:
        1. process_csv_batch() (unchanged)
        2. Update job counters + last_committed_row
        3. session.commit()  <-- RLS resets here
        4. set_campaign_context(session, campaign_id)  <-- restore RLS
        5. Write batch errors to MinIO (if any)
     -> On batch failure:
        1. session.rollback()
        2. Write failed batch rows to error file
        3. set_campaign_context(session, campaign_id)  <-- restore RLS
        4. Continue with next batch
     -> After all batches:
        1. Merge per-batch error files into final errors.csv
        2. Clean up per-batch files
        3. Set job.status = COMPLETED
        4. Final session.commit()
```

### Recommended File Modifications
```
app/
  models/
    import_job.py          # Add last_committed_row column
  core/
    config.py              # Add IMPORT_BATCH_SIZE setting
  services/
    import_service.py      # Refactor process_import_file() for per-batch commits
    storage.py             # Add list_objects() and delete_objects() methods
  tasks/
    import_task.py         # Add resume detection, pass campaign_id to service
  db/
    rls.py                 # No changes needed
  schemas/
    import_job.py          # Add last_committed_row to ImportJobResponse
  api/v1/
    imports.py             # No changes needed (verify polling works)
alembic/versions/
  018_add_last_committed_row.py  # New migration
tests/unit/
  test_import_task.py      # Update for new resume behavior
  test_import_service.py   # Add per-batch commit tests
  test_batch_resilience.py # New: resume, error storage, RLS restore tests
```

### Pattern 1: Per-Batch Commit with RLS Restore
**What:** Commit after each batch, then immediately restore RLS context.
**When to use:** Every batch boundary in process_import_file.
**Critical constraint:** `set_config(..., true)` is transaction-scoped in PostgreSQL. After `session.commit()`, the config value reverts. SQLAlchemy autobegin starts a fresh transaction on the next operation, but the RLS config is gone.

```python
# Source: Verified against app/db/rls.py and PostgreSQL docs
# After processing batch:
job.imported_rows = total_imported
job.skipped_rows = total_skipped
job.total_rows = total_rows
job.last_committed_row = total_rows  # CSV row offset
await session.commit()  # RLS context is GONE after this

# MUST re-set before any RLS-protected query
await set_campaign_context(session, campaign_id)
```

### Pattern 2: Resume-Aware Row Skipping
**What:** On resume, skip CSV rows that were already committed.
**When to use:** When `last_committed_row > 0` at the start of processing.

```python
# Source: D-01, D-02, D-03 from CONTEXT.md
rows_to_skip = job.last_committed_row or 0
rows_skipped = 0
for row in reader:
    if rows_skipped < rows_to_skip:
        rows_skipped += 1
        continue
    batch.append(row)
    # ... normal batch processing
```

### Pattern 3: Per-Batch Error File Upload
**What:** Write each batch's errors to a separate MinIO file immediately.
**When to use:** After each batch that has errors, before the next batch starts.

```python
# Source: D-04 from CONTEXT.md
error_prefix = f"imports/{campaign_id}/{job_id}/errors/"
batch_error_key = f"{error_prefix}batch_{batch_num:04d}.csv"
# Upload batch errors immediately, freeing memory
await storage.upload_bytes(batch_error_key, error_csv_bytes, "text/csv")
```

### Pattern 4: Error File Merge and Cleanup
**What:** After all batches complete, merge per-batch error CSVs into one final file and delete the batch files.
**When to use:** At the end of process_import_file, before marking COMPLETED.

```python
# Source: D-05 from CONTEXT.md
# Approach: Track batch error keys in a list (just strings, not data)
# Download each, concatenate (streaming), upload merged file, delete batch files
final_error_key = f"imports/{campaign_id}/{job_id}/errors.csv"
```

### Anti-Patterns to Avoid
- **Accumulating all errors in memory:** The current code does `all_errors.extend(errors)`. With 50K rows, this could hold thousands of error dicts in memory. Instead, write errors per-batch to MinIO.
- **Forgetting RLS restore after rollback:** If a batch fails and you `session.rollback()`, the RLS context is also gone. Must call `set_campaign_context()` after rollback too.
- **Using `session.begin()` explicitly:** SQLAlchemy autobegin handles this. Do NOT wrap batch processing in `async with session.begin():` blocks -- that would prevent the per-batch commit pattern.
- **Incrementing `last_committed_row` before commit:** If you set `last_committed_row` and then the commit fails, the value is lost (correct behavior). Only the committed value matters for resume.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3 prefix listing | Manual key tracking | `s3.list_objects_v2(Prefix=...)` via aioboto3 | Handles pagination, consistent with S3 API |
| CSV concatenation | Custom binary merge | Read each batch CSV, write combined with single header row | CSV headers must appear only once |
| Transaction management | Manual BEGIN/COMMIT SQL | SQLAlchemy `session.commit()` + autobegin | Session tracks dirty objects, handles rollback |
| Idempotent upsert | Custom duplicate detection | Existing `INSERT ON CONFLICT DO UPDATE` | Already handles re-processing after crash |

**Key insight:** The existing `process_csv_batch()` method is already idempotent via upsert. A crash mid-batch means the uncommitted rows are simply re-processed on resume with no data corruption. This is the foundation of the crash resilience strategy.

## Common Pitfalls

### Pitfall 1: RLS Silent Failure After Commit
**What goes wrong:** After `session.commit()`, `set_config('app.current_campaign_id', ..., true)` reverts to the session-default (a zero UUID set by the pool checkout handler). Subsequent queries silently return zero rows or insert into the wrong campaign context.
**Why it happens:** PostgreSQL transaction-scoped config is designed to reset on commit. This is correct behavior but easy to forget.
**How to avoid:** Always call `set_campaign_context(session, campaign_id)` immediately after `session.commit()` and after `session.rollback()`. Consider a helper function `commit_and_restore_rls(session, campaign_id)`.
**Warning signs:** Voters appear with wrong campaign_id, or batch returns 0 imported after the first batch succeeds.

### Pitfall 2: Polling Endpoint Reads Stale Data
**What goes wrong:** The polling endpoint uses a separate session (from the request lifecycle). If the worker only does `session.flush()` (not `session.commit()`), the polling session cannot see the progress because uncommitted data is invisible to other transactions.
**Why it happens:** PostgreSQL's default READ COMMITTED isolation means one transaction cannot see another's uncommitted changes.
**How to avoid:** The whole point of per-batch commits is to make progress visible. Verify the polling endpoint uses `session.get()` (which it does) and that the worker does `session.commit()` (not just flush).
**Warning signs:** Polling shows 0 rows for extended periods during import, then jumps to final count.

### Pitfall 3: expire_on_commit Confusion
**What goes wrong:** After `session.commit()`, accessing `job.imported_rows` triggers a lazy load that fails or returns stale data.
**Why it happens:** With `expire_on_commit=True` (the default), all attributes are expired after commit and require a new query to load. This project uses `expire_on_commit=False`, so attributes remain accessible.
**How to avoid:** The session factory already has `expire_on_commit=False` (verified). But if someone changes this setting, the per-batch commit pattern breaks silently. Add a comment explaining the dependency.
**Warning signs:** `DetachedInstanceError` or `MissingGreenlet` errors after commit.

### Pitfall 4: Resume Skips Wrong Number of Rows
**What goes wrong:** After a crash, resume starts at the wrong row because `last_committed_row` doesn't match the actual CSV row offset.
**Why it happens:** Off-by-one errors in counting. The header row is not counted by `csv.DictReader`, but rows are 1-indexed in user-visible contexts.
**How to avoid:** `last_committed_row` stores the count of data rows (excluding header) that have been fully committed. After processing batch N, `last_committed_row = sum of all rows in batches 1..N`. On resume, skip exactly that many data rows from the DictReader.
**Warning signs:** First voter after resume is a duplicate or the wrong voter.

### Pitfall 5: Error Merge Duplicates Headers
**What goes wrong:** The merged error CSV has a header row from each per-batch file, making it unparseable.
**Why it happens:** Each per-batch error file has its own header row. Naive concatenation includes all of them.
**How to avoid:** When merging, include the header from the first file only. For subsequent files, skip the first line.
**Warning signs:** "error_reason" appears as a data row in the merged CSV.

### Pitfall 6: Batch Failure Rollback Affects Job Counters
**What goes wrong:** After a batch fails and `session.rollback()` is called, the job counter updates from that batch are also rolled back, but the in-memory Python variables still have the incremented values.
**Why it happens:** Rollback undoes all changes since the last commit, including `job.imported_rows` updates. But the Python-side `total_imported` counter was incremented before the failure.
**How to avoid:** With `expire_on_commit=False`, after rollback the Python object still holds the pre-rollback values. Re-read counters from the job object after rollback, or track batch-level counts separately and only add to the running total after successful commit.
**Warning signs:** `imported_rows` count is higher than actual rows in the voter table.

## Code Examples

### Example 1: Alembic Migration for last_committed_row
```python
# Source: Matches existing migration pattern in alembic/versions/
"""Add last_committed_row to import_jobs.

Revision ID: 018_last_committed_row
Revises: 017_procrastinate
"""
from alembic import op
import sqlalchemy as sa

revision = "018_last_committed_row"
down_revision = "017_procrastinate"

def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("last_committed_row", sa.Integer(), nullable=True, server_default="0"),
    )

def downgrade() -> None:
    op.drop_column("import_jobs", "last_committed_row")
```

### Example 2: Settings Addition
```python
# Source: Matches existing Settings pattern in app/core/config.py
class Settings(BaseSettings):
    # ... existing settings ...

    # Import processing
    import_batch_size: int = 1000
```

### Example 3: StorageService List and Delete by Prefix
```python
# Source: aioboto3 docs, adapted to existing StorageService pattern
async def list_objects(self, prefix: str) -> list[str]:
    """List object keys with the given prefix."""
    keys: list[str] = []
    async with self.session.client(**self._client_kwargs()) as s3:
        paginator = s3.get_paginator("list_objects_v2")
        async for page in paginator.paginate(
            Bucket=settings.s3_bucket, Prefix=prefix
        ):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
    return keys

async def delete_objects(self, keys: list[str]) -> None:
    """Delete multiple objects by key."""
    if not keys:
        return
    async with self.session.client(**self._client_kwargs()) as s3:
        await s3.delete_objects(
            Bucket=settings.s3_bucket,
            Delete={"Objects": [{"Key": k} for k in keys]},
        )
```

### Example 4: Commit-and-Restore-RLS Helper
```python
# Source: Derived from app/db/rls.py pattern
async def commit_and_restore_rls(
    session: AsyncSession, campaign_id: str
) -> None:
    """Commit the current transaction and restore RLS context.

    PostgreSQL set_config(..., true) resets on COMMIT.
    This helper ensures RLS is always restored.
    """
    await session.commit()
    await set_campaign_context(session, campaign_id)
```

### Example 5: Per-Batch Error Write Pattern
```python
# Source: Derived from existing error report pattern in import_service.py
import csv
import io

def _build_error_csv(errors: list[dict], include_header: bool = True) -> bytes:
    """Build CSV bytes from error dicts."""
    if not errors:
        return b""
    buf = io.StringIO()
    sample = errors[0].get("row", {})
    fieldnames = list(sample.keys()) + ["error_reason"]
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    if include_header:
        writer.writeheader()
    for err in errors:
        row_data = dict(err.get("row", {}))
        row_data["error_reason"] = err["reason"]
        writer.writerow(row_data)
    return buf.getvalue().encode("utf-8")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single transaction for entire import | Per-batch independent commits | Phase 50 | Crash resilience, real-time progress |
| All errors in memory | Per-batch error files in MinIO | Phase 50 | Constant memory usage |
| `session.flush()` for progress | `session.commit()` for progress | Phase 50 | Polling sees real-time counts |
| Start from row 1 after crash | Resume from last_committed_row | Phase 50 | No wasted work on recovery |

**Deprecated/outdated:**
- `all_errors.extend(errors)` pattern: Memory-unbounded, replaced by per-batch MinIO writes
- Single `session.flush()` for progress: Invisible to polling endpoint, replaced by commit

## Open Questions

1. **Error merge strategy: streaming vs. in-memory**
   - What we know: Per-batch error files are individually small (a fraction of 1000 rows). Typically very few batches have errors.
   - What's unclear: Whether to download all batch error files into memory for merge, or stream them through.
   - Recommendation: In-memory merge is fine. Even worst case (all batches have errors), we're downloading small CSVs one at a time and writing a combined file. The error files are tiny compared to the original import file. Use simple in-memory approach unless benchmarking shows otherwise.

2. **Alembic migration revision chain**
   - What we know: Current head is `017_procrastinate` which has down_revision `016_drop_zitadel_idx`. There's also a merge revision `a394df317a80_merge_014_015`.
   - What's unclear: Whether the current branch has the correct Alembic head state.
   - Recommendation: Run `uv run alembic heads` before creating the migration to confirm the current head. The migration should use `down_revision = "017_procrastinate"`.

3. **Batch counter tracking after rollback**
   - What we know: `expire_on_commit=False` means Python-side attributes persist. But after `session.rollback()`, SQLAlchemy reverts in-memory state to last committed state.
   - What's unclear: Exact behavior of rollback on in-memory attributes with `expire_on_commit=False`.
   - Recommendation: Track batch-level counts in local variables. Only add to cumulative job counters after successful commit. After rollback, re-read `job.imported_rows` from the object (which reflects the last committed state).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESL-01 | Per-batch commit persists rows | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_per_batch_commit_persists -x` | Wave 0 |
| RESL-02 | RLS re-set after each commit | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_rls_restored_after_commit -x` | Wave 0 |
| RESL-03 | Resume from last_committed_row | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_resume_skips_committed_rows -x` | Wave 0 |
| RESL-04 | Committed counters visible to polling | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_counters_committed_not_flushed -x` | Wave 0 |
| RESL-05 | Per-batch error files to MinIO | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_per_batch_error_upload -x` | Wave 0 |
| RESL-01 | Batch failure does not lose prior batches | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_batch_failure_preserves_prior -x` | Wave 0 |
| RESL-02 | RLS re-set after rollback | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_rls_restored_after_rollback -x` | Wave 0 |
| RESL-05 | Error merge produces single CSV | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_error_merge_single_csv -x` | Wave 0 |
| -- | ImportJob model has last_committed_row | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_model_has_last_committed_row -x` | Wave 0 |
| -- | Settings has import_batch_size | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_settings_has_batch_size -x` | Wave 0 |
| -- | ImportJobResponse includes last_committed_row | unit | `uv run pytest tests/unit/test_batch_resilience.py::test_response_schema_has_last_committed_row -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_batch_resilience.py` -- covers RESL-01 through RESL-05 (new file)
- [ ] Update `tests/unit/test_import_task.py` -- existing tests need updating for new per-batch behavior
- [ ] Update `tests/unit/test_import_service.py` -- verify process_csv_batch still works unchanged

## Sources

### Primary (HIGH confidence)
- `app/db/rls.py` -- Verified `set_config(..., true)` is transaction-scoped, resets on COMMIT
- `app/db/session.py` -- Verified `expire_on_commit=False` on async_session_factory
- `app/services/import_service.py` -- Verified `process_csv_batch()` returns (count, errors, phones) and uses only session.flush()
- `app/tasks/import_task.py` -- Verified current single-session, single-commit pattern
- `app/models/import_job.py` -- Verified ImportJob schema, no `last_committed_row` column yet
- `app/services/storage.py` -- Verified `upload_bytes()`, `download_file()`, `delete_object()` methods; no `list_objects()` or `delete_objects()` yet
- [SQLAlchemy 2.0 Transaction Management](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html) -- Autobegin behavior after commit
- [PostgreSQL set_config with transaction scope](https://www.dbi-services.com/blog/postgresql-set_config-and-current_setting/) -- Verified transaction-scoped config resets on commit

### Secondary (MEDIUM confidence)
- [aioboto3 usage docs](https://aioboto3.readthedocs.io/en/latest/usage.html) -- list_objects_v2 with Prefix via paginator
- [boto3 list_objects_v2 API](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3/client/list_objects_v2.html) -- S3 API reference for prefix listing

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already installed and in use; no new dependencies
- Architecture: HIGH -- Pattern directly follows from existing code + PostgreSQL RLS behavior (verified)
- Pitfalls: HIGH -- RLS reset on COMMIT verified in PostgreSQL docs and codebase; expire_on_commit verified in session factory
- Migration: HIGH -- Simple column addition follows existing Alembic pattern

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no fast-moving dependencies)
