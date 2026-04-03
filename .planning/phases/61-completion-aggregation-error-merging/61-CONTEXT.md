# Phase 61: Completion Aggregation & Error Merging - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Aggregate chunk-level progress and results back onto the parent import record so users see one unified import outcome. This phase covers parent counter aggregation from chunk rows, exactly-once finalization behind an advisory lock, merged error report creation, and partial-success terminal status handling. Cancellation propagation, per-chunk crash resume, deadlock prevention, and secondary-work offloading remain out of scope for later phases.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and phase requirements
- `.planning/ROADMAP.md` — Active roadmap entry for Phase 61 scope, dependencies, and success criteria.
- `.planning/milestones/v1.11-ROADMAP.md` — Faster Imports milestone sequencing and the detailed Phase 61 goal.
- `.planning/REQUIREMENTS.md` — Active requirement IDs `PROG-01`, `PROG-02`, `PROG-03`, and `PROG-05`.

### Prior phase decisions and outputs
- `.planning/phases/60-parent-split-parallel-processing/60-CONTEXT.md` — Locked Phase 60 runtime boundaries that defer aggregation/finalization to this phase.
- `.planning/phases/60-parent-split-parallel-processing/60-RESEARCH.md` — Phase 60 implementation rationale and validation architecture.
- `.planning/phases/60-parent-split-parallel-processing/60-VERIFICATION.md` — Verified behavior of chunk-local progress, eager fan-out, and deferred parent finalization.

### Existing implementation seams
- `app/tasks/import_task.py` — Current parent coordinator and chunk-worker task behavior.
- `app/services/import_service.py` — Shared ranged import engine, chunk-local progress writes, and current parent completion behavior for serial imports.
- `app/models/import_job.py` — Parent and chunk status/counter fields that Phase 61 will aggregate and finalize.
- `app/api/v1/imports.py` — Current user-facing import status and error-report response surface.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/tasks/import_task.py::process_import_chunk`: already marks chunk terminal states and is the natural place to trigger “maybe finalize” checks.
- `app/services/import_service.py`: already owns parent-level serial finalization and error-file handling, making it the likely home for chunk aggregation/finalization helpers.
- `app/models.import_job.ImportChunk`: durable source of truth for per-chunk counters and error artifact keys.

### Established Patterns
- Import ownership and recovery use PostgreSQL advisory locks rather than queue internals.
- User-facing import state is exposed only through the parent `ImportJob`; chunk rows remain internal implementation detail.
- Durable progress should come from persisted DB/object-storage state, not in-memory worker coordination.

### Integration Points
- Finalization will need to aggregate from `ImportChunk` rows into the parent `ImportJob`.
- The API import-status endpoint already surfaces parent `error_report_key`, so merged artifact output can reuse the current response contract.
- Phase 60 intentionally left parent aggregation/finalization absent, so this phase should connect to those exact seams rather than invent a parallel path.

</code_context>

<specifics>
## Specific Ideas

- Keep the user-facing error artifact contract as merged CSV, not a new JSON or zipped chunk bundle.
- Treat partial success as a first-class parent outcome distinct from total failure.
- Use exactly-once locked finalization rather than parent polling or a separate coordinator loop.

</specifics>

<deferred>
## Deferred Ideas

- Cancellation propagation to queued/in-flight chunks — Phase 62.
- Per-chunk crash resume and deadlock prevention — Phase 62.
- Secondary work offloading for phones/geometry — Phase 63.

</deferred>

---

*Phase: 61-completion-aggregation-error-merging*
*Context gathered: 2026-04-03*
