# Phase 69: Queued Cancellation Finalization Closure - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Mode:** Infrastructure phase — discuss skipped

<domain>
## Phase Boundary

Close the queued-cancellation seam so cancelled queued chunks still reach terminal secondary-work state and reliably trigger parent import finalization. This is a pure state-machine repair — no user-facing behavior changes, only internal chunk lifecycle corrections.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraint from audit: `import_task.py:294` sets `chunk.status = CANCELLED` for queued chunks but leaves `phone_task_status` and `geometry_task_status` uninitialized. `import_service.py:1310` refuses terminal chunk completion until both secondary task statuses are terminal, so `maybe_finalize_chunked_import()` never sees all chunks as terminal.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `maybe_finalize_chunked_import()` in `app/services/import_service.py` — advisory-locked parent finalizer
- `maybe_complete_chunk_after_secondary_tasks()` in `app/services/import_service.py` — chunk terminal-state gate
- `ImportChunkStatus` and `ImportChunkTaskStatus` enums in `app/models/import_job.py`
- Existing cancellation tests in `tests/unit/test_import_cancel.py`

### Established Patterns
- Chunk workers check `job.cancelled_at` at entry and set chunk status + secondary task statuses to CANCELLED
- Parent finalization uses `pg_try_advisory_lock` to ensure exactly-once execution
- Secondary task statuses (phone_task_status, geometry_task_status) must be terminal for chunk completion

### Integration Points
- `app/tasks/import_task.py:294` — queued chunk cancellation path (the bug site)
- `app/services/import_service.py:1310-1331` — secondary task terminal gate
- `app/services/import_service.py:1535` — parent finalizer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. The fix is narrowly scoped to ensuring queued chunks set secondary task statuses to CANCELLED alongside chunk status.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
