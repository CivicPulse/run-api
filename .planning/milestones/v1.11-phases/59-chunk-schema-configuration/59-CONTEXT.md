# Phase 59: Chunk Schema & Configuration - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the schema, settings, and sizing logic needed to represent chunked imports without changing the existing serial import runtime path for files that stay below the configured bypass threshold.

</domain>

<decisions>
## Implementation Decisions

### Chunk Record Model
- **D-01:** `ImportChunk` should be operational from day one, not a placeholder table. Include row range, per-chunk status, imported/skipped counters, `last_committed_row`, error report key, and lifecycle timestamps needed for resume and recovery.
- **D-02:** Do not duplicate parent-import configuration snapshots into every chunk in Phase 59. Keep the chunk record focused on execution state and row assignment unless a later phase proves snapshotting is required.

### Chunk Status Semantics
- **D-03:** Use a dedicated `ImportChunkStatus` enum instead of reusing parent `ImportStatus`.
- **D-04:** Parent and chunk lifecycle states are intentionally separate: parent import status remains the user-facing source of truth, while chunk status is an internal coordination primitive for fan-out/fan-in phases.

### Serial Bypass Policy
- **D-05:** Phase 59 uses a deterministic row-count-based `serial_threshold` to decide whether an import stays on the existing serial path.
- **D-06:** Small files below the threshold do not create chunk records and should preserve current behavior as closely as possible.

### Adaptive Chunk Sizing Policy
- **D-07:** Chunk sizing should respect the existing asyncpg bind-parameter safety model already used by the serial importer, so column count remains a first-class input.
- **D-08:** Final chunk sizing should be constrained by both bind-limit-safe rows per batch and a configurable `max_chunks_per_import` cap to avoid flooding workers with excessive child jobs.
- **D-09:** Phase 59 should establish deterministic chunk-boundary calculation logic now, but actual concurrent child execution stays in Phase 60.

### the agent's Discretion
- Exact enum member names for `ImportChunkStatus`, as long as they clearly support pending, queued, processing, completed, cancelled, and failed-style chunk states.
- Exact setting names and defaults, as long as they cover default chunk size, serial bypass threshold, and maximum chunks per import.
- Whether chunk timestamps mirror parent naming (`created_at`, `updated_at`) only or also add phase-specific fields such as `started_at` / `completed_at`.

</decisions>

<specifics>
## Specific Ideas

- Keep chunking invisible to end users in this milestone slice. Users still see one import job, not internal chunk rows.
- Preserve the current serial import path for below-threshold files rather than forcing “one chunk” semantics too early.
- The current importer already computes a safe effective batch size from mapped column count and the asyncpg 32,767 bind-parameter limit; Phase 59 should extend that idea rather than introduce a separate sizing model.
- Advisory-lock-based coordination and `last_committed_row` resume behavior from v1.10 remain foundational assumptions for the parallel import design.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/ROADMAP.md` — Active roadmap showing v1.11 Faster Imports and the current Phase 59 definition.
- `.planning/milestones/v1.11-ROADMAP.md` — Detailed Phase 59 goal, dependencies, and success criteria.
- `.planning/milestones/v1.11-REQUIREMENTS.md` — v1.11 requirements traceability, especially CHUNK-01, CHUNK-05, CHUNK-06, and CHUNK-07.

### Existing import pipeline
- `app/models/import_job.py` — Current parent import model and status lifecycle that chunk infrastructure must complement, not replace.
- `app/services/import_service.py` — Existing serial import path, resume behavior, and bind-limit-aware batch sizing logic.
- `app/tasks/import_task.py` — Current background-task orchestration, advisory locking, and serial processing entrypoint.
- `app/core/config.py` — Existing import settings location to extend with chunking configuration.

### Carry-forward decisions
- `.planning/phases/57-recovery-engine-completion-hardening/57-CONTEXT.md` — Recovery-task and advisory-lock decisions that constrain chunk coordination.
- `.planning/phases/58-test-coverage/58-CONTEXT.md` — Existing recovery coverage expectations that future chunk work should preserve and extend.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ImportJob` already exposes status, `last_committed_row`, `last_progress_at`, `source_exhausted_at`, and cancellation metadata that establish the parent import lifecycle.
- `ImportService.process_import_file()` already computes an effective batch size from mapped column count and the asyncpg bind limit.
- `process_import` and `recover_import` already use advisory locks plus explicit campaign context setup before querying RLS-protected tables.

### Established Patterns
- Import coordination is task-driven through Procrastinate, not a generic workflow engine.
- Resume behavior is row-based via `last_committed_row`, with per-batch commits and RLS restoration after each commit.
- Import settings live in `app/core/config.py` and are exposed as strongly typed Pydantic settings.

### Integration Points
- Phase 59 will likely add a new import-chunk model plus an Alembic migration.
- The parent import task flow in `app/tasks/import_task.py` is the eventual handoff point for serial-threshold routing in later phases.
- Future chunk aggregation and recovery work will need to align with the existing parent `ImportJob` counters instead of replacing them.

</code_context>

<deferred>
## Deferred Ideas

- Per-chunk UI visibility or user-triggered chunk retries — explicitly out of scope per v1.11 requirements.
- Copying parent configuration snapshots into each chunk row — defer unless later phases demonstrate a concrete need.
- File-size-based or runtime-adaptive serial bypass heuristics beyond row-count thresholding — defer until the simple threshold proves insufficient.

</deferred>

---

*Phase: 59-chunk-schema-configuration*
*Context gathered: 2026-04-01*
