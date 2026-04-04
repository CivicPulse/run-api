# Phase 69: Queued Cancellation Finalization Closure - Research

**Researched:** 2026-04-04
**Domain:** Import chunk state machine repair (Python, SQLAlchemy, Procrastinate task workers)
**Confidence:** HIGH

## Summary

This phase fixes a specific, well-understood state machine bug in the chunked import cancellation path. When a queued chunk is picked up by a worker after the parent import has been cancelled, `import_task.py:294-305` correctly sets `chunk.status = CANCELLED` but does **not** set `phone_task_status` or `geometry_task_status` to any terminal value. They remain `None`. The `finally` block then calls `maybe_complete_chunk_after_secondary_tasks()`, which at line 1327-1331 checks whether both secondary task statuses are in `{COMPLETED, FAILED, CANCELLED}` -- and `None` is not in that set. The method returns `False` without ever calling `maybe_finalize_chunked_import()`. If all remaining chunks are queued-cancelled, the parent import stays stuck in `cancelling` forever.

The fix is narrow: when cancelling a queued chunk, also set both `phone_task_status` and `geometry_task_status` to `CANCELLED`. This makes the chunk fully terminal from the perspective of `maybe_complete_chunk_after_secondary_tasks()`, which can then proceed to call the parent finalizer.

**Primary recommendation:** Add two lines setting `chunk.phone_task_status = ImportChunkTaskStatus.CANCELLED` and `chunk.geometry_task_status = ImportChunkTaskStatus.CANCELLED` at the queued-chunk cancellation site in `import_task.py:300-301`, then add regression tests proving the parent import reaches a terminal state when all chunks are queued-cancelled.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion for this infrastructure phase.

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraint from audit: `import_task.py:294` sets `chunk.status = CANCELLED` for queued chunks but leaves `phone_task_status` and `geometry_task_status` uninitialized. `import_service.py:1310` refuses terminal chunk completion until both secondary task statuses are terminal, so `maybe_finalize_chunked_import()` never sees all chunks terminal.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROG-02 | Last completing chunk triggers finalization (error report merge, parent status) guarded by advisory lock | The finalizer at `import_service.py:1535` is correct once reached; the bug is that the queued-cancellation path never reaches it because secondary task statuses are not set to terminal. Fix enables the finalizer to fire. |
| RESL-02 | Cancellation propagates to all in-flight and queued chunks via parent's `cancelled_at` check | The cancellation signal propagates (workers check `job.cancelled_at`), but queued chunks do not complete the terminal-state contract. Setting secondary task statuses to CANCELLED closes the gap. |
</phase_requirements>

## Standard Stack

No new libraries required. This phase modifies existing files only.

### Core (existing)
| Library | Version | Purpose | Relevance |
|---------|---------|---------|-----------|
| SQLAlchemy (async) | existing | ORM for ImportChunk/ImportJob models | Chunk status mutations |
| Procrastinate | existing | Task queue for chunk workers | Task definitions being modified |
| pytest + pytest-asyncio | existing | Unit test framework | New regression tests |

## Architecture Patterns

### Bug Location and Fix Pattern

**File 1: `app/tasks/import_task.py` lines 294-305 (the bug site)**

Current code:
```python
if job.cancelled_at is not None:
    chunk.status = ImportChunkStatus.CANCELLED
    chunk.error_message = None
    chunk.last_progress_at = utcnow()
    await commit_and_restore_rls(session, campaign_id)
    finalize_parent = True
    return
```

Missing: `chunk.phone_task_status` and `chunk.geometry_task_status` are not set. They stay `None`.

Fix pattern (add before the commit):
```python
if job.cancelled_at is not None:
    chunk.status = ImportChunkStatus.CANCELLED
    chunk.phone_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.geometry_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.error_message = None
    chunk.last_progress_at = utcnow()
    await commit_and_restore_rls(session, campaign_id)
    finalize_parent = True
    return
```

**File 2: `app/services/import_service.py` lines 1310-1331 (the gate)**

This is the `maybe_complete_chunk_after_secondary_tasks()` method. Once both secondary task statuses are `CANCELLED` (a terminal status), the method proceeds past the early return at line 1331 and falls through to check `chunk.status in TERMINAL_CHUNK_STATUSES` (line 1333), which is true for `CANCELLED`. It then calls `maybe_finalize_chunked_import()` -- the parent finalizer.

No changes needed in the service layer. The gate logic is correct; it just never receives terminal inputs for the queued-cancellation case.

### State Machine Flow After Fix

```
Parent: CANCELLING (cancelled_at set)
  |
  v
Queued chunk picked up by worker
  |
  v
Worker checks job.cancelled_at -> not None
  |
  v
Sets chunk.status = CANCELLED
Sets chunk.phone_task_status = CANCELLED  <-- NEW
Sets chunk.geometry_task_status = CANCELLED  <-- NEW
Commits
  |
  v
finally block: maybe_complete_chunk_after_secondary_tasks()
  |
  v
phone_task_status=CANCELLED (terminal) + geometry_task_status=CANCELLED (terminal)
  -> passes gate at line 1327-1331
  |
  v
chunk.status=CANCELLED is in TERMINAL_CHUNK_STATUSES
  -> calls maybe_finalize_chunked_import()
  |
  v
Advisory lock claimed -> summary computed -> all chunks terminal
  -> parent status set (CANCELLED or COMPLETED_WITH_ERRORS)
```

### Existing Test That Must Be Updated

The test `test_process_import_chunk_skips_when_parent_cancelled` in `tests/unit/test_import_task.py:1369` already exercises this path but does **not** assert that secondary task statuses are set. It must be updated to verify the fix.

Current assertions (line 1441-1446):
```python
assert chunk.status == ImportChunkStatus.CANCELLED
assert chunk.error_message is None
assert chunk.last_progress_at is not None
mock_service.process_import_range.assert_not_awaited()
mock_service.maybe_complete_chunk_after_secondary_tasks.assert_awaited_once()
```

New assertions needed:
```python
assert chunk.phone_task_status == ImportChunkTaskStatus.CANCELLED
assert chunk.geometry_task_status == ImportChunkTaskStatus.CANCELLED
```

### Anti-Patterns to Avoid
- **Do not change the service layer gate logic** -- the gate at `import_service.py:1310-1331` is correct. The fix belongs at the call site that sets chunk state, not at the gate that reads it.
- **Do not add a `None`-tolerant fallback in `maybe_complete_chunk_after_secondary_tasks`** -- treating `None` as terminal would mask other bugs where secondary task statuses are genuinely uninitialized because work is still pending.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal status detection | Custom None-handling in the gate | Set statuses at the source (import_task.py) | Keeps the contract explicit: every terminal chunk has terminal secondary statuses |

## Common Pitfalls

### Pitfall 1: Treating None as Terminal
**What goes wrong:** Adding `None` to the terminal statuses set in `maybe_complete_chunk_after_secondary_tasks()` would "fix" the immediate symptom but create a worse problem -- chunks that genuinely have not started secondary work could be prematurely finalized.
**Why it happens:** It seems like the simplest fix.
**How to avoid:** Fix the source (set statuses to CANCELLED) rather than relaxing the gate.
**Warning signs:** Any change to `terminal_statuses` in `import_service.py:1322-1326`.

### Pitfall 2: Missing the Finally Block Interaction
**What goes wrong:** The `return` at line 305 skips the `try` body but the `finally` block still runs. If the fix does not set secondary statuses before the `return`, the `finally` block's call to `maybe_complete_chunk_after_secondary_tasks()` still fails.
**Why it happens:** Python's `try/finally` semantics with early returns.
**How to avoid:** Set all terminal state before the `return` at line 305.
**Warning signs:** Secondary task statuses still `None` after the cancellation path.

### Pitfall 3: Test Mocking Hides the Real Bug
**What goes wrong:** The existing test at line 1369 uses `MagicMock()` for `maybe_complete_chunk_after_secondary_tasks`, which returns `True` regardless of chunk state. It proves the method is called but not that the real method would succeed.
**Why it happens:** Unit tests mock service methods to isolate the task layer.
**How to avoid:** Add a separate unit test that exercises the *real* `maybe_complete_chunk_after_secondary_tasks()` with a cancelled chunk that has both secondary statuses set to CANCELLED, confirming it reaches the finalizer.
**Warning signs:** All chunk cancellation tests pass but integration flow still hangs.

## Code Examples

### Fix: Set Secondary Task Statuses on Queued Chunk Cancellation
```python
# app/tasks/import_task.py, inside process_import_chunk(), lines ~294-305
if job.cancelled_at is not None:
    logger.info(
        "Import chunk {} skipped because parent import {} is cancelled",
        chunk_id,
        job.id,
    )
    chunk.status = ImportChunkStatus.CANCELLED
    chunk.phone_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.geometry_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.error_message = None
    chunk.last_progress_at = utcnow()
    await commit_and_restore_rls(session, campaign_id)
    finalize_parent = True
    return
```

### Regression Test: Cancelled Chunk Passes Secondary Task Gate
```python
# tests/unit/test_import_service.py (new test)
@pytest.mark.asyncio
async def test_maybe_complete_chunk_passes_gate_for_cancelled_chunk():
    """A cancelled chunk with CANCELLED secondary statuses passes the terminal gate."""
    service = ImportService()
    chunk = MagicMock()
    chunk.phone_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.geometry_task_status = ImportChunkTaskStatus.CANCELLED
    chunk.status = ImportChunkStatus.CANCELLED
    chunk.phone_task_error = None
    chunk.geometry_task_error = None

    job = MagicMock()
    job.cancelled_at = utcnow()
    job.status = ImportStatus.CANCELLING  # not yet terminal

    session = AsyncMock()
    storage = MagicMock()

    with patch.object(
        service, "maybe_finalize_chunked_import", new_callable=AsyncMock, return_value=True
    ) as mock_finalize:
        result = await service.maybe_complete_chunk_after_secondary_tasks(
            session=session, storage=storage, job=job, chunk=chunk, campaign_id="test",
        )

    assert result is True
    mock_finalize.assert_awaited_once()
```

### End-to-End Regression: Queued-Only Cancellation Finalizes Parent
```python
# tests/unit/test_import_task.py or tests/unit/test_import_cancel.py (new test)
# Exercises the full path: queued chunk -> cancel detection -> secondary status set ->
# maybe_complete_chunk_after_secondary_tasks (real impl) -> maybe_finalize_chunked_import
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.x + pytest-asyncio |
| Config file | pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `uv run pytest tests/unit/test_import_task.py -x -q` |
| Full suite command | `uv run pytest tests/ -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESL-02 | Queued chunk cancellation sets secondary task statuses to CANCELLED | unit | `uv run pytest tests/unit/test_import_task.py::test_process_import_chunk_skips_when_parent_cancelled -x` | Exists (needs assertion update) |
| RESL-02 | Cancelled chunk with CANCELLED secondary statuses passes terminal gate | unit | `uv run pytest tests/unit/test_import_service.py::test_maybe_complete_chunk_passes_gate_for_cancelled_chunk -x` | Wave 0 |
| PROG-02 | Queued-only cancellation triggers parent finalization to terminal state | unit | `uv run pytest tests/unit/test_import_cancel.py::test_queued_only_cancellation_finalizes_parent -x` | Wave 0 |
| PROG-02 | Parent import reaches CANCELLED status when all chunks are queued-cancelled | unit | `uv run pytest tests/unit/test_import_service.py::test_maybe_finalize_chunked_import_marks_parent_cancelled -x` | Exists (covers service-layer finalization) |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_import_task.py tests/unit/test_import_service.py tests/unit/test_import_cancel.py -x -q`
- **Per wave merge:** `uv run pytest tests/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New assertion lines in `tests/unit/test_import_task.py::test_process_import_chunk_skips_when_parent_cancelled` for secondary task status verification
- [ ] `tests/unit/test_import_service.py::test_maybe_complete_chunk_passes_gate_for_cancelled_chunk` -- proves service gate passes
- [ ] `tests/unit/test_import_cancel.py::test_queued_only_cancellation_finalizes_parent` -- proves full path from chunk cancel to parent terminal

## Open Questions

None. The bug is fully characterized, the fix is clear, and the test patterns are established in the codebase.

## Sources

### Primary (HIGH confidence)
- `app/tasks/import_task.py` lines 261-368 -- chunk worker task with bug site at 294-305
- `app/services/import_service.py` lines 1310-1331 -- secondary task terminal gate
- `app/services/import_service.py` lines 1535-1576 -- parent finalizer (advisory-locked)
- `app/services/import_service.py` lines 1492-1509 -- parent status determination logic
- `app/models/import_job.py` -- ImportChunk model, ImportChunkTaskStatus enum
- `tests/unit/test_import_task.py` lines 1369-1447 -- existing chunk cancellation test
- `tests/unit/test_import_cancel.py` -- existing cancellation test patterns
- `.planning/v1.11-MILESTONE-AUDIT.md` -- audit gap analysis confirming the bug

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure code fix
- Architecture: HIGH -- bug and fix fully characterized from source code inspection
- Pitfalls: HIGH -- single well-understood failure mode with clear prevention

**Research date:** 2026-04-04
**Valid until:** Indefinite (state machine fix, not library-dependent)
