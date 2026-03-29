# Phase 53: Concurrent Safety & Cancellation - Research

**Researched:** 2026-03-28
**Domain:** Import cancellation workflow, concurrent job prevention, SQLAlchemy async polling, FastAPI action endpoints, React polling UI
**Confidence:** HIGH

## Summary

This phase adds import cancellation (BGND-03) and verifies concurrent import prevention (BGND-04). The implementation is well-constrained by CONTEXT.md decisions: a `cancelled_at` column on ImportJob, two new status enum values (CANCELLING/CANCELLED), a cancel endpoint, worker batch-loop checking, and frontend UI updates.

The architecture is straightforward because (1) the status enum uses `native_enum=False` (VARCHAR-backed), so adding Python enum values requires no ALTER TYPE migration -- only a column migration for `cancelled_at`, (2) the existing batch loop in `process_import_file()` already commits between batches with `commit_and_restore_rls()`, providing natural cancellation checkpoints, and (3) the existing polling infrastructure in the frontend (`useImportJob` with 3s refetchInterval) already handles terminal state detection and can be extended for CANCELLING/CANCELLED.

**Primary recommendation:** Insert a `session.refresh(job)` + `cancelled_at` check immediately after each `_process_single_batch()` call returns in the batch loop. Use the same `_merge_error_files()` + `commit_and_restore_rls()` cleanup path as normal completion. The cancel endpoint is a simple status update guarded by state validation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Add a `cancelled_at` timestamp column to ImportJob. The cancel endpoint sets this timestamp; the worker checks `cancelled_at` via `session.refresh(job)` between batches. No new infrastructure required -- uses the existing DB session.
- **D-02:** The worker checks for cancellation only between batches (after each `_process_single_batch()` call), not mid-batch or mid-stream. Worst-case delay is one batch cycle (~1000 rows, seconds). This is acceptable.
- **D-03:** When cancellation is detected between batches, the worker finishes and commits the current batch before stopping. This maximizes preserved work and matches SC1: "stops after the current batch completes."
- **D-04:** On cancellation, per-batch error files are merged into a final `errors.csv`, same as on normal completion. The user gets a downloadable error report for the partial import.
- **D-05:** Add two new ImportStatus values: `CANCELLING` and `CANCELLED`. Cancel endpoint sets status to `CANCELLING`; worker transitions to `CANCELLED` after stopping. Frontend can show "Cancelling..." while the worker finishes the current batch.
- **D-06:** `CANCELLED` is a terminal state -- no resume. The user starts a fresh import if needed. `last_committed_row` is preserved for reference only.
- **D-07:** `POST /campaigns/{campaign_id}/imports/{import_id}/cancel` -- action-style sub-resource. Clear intent, no ambiguity with DELETE semantics.
- **D-08:** Requires `admin` role, consistent with existing import endpoints (start, confirm mapping, poll status).
- **D-09:** Returns `202 Accepted` with `ImportJobResponse` showing `status=CANCELLING`. Frontend continues polling until status transitions to `CANCELLED`. Consistent with confirm_mapping's 202 pattern.
- **D-10:** Cancel button appears on the import status polling view, visible only when status is `PROCESSING` or `QUEUED`.
- **D-11:** Clicking cancel shows a ConfirmDialog: "Cancel this import? Already-imported rows will be kept." Uses the existing `ConfirmDialog` component from `web/src/components/shared/`.
- **D-12:** While in `CANCELLING` state, the cancel button is replaced with a disabled "Cancelling..." indicator (or spinner). The progress display continues showing committed row counts. Transitions to final `CANCELLED` state on the next poll cycle.
- **D-13:** Already implemented in Phase 49 via `queueing_lock=str(campaign_id)` in `confirm_mapping`. This phase adds end-to-end test coverage to verify it works correctly -- no new code needed for the lock itself.

### Claude's Discretion
- Alembic migration naming and column ordering for `cancelled_at`
- Exact cancel check placement in `process_import_file()` (after `_process_single_batch` return vs in the streaming loop guard)
- Whether to add a `cancelled_by` column tracking which user requested cancellation
- Structured logging for cancellation events (cancel requested, cancel detected, cancel completed)
- Test approach for verifying cancellation timing (mock long-running batch, trigger cancel, verify committed rows)
- Frontend polling interval adjustment during CANCELLING state (if any)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BGND-03 | User can cancel a running import, stopping processing after the current batch completes | D-01 through D-12: cancelled_at column, CANCELLING/CANCELLED statuses, cancel endpoint, batch-loop check, frontend cancel button with ConfirmDialog |
| BGND-04 | System prevents concurrent imports for the same campaign via Procrastinate queueing lock | D-13: Already implemented via `queueing_lock=str(campaign_id)` in confirm_mapping (Phase 49). This phase adds E2E test verification. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package manager:** `uv` only -- `uv run`, `uv add`, `uv add --dev`
- **Linting:** `uv run ruff check .` / `uv run ruff format .` before every commit
- **Tests:** `uv run pytest` with asyncio_mode=auto
- **Python:** 3.13, never use system python
- **Git:** Conventional Commits, commit on branches, commit after each task
- **Line length:** 88 chars
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008)

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy (async) | 2.0.48+ | ImportJob model, session.refresh() for cancellation polling | Already used; refresh() re-reads row from DB |
| FastAPI | 0.135.1+ | Cancel endpoint with 202 Accepted | Already used; action sub-resource pattern |
| Alembic | 1.18.4+ | Migration for cancelled_at column | Already used for all schema changes |
| Procrastinate | 3.7.3 | Background task queue with queueing_lock | Already installed; queueing_lock handles BGND-04 |
| TanStack Query | (frontend) | Polling with refetchInterval | Already used in useImportJob hook |

### Supporting (already installed -- no new dependencies)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| loguru | 0.7.3+ | Structured logging for cancellation events | Worker cancellation detection + completion |
| ky | (frontend) | HTTP client for cancel endpoint | POST to cancel action endpoint |
| sonner | (frontend) | Toast notifications for cancel confirmation | User feedback on cancel action |

**No new packages required.** This phase uses only existing infrastructure.

## Architecture Patterns

### Backend Changes Map

```
app/
  models/
    import_job.py         # Add CANCELLING, CANCELLED to ImportStatus; add cancelled_at column
  schemas/
    import_job.py         # Add cancelled_at to ImportJobResponse
  api/v1/
    imports.py            # Add POST .../cancel endpoint
  services/
    import_service.py     # Add cancellation check in process_import_file() batch loop
  tasks/
    import_task.py        # Handle CANCELLED status in task exception handler (optional)
alembic/versions/
  020_add_cancelled_at.py # Add cancelled_at column to import_jobs

web/src/
  types/
    import-job.ts         # Add "cancelling" to ImportStatus (already has "cancelled")
  hooks/
    useImports.ts         # Add useCancelImport mutation hook; update polling terminal states
  routes/.../new.tsx      # Cancel button in step 3 (Progress view)
  components/voters/
    ImportProgress.tsx     # Cancel button, CANCELLING state display, CANCELLED handling
```

### Pattern 1: Cancellation Check in Batch Loop

**What:** After each `_process_single_batch()` returns, refresh the ImportJob from DB and check if `cancelled_at` is set. If so, exit the loop gracefully.
**When to use:** In `process_import_file()`, after each batch commit.
**Example:**

```python
# In process_import_file() batch loop, after _process_single_batch():
if len(batch) >= settings.import_batch_size:
    batch_num += 1
    await self._process_single_batch(
        batch, batch_num, job, campaign_id,
        session, storage, error_prefix,
        batch_error_keys, counters,
    )
    batch = []

    # Cancellation check (D-01, D-02, D-03)
    await session.refresh(job)
    if job.cancelled_at is not None:
        logger.info(
            "Import {} cancelled after batch {}",
            import_job_id, batch_num,
        )
        break  # Exit batch loop; cleanup below handles the rest
```

The cleanup path after the loop (error file merge + status finalization) needs a conditional:

```python
# After loop exits (normal completion OR cancellation):
if batch_error_keys:
    await self._merge_error_files(storage, batch_error_keys, job, import_job_id)

# Set final status based on whether cancelled
if job.cancelled_at is not None:
    job.status = ImportStatus.CANCELLED
else:
    job.status = ImportStatus.COMPLETED
await commit_and_restore_rls(session, campaign_id)
```

### Pattern 2: Cancel Endpoint (Action Sub-Resource)

**What:** POST endpoint that validates job state, sets `cancelled_at` and `status=CANCELLING`, returns 202.
**When to use:** API layer only.
**Example:**

```python
@router.post(
    "/campaigns/{campaign_id}/imports/{import_id}/cancel",
    response_model=ImportJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("5/minute", key_func=get_user_or_ip_key)
async def cancel_import(
    campaign_id: uuid.UUID,
    import_id: uuid.UUID,
    request: Request,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    job = await db.get(ImportJob, import_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")

    if job.status not in (ImportStatus.QUEUED, ImportStatus.PROCESSING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel import in status '{job.status}'",
        )

    job.cancelled_at = utcnow()
    job.status = ImportStatus.CANCELLING
    await db.commit()
    await db.refresh(job)
    return ImportJobResponse.model_validate(job)
```

### Pattern 3: Frontend Cancel Mutation Hook

**What:** useCancelImport mutation following existing useConfirmMapping pattern.
**When to use:** In useImports.ts.
**Example:**

```typescript
export function useCancelImport(campaignId: string, jobId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/imports/${jobId}/cancel`)
        .json<ImportJob>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: importKeys.detail(campaignId, jobId) }),
  })
}
```

### Pattern 4: Polling Terminal State Updates

**What:** Update `useImportJob` refetchInterval and `deriveStep` to handle CANCELLING and CANCELLED.
**When to use:** In useImports.ts.
**Example:**

```typescript
// deriveStep additions:
case "cancelling":
  return 3  // Stay on progress view while cancelling
case "cancelled":
  return 4  // Go to completion/summary view

// refetchInterval update in useImportJob:
return status === "completed" || status === "failed" || status === "cancelled"
  ? false
  : 3000
```

### Anti-Patterns to Avoid

- **Checking cancellation mid-batch:** D-02 explicitly says check only between batches. Do NOT add checks inside `_process_single_batch()` or inside the CSV line iterator. The batch is the atomic unit.
- **Using a separate cancellation table or Redis flag:** D-01 says use the existing DB and `session.refresh()`. No new infrastructure.
- **Making CANCELLED resumable:** D-06 says CANCELLED is terminal. Do not add CANCELLED -> QUEUED transitions.
- **Using DELETE for cancellation:** D-07 specifies POST to an action sub-resource. DELETE has different semantics (remove the resource).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inter-process signaling | Redis pub/sub, file flags, signals | `session.refresh(job)` on the same DB row | Worker already has a DB session; no new infrastructure needed |
| Polling for terminal state | Custom setTimeout/setInterval | TanStack Query `refetchInterval` | Already used; just add new terminal states to the check |
| Confirmation dialog | Custom modal | `ConfirmDialog` from `web/src/components/shared/` | Already exists with loading/variant support |
| Timestamp generation | `datetime.utcnow()` | `utcnow()` from `app.core.time` | Project uses a centralized time utility |

## Common Pitfalls

### Pitfall 1: Stale Session After Commit

**What goes wrong:** After `commit_and_restore_rls()`, the session's identity map may have stale data for the ImportJob. The cancellation check needs a fresh read.
**Why it happens:** SQLAlchemy's default `expire_on_commit=True` expires attributes, but the object stays in the identity map. `session.refresh(job)` forces a SELECT.
**How to avoid:** Always call `session.refresh(job)` before checking `cancelled_at`. This is already the prescribed approach in D-01.
**Warning signs:** Cancellation not being detected even though `cancelled_at` is set in the database.

### Pitfall 2: Race Between Cancel Endpoint and Worker Status Transitions

**What goes wrong:** The cancel endpoint sets `status=CANCELLING`, but the worker might simultaneously set `status=COMPLETED` if it just finished the last batch.
**Why it happens:** Two concurrent DB sessions updating the same row.
**How to avoid:** In the worker's finalization path, re-read `cancelled_at` after the loop exits. If `cancelled_at` is set, use CANCELLED regardless of whether the loop completed normally. The sequence is: refresh -> check cancelled_at -> set final status. This makes `cancelled_at` the authoritative signal, not status.
**Warning signs:** Import shows COMPLETED despite user clicking cancel.

### Pitfall 3: Cancel on QUEUED Job That Hasn't Started

**What goes wrong:** User cancels a QUEUED job. The worker picks it up later and starts processing because it doesn't check `cancelled_at` at startup.
**Why it happens:** The cancel endpoint sets CANCELLING + cancelled_at, but the worker entry point (`import_task.py`) doesn't check for it before calling `process_import_file()`.
**How to avoid:** Add a cancelled_at check in either `import_task.py` (before calling `process_import_file()`) or at the top of `process_import_file()`. If the job is already cancelled, set status to CANCELLED and return immediately.
**Warning signs:** Cancelled-while-queued jobs start processing when the worker picks them up.

### Pitfall 4: delete_import Guard Needs CANCELLING Added

**What goes wrong:** The existing `delete_import` endpoint blocks deletion of QUEUED and PROCESSING jobs. After this phase, it should also block CANCELLING.
**Why it happens:** The guard only checks for `(ImportStatus.QUEUED, ImportStatus.PROCESSING)` -- CANCELLING is a new in-flight status.
**How to avoid:** Update the delete guard to include `ImportStatus.CANCELLING` in the blocked statuses.
**Warning signs:** Users could delete a job while the worker is still finishing the current batch.

### Pitfall 5: Frontend Not Handling CANCELLING in deriveStep

**What goes wrong:** If `deriveStep()` doesn't handle "cancelling", the wizard redirects to step 1 (the default case), losing the progress view.
**Why it happens:** The switch statement falls through to `default: return 1`.
**How to avoid:** Add explicit cases for "cancelling" (step 3) and "cancelled" (step 4) in `deriveStep()`.
**Warning signs:** Page flickers or redirects during cancellation.

### Pitfall 6: ImportProgress Not Handling Null imported_rows

**What goes wrong:** `ImportProgress` computes `Math.round((job.imported_rows / job.total_rows) * 100)`. If `imported_rows` is null (job cancelled before any batch), this produces NaN.
**Why it happens:** A job cancelled while QUEUED may have null counters.
**How to avoid:** Default `imported_rows` and `total_rows` to 0 with nullish coalescing: `(job.imported_rows ?? 0)`.
**Warning signs:** NaN% displayed in the progress bar.

## Code Examples

### Alembic Migration for cancelled_at

```python
"""Add cancelled_at to import_jobs.

Revision ID: 020_add_cancelled_at
Revises: 019_l2_voter_columns
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "020_add_cancelled_at"
down_revision: str = "019_l2_voter_columns"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )

def downgrade() -> None:
    op.drop_column("import_jobs", "cancelled_at")
```

**Note:** No enum migration needed because `ImportStatus` uses `native_enum=False` (VARCHAR storage). Adding `CANCELLING` and `CANCELLED` to the Python StrEnum is sufficient.

### ImportStatus Enum Update

```python
class ImportStatus(enum.StrEnum):
    PENDING = "pending"
    UPLOADED = "uploaded"
    QUEUED = "queued"
    PROCESSING = "processing"
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"
```

### ImportJob Model Column Addition

```python
cancelled_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

### Frontend ImportStatus Type Update

```typescript
export type ImportStatus =
  | "pending"
  | "uploaded"
  | "queued"
  | "processing"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed"
```

Note: `"cancelled"` already exists in the type (added defensively in Phase 14). Only `"cancelling"` is new.

### Cancel Button in ImportProgress Component

```tsx
// Cancel button visible when status is PROCESSING or QUEUED
{(job.status === "processing" || job.status === "queued") && (
  <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
    Cancel Import
  </Button>
)}

// Cancelling indicator
{job.status === "cancelling" && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>Cancelling...</span>
  </div>
)}

// ConfirmDialog for cancel confirmation
<ConfirmDialog
  open={showCancelDialog}
  onOpenChange={setShowCancelDialog}
  title="Cancel Import"
  description="Cancel this import? Already-imported rows will be kept."
  confirmLabel="Cancel Import"
  variant="destructive"
  onConfirm={handleCancel}
  isPending={cancelMutation.isPending}
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No cancellation | CANCELLING/CANCELLED two-phase status | This phase | Workers can be stopped gracefully |
| 6 ImportStatus values | 8 ImportStatus values | This phase | Frontend must handle all 8 states |
| No cancelled_at column | cancelled_at timestamp | This phase | Migration 020 required |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2+ with pytest-asyncio |
| Config file | pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BGND-03 | Cancel endpoint returns 202 with CANCELLING status | unit | `uv run pytest tests/unit/test_import_cancel.py::test_cancel_returns_202 -x` | Wave 0 |
| BGND-03 | Cancel on non-cancellable status returns 409 | unit | `uv run pytest tests/unit/test_import_cancel.py::test_cancel_wrong_status_409 -x` | Wave 0 |
| BGND-03 | Worker detects cancelled_at and stops after batch | unit | `uv run pytest tests/unit/test_import_cancel.py::test_worker_stops_on_cancel -x` | Wave 0 |
| BGND-03 | Worker sets CANCELLED status after stopping | unit | `uv run pytest tests/unit/test_import_cancel.py::test_worker_sets_cancelled_status -x` | Wave 0 |
| BGND-03 | Error files merged on cancellation same as completion | unit | `uv run pytest tests/unit/test_import_cancel.py::test_error_merge_on_cancel -x` | Wave 0 |
| BGND-03 | QUEUED job cancelled before worker picks up | unit | `uv run pytest tests/unit/test_import_cancel.py::test_cancel_queued_job -x` | Wave 0 |
| BGND-04 | Confirm mapping returns 409 when campaign has active import | unit | `uv run pytest tests/unit/test_import_confirm.py::test_confirm_mapping_returns_409_on_duplicate -x` | Exists |
| BGND-04 | queueing_lock uses campaign_id string | unit | `uv run pytest tests/unit/test_import_confirm.py::test_confirm_mapping_defer_async_called_with_correct_args -x` | Exists |

### Sampling Rate

- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/test_import_cancel.py` -- covers BGND-03 (cancel endpoint 202, 409, worker cancellation detection, CANCELLED status, error merge, queued cancel)
- No new framework install needed -- pytest infrastructure is complete

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- Read all canonical reference files listed in CONTEXT.md:
  - `app/models/import_job.py` -- Verified `native_enum=False` on ImportStatus (no ALTER TYPE needed)
  - `app/services/import_service.py` lines 1189-1328 -- Verified batch loop structure and natural cancellation checkpoints
  - `app/api/v1/imports.py` -- Verified confirm_mapping queueing_lock pattern and 202 response pattern
  - `app/tasks/import_task.py` -- Verified task structure and exception handler
  - `app/schemas/import_job.py` -- Verified ImportJobResponse fields
  - `web/src/types/import-job.ts` -- Verified "cancelled" already in ImportStatus type
  - `web/src/hooks/useImports.ts` -- Verified polling infrastructure and terminal state detection
  - `web/src/components/voters/ImportProgress.tsx` -- Verified component structure for extension
  - `web/src/components/shared/ConfirmDialog.tsx` -- Verified props interface for reuse
  - `alembic/versions/018_add_last_committed_row.py` -- Verified migration pattern
  - `tests/unit/test_import_task.py` -- Verified test mocking pattern
  - `tests/unit/test_import_confirm.py` -- Verified BGND-04 test coverage already exists

### Secondary (MEDIUM confidence)
- **SQLAlchemy session.refresh()** -- Standard pattern for re-reading a row from DB within an active session; well-documented in SQLAlchemy 2.0 docs

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies; all libraries already installed and verified
- Architecture: HIGH -- All integration points inspected in source code; patterns follow existing conventions
- Pitfalls: HIGH -- Race conditions and edge cases identified by tracing actual code paths

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no external dependency changes)
