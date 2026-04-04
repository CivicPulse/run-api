# Phase 60: Parent Split & Parallel Processing - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Split large CSV imports into internal chunk jobs that process concurrently behind the existing parent import job. This phase covers CSV pre-scan, parent chunk creation/fan-out, and per-chunk processing with independent sessions, per-batch commits, and RLS restoration. Parent-level aggregation/finalization, cancellation propagation, and secondary-work offloading remain in later phases.

</domain>

<decisions>
## Implementation Decisions

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

### the agent's Discretion
- Exact parent/child task names and helper boundaries, as long as `process_import` remains the public queue entrypoint and chunk workers preserve current durability semantics.
- Exact mechanism for persisting initial chunk metadata and queued state, as long as it cleanly supports later aggregation and resilience phases.
- Exact child-worker session lifecycle shape, as long as each chunk runs with independent database sessions and restored RLS context after each commit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and phase requirements
- `.planning/ROADMAP.md` — Active roadmap entry for Phase 60 scope, dependencies, and success criteria.
- `.planning/milestones/v1.11-ROADMAP.md` — Faster Imports milestone sequencing and the detailed Phase 60 goal.
- `.planning/REQUIREMENTS.md` — Active requirement IDs CHUNK-02, CHUNK-03, and CHUNK-04 plus milestone out-of-scope limits.

### Prior phase decisions
- `.planning/phases/59-chunk-schema-configuration/59-CONTEXT.md` — Locked decisions on internal chunk model, serial bypass, deterministic chunk sizing, and conservative chunk concurrency.
- `.planning/phases/57-recovery-engine-completion-hardening/57-CONTEXT.md` — Advisory-lock and recovery constraints that Phase 60 must preserve around import ownership.

### Existing implementation seams
- `app/tasks/import_task.py` — Existing `process_import` entrypoint, lock claim flow, queued-cancel check, and current large-file branch.
- `app/services/import_service.py` — Existing serial import loop, streamed CSV processing, per-batch commit/RLS restore logic, and chunk-range helpers.
- `app/models/import_job.py` — `ImportJob` and `ImportChunk` state surfaces available to Phase 60.
- `app/api/v1/imports.py` — `confirm_mapping` task dispatch contract and current import queueing behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/tasks/import_task.py::process_import`: Already owns import lock claim, queued-cancel handling, and serial-threshold branching.
- `app/services/import_service.py::plan_chunk_ranges`: Deterministic row-range planner established in Phase 59.
- `app/services/import_service.py::should_use_serial_import`: Existing serial bypass gate for unknown or below-threshold files.
- `app/services/import_service.py::process_import_file`: Proven streamed CSV loop with per-batch commits, resume support, and RLS restoration.
- `app/models/import_job.py::ImportChunk`: Durable chunk state model already available for fan-out execution.

### Established Patterns
- Import durability is application-owned: progress is tracked with `last_progress_at` and advisory locks, not queue internals.
- Commit boundaries must restore RLS immediately after each commit via the existing DB helper path.
- Large-file behavior is introduced by branching inside existing task/service seams instead of replacing the serial path wholesale.

### Integration Points
- `confirm_mapping` continues to defer `process_import` from the API layer.
- `process_import` becomes the parent coordinator for large imports after the serial-threshold decision.
- Child chunk tasks should integrate with the current import service logic rather than bypassing it.

</code_context>

<specifics>
## Specific Ideas

- No new orchestration task layer: extend the existing `process_import` task for parent coordination.
- Eager fan-out is preferred over building a scheduler in Phase 60.
- Preserve one import-processing engine and add chunk-aware row bounds rather than duplicating batch logic.

</specifics>

<deferred>
## Deferred Ideas

- Parent-level aggregation and merged finalization state — Phase 61.
- Cancellation propagation, per-chunk crash resume, and deadlock hardening — Phase 62.
- Secondary work offloading after voter commits — Phase 63.

</deferred>

---

*Phase: 60-parent-split-parallel-processing*
*Context gathered: 2026-04-03*
