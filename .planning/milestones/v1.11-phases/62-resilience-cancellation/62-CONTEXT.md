# Phase 62: Resilience & Cancellation - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden chunked imports so failures, cancellations, retries, and concurrent upserts behave predictably without discarding completed work. This phase covers chunk-local failure isolation, parent-driven cancellation propagation, per-chunk crash resume from `last_committed_row`, and deterministic batch ordering to reduce cross-chunk deadlocks. Secondary work offloading and frontend status polish remain in later phases.

</domain>

<decisions>
## Implementation Decisions

### Failure isolation and parent outcome
- **D-01:** A failed chunk stays failed without forcing sibling chunks to stop; successful chunks are preserved for parent fan-in.
- **D-02:** Parent outcome remains deferred to the existing Phase 61 finalizer rather than introducing eager parent failure on the first chunk error.
- **D-03:** Chunk-local error details continue to live on the chunk record and merged parent artifact; Phase 62 should not invent a second error surface.

### Cancellation propagation
- **D-04:** The parent `cancelled_at` field remains the single cancellation signal for both queued and in-flight chunk workers.
- **D-05:** Queued chunk workers should skip execution entirely when the parent is already cancelled and mark the chunk `CANCELLED`, not `FAILED`.
- **D-06:** In-flight chunk workers should stop only at the next durable batch boundary so already-committed rows remain preserved.
- **D-07:** A cancelled chunk is a terminal chunk outcome that contributes to the existing parent finalization logic instead of bypassing it.

### Crash resume model
- **D-08:** Retries reuse the same `ImportChunk` row and resume from that chunk's own `last_committed_row`; no replacement chunk rows are created for retries.
- **D-09:** Chunk retries must preserve already-imported rows from prior committed batches and only process rows after the chunk-local checkpoint.
- **D-10:** Chunk startup should recognize both queued and previously-processing retry states without resetting counters for resumable chunks.

### Deadlock prevention
- **D-11:** Each batch upsert must sort voter rows deterministically by the voter conflict key before issuing `INSERT ... ON CONFLICT`.
- **D-12:** The same deterministic ordering policy should apply before bulk `VoterPhone` upserts when phone records are still written inline in Phase 62.
- **D-13:** Deadlock hardening should happen inside the existing batch-processing path rather than introducing worker-level coordination or global locking.

### Carry-forward constraints
- **D-14:** Phase 61’s lock-guarded parent finalizer remains the sole authority for terminal parent status, aggregate counters, and merged error artifacts.
- **D-15:** Phase 62 must not pull forward secondary-work offloading from Phase 63 or throughput UI work from Phase 64.

### the agent's Discretion
- Exact helper boundaries for cancellation checks and chunk retry-state detection, as long as the source of truth remains the parent/chunk records.
- Exact sort-key implementation details for voters and phones, as long as ordering is deterministic and aligned with the actual conflict target.
- Exact retry-state transitions around `QUEUED` versus `PROCESSING`, as long as resumable chunks do not lose committed progress.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and phase requirements
- `.planning/ROADMAP.md` — Active roadmap entry for Phase 62 scope, dependencies, and success criteria.
- `.planning/milestones/v1.11-ROADMAP.md` — Faster Imports milestone sequencing and the detailed Phase 62 goal.
- `.planning/REQUIREMENTS.md` — Active requirement IDs `RESL-01`, `RESL-02`, `RESL-03`, and `RESL-04`.

### Prior phase decisions and outputs
- `.planning/phases/60-parent-split-parallel-processing/60-CONTEXT.md` — Locked chunk-worker contract and the decision to defer resilience work to Phase 62.
- `.planning/phases/61-completion-aggregation-error-merging/61-CONTEXT.md` — Locked parent-finalization contract that cancellation and failure outcomes must continue to feed.
- `.planning/phases/61-completion-aggregation-error-merging/61-VERIFICATION.md` — Verified fan-in behavior for completed and failed chunks before resilience hardening.

### Existing implementation seams
- `app/tasks/import_task.py` — Parent coordinator, child chunk task, queued-cancel pre-check, and post-chunk finalization hook.
- `app/services/import_service.py` — Shared ranged import engine, chunk progress persistence, batch upsert path, and parent finalization helpers.
- `app/models/import_job.py` — Parent/chunk status enums and durable fields including `cancelled_at`, `last_committed_row`, and chunk counters.
- `tests/unit/test_import_service.py` — Current chunk-range durability coverage and parent finalization unit tests.
- `tests/unit/test_import_task.py` — Current child-task failure behavior and chunk execution lifecycle coverage.
- `tests/integration/test_import_parallel_processing.py` — Existing concurrent chunk execution coverage that Phase 62 should extend for cancellation and retry cases.
- `tests/unit/test_import_cancel.py` — Existing serial import cancellation expectations that chunked cancellation behavior should align with.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ImportService.process_import_range()` already persists chunk-local counters and `last_committed_row`, making it the natural resume and batch-boundary cancellation seam.
- `ImportService.maybe_finalize_chunked_import()` already treats `CANCELLED` as a terminal chunk status in parent fan-in.
- `process_import_chunk()` already records chunk-local failures without failing the parent immediately.

### Established Patterns
- Durable import progress is application-owned through DB fields and advisory locks, not queue internals.
- Serial import cancellation only stops after a committed batch boundary; chunked cancellation should preserve that durability guarantee.
- Parent import state is user-facing; chunk rows remain internal implementation state even when they drive finalization.

### Integration Points
- Cancellation must be visible to both queued chunk workers and in-flight chunk workers through the parent record.
- Retry/resume behavior should reuse the same chunk row so parent aggregation stays deterministic.
- Deadlock prevention belongs in `process_csv_batch()` because that is where the multi-row voter and phone upserts are issued.

</code_context>

<specifics>
## Specific Ideas

- Keep partial success as the default mixed-outcome behavior: cancelled or failed chunks should still allow completed siblings to count.
- Favor small, durable checks over orchestration redesign: parent `cancelled_at` and chunk `last_committed_row` already provide the needed state.
- Sort by the actual conflict keys instead of approximate row shape so concurrent workers lock rows in the same order.

</specifics>

<deferred>
## Deferred Ideas

- Moving phone creation or geometry updates out of the batch path — Phase 63.
- Throughput/ETA UI and partial-failure presentation — Phase 64.

</deferred>

---

*Phase: 62-resilience-cancellation*
*Context gathered: 2026-04-03*
