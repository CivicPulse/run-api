# Phase 56: Schema & Orphan Detection - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect imports that are stuck in `PROCESSING` using application-owned progress timestamps and a configurable staleness threshold, then emit diagnostics that make later recovery safe and explainable. This phase defines the progress signal and orphan-detection visibility; reclaiming or requeueing orphaned work belongs to Phase 57.

</domain>

<decisions>
## Implementation Decisions

### Staleness threshold
- **D-01:** Orphan detection uses a configurable staleness threshold with a default of `30 minutes`.
- **D-02:** The threshold must be application-configured rather than inferred from worker runtime or queue internals.

### Diagnostic visibility
- **D-03:** Orphan detection emits structured logs whenever an import is classified as stale.
- **D-04:** Detection state is also persisted on the import record so later recovery logic, debugging, and tests can inspect why a job was flagged without reconstructing the story from logs alone.

### Progress heartbeat semantics
- **D-05:** `last_progress_at` represents durable forward progress, not transient in-memory activity.
- **D-06:** Update `last_progress_at` at import start, after each committed batch, and on the final status transition.

### Carry-forward constraints
- **D-07:** Orphan detection must remain application-owned and must not depend on Procrastinate heartbeat tables as the source of truth.
- **D-08:** This phase stops at detection and diagnostics; fresh-task requeue/reclaim logic and advisory-lock coordination remain Phase 57 work.

### the agent's Discretion
- Exact persisted metadata shape for detection state, as long as it clearly supports later recovery/debugging.
- Exact settings surface for the configurable threshold, as long as it fits the existing application configuration patterns.
- Exact structured log field names and event taxonomy, as long as they are consistent with existing logging conventions.

</decisions>

<specifics>
## Specific Ideas

- The default threshold should be conservative rather than fast-triggering.
- Persisted orphan-detection metadata should live with the import job, not only in transient logs.
- Heartbeats should align with committed progress so stale detection matches crash-resume behavior.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirements
- `.planning/PROJECT.md` — milestone goal, active constraints, and project-level decisions already locked for import recovery
- `.planning/REQUIREMENTS.md` — ORPH-01 through ORPH-04 requirements that define this phase boundary
- `.planning/STATE.md` — carry-forward milestone decisions, especially application-owned detection and deferred recovery behavior
- `.planning/ROADMAP.md` — Phase 56 goal and dependency boundary within v1.10

### Import pipeline implementation
- `app/models/import_job.py` — current import job schema and lifecycle fields; target location for progress/detection metadata
- `app/tasks/import_task.py` — worker entry point and current resume/status behavior
- `app/services/import_service.py` — per-batch commit flow, resume semantics, and finalization path
- `app/api/v1/imports.py` — import lifecycle endpoints and existing status surface
- `app/schemas/import_job.py` — API response schema that may need to expose new detection/progress fields

### Historical context
- `docs/issues/large-voter-import-crash.md` — rationale for durable background imports and batch-commit progress semantics

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/models/import_job.py`: already stores `status`, `last_committed_row`, counters, and timestamps; natural home for new progress and orphan-detection fields
- `app/tasks/import_task.py`: already distinguishes fresh work from resume work and sets `PROCESSING` before service execution
- `app/services/import_service.py`: already performs per-batch commits and final status transitions, giving clear durable hook points for heartbeat updates
- `app/schemas/import_job.py`: existing API response model can expose any new metadata without inventing a parallel status endpoint

### Established Patterns
- Import durability is based on per-batch commits plus resume from `last_committed_row`
- Logging uses structured placeholders, so orphan detection should emit structured log events rather than freeform strings
- Project state already commits to application-level detection instead of queue-internal worker liveness signals

### Integration Points
- Import start path in `app/tasks/import_task.py`
- Per-batch commit path and finalization path in `app/services/import_service.py`
- Settings/config surface for the staleness threshold in the existing app configuration layer
- Import status API surface in `app/api/v1/imports.py` and `app/schemas/import_job.py`

</code_context>

<deferred>
## Deferred Ideas

- Worker startup scan, fresh-task requeue/reclaim flow, and advisory-lock coordination belong to Phase 57.
- Periodic reconciliation loops remain future requirement work (`PREC-01`, `PREC-02`), not part of Phase 56.

</deferred>

---

*Phase: 56-schema-orphan-detection*
*Context gathered: 2026-04-01*
