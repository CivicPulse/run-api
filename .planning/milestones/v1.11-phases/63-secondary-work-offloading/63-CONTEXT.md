# Phase 63: Secondary Work Offloading - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove VoterPhone creation and geometry backfill from the chunk critical path so voter upserts finish sooner, while preserving the durability and finalization guarantees established in Phases 60-62. This phase covers chunk-scoped post-upsert work manifests, separate post-chunk tasks for phones and geometry, and chunk lifecycle changes so parent fan-in waits for secondary work to finish. Frontend throughput display remains Phase 64.

</domain>

<decisions>
## Implementation Decisions

### Critical-path boundary
- **D-01:** Primary chunk processing should commit voter upserts only; phones and geometry move to post-chunk tasks.
- **D-02:** Parent and chunk finalization must wait for post-chunk secondary tasks, not just primary row-range completion.

### Secondary work shape
- **D-03:** Use two separate secondary tasks per chunk: one for VoterPhone creation and one for geometry updates.
- **D-04:** Secondary tasks consume durable chunk-scoped manifests rather than re-reading the source CSV.
- **D-05:** `phones_created` becomes owned by the phone task, not the primary voter-upsert path.

### Chunk lifecycle
- **D-06:** A chunk may remain `PROCESSING` after primary range work finishes if secondary tasks are still queued or running.
- **D-07:** A chunk becomes terminal only after both secondary task states are terminal.
- **D-08:** Secondary task failures should fail the chunk and feed the existing parent finalizer instead of inventing a separate import outcome path.

### Carry-forward constraints
- **D-09:** Preserve Phase 62 cancellation and resume semantics while adding secondary work state.
- **D-10:** Preserve Phase 61 parent aggregation ownership; the parent finalizer still derives its result from chunk rows.

### the agent's Discretion
- Exact schema for secondary task state and manifests, as long as it is durable and chunk-scoped.
- Exact task names and helper boundaries, as long as phone and geometry work are separate retryable tasks.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` — Active roadmap entry for Phase 63 scope and success criteria.
- `.planning/REQUIREMENTS.md` — Active requirement IDs `SECW-01` and `SECW-02`.
- `.planning/phases/62-resilience-cancellation/62-VERIFICATION.md` — Current chunk lifecycle guarantees that Phase 63 must preserve.
- `.planning/phases/63-secondary-work-offloading/63-RESEARCH.md` — Recommended implementation slices and risks.
- `app/services/import_service.py` — Current inline phone and geometry writes plus chunk finalization helpers.
- `app/tasks/import_task.py` — Parent/chunk task orchestration and finalization handoff.
- `app/models/import_job.py` — Current durable parent/chunk state surface.
- `tests/unit/test_import_service.py` — Import batch and finalization unit coverage.
- `tests/unit/test_import_task.py` — Chunk task lifecycle coverage.
- `tests/integration/test_import_parallel_processing.py` — Concurrent chunk/finalization integration surface.

</canonical_refs>

<specifics>
## Specific Ideas

- Keep the voter upsert ordering from Phase 62 unchanged and build secondary manifests off the same ordered payload.
- Delay chunk completion rather than introducing a parallel parent-finalization rule.
- Treat geometry as the only current derived-field work unless code discovery uncovers another import-time derived update.

</specifics>

<deferred>
## Deferred Ideas

- Throughput/ETA UI and partial-failure presentation — Phase 64.

</deferred>

---

*Phase: 63-secondary-work-offloading*
*Context gathered: 2026-04-03*
