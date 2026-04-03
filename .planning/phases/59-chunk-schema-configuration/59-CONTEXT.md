# Phase 59: Chunk Schema & Configuration - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the internal schema and configuration needed for chunked imports without changing the current user-facing import flow or enabling parallel execution yet. This phase defines how chunk state is represented, how small files stay on the existing serial path, and how chunk sizing/concurrency defaults are configured for later phases.

</domain>

<decisions>
## Implementation Decisions

### ImportChunk data model
- **D-01:** `ImportChunk` is an internal child record attached to the parent `ImportJob`, not a user-facing import entity.
- **D-02:** Each chunk record should track row range, lifecycle status, counters, `last_committed_row`, `error_report_key`, and timestamps needed for later aggregation and crash-resume behavior.
- **D-03:** Parent `ImportJob` remains the only API/UI status surface in this phase; chunk details stay implementation-only.

### Serial bypass policy
- **D-04:** Files below a configurable row threshold must stay on the existing serial import path by default.
- **D-05:** The serial bypass should be conservative so chunk orchestration is introduced only where it is likely to improve a materially large import.

### Chunk sizing strategy
- **D-06:** Chunk sizing should reuse the existing bind-limit-aware sizing logic instead of inventing a separate formula from scratch.
- **D-07:** Phase 59 should establish a deterministic chunk sizing function that starts from a default chunk target and clamps it using mapped-column count and total file size.

### Per-import chunk concurrency
- **D-08:** Maximum concurrent chunks per import should be configurable in application settings.
- **D-09:** The default concurrency cap should be intentionally low to avoid worker starvation until real throughput data justifies raising it.

### Carry-forward constraints
- **D-10:** This phase must preserve the current serial import behavior, including per-batch commits, RLS restoration, and resume semantics on the parent import path.
- **D-11:** Chunk-level execution, progress aggregation, error merge/finalization, cancellation propagation, and secondary-work offloading are deferred to Phases 60-64.

### the agent's Discretion
- Exact table/enum field names for `ImportChunk`, as long as they align with existing model and migration conventions.
- Exact settings names for chunk threshold, default chunk size, and max concurrent chunks, as long as they fit the current `Settings` pattern cleanly.
- Whether chunk status uses the same enum values as `ImportJob` or a closely related dedicated enum, as long as later phases can express partial completion and failure cleanly.

</decisions>

<specifics>
## Specific Ideas

- Chunking should remain invisible to the user; the system should still feel like one import with one progress/status surface.
- Small and medium imports should continue using the proven serial path unless the configured threshold says otherwise.
- The existing asyncpg bind-parameter constraint handling in the import service should become the foundation for chunk sizing rather than a separate competing mechanism.
- Worker-capacity protection matters from day one; concurrency defaults should bias toward safety first.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/PROJECT.md` — project constraints, current milestone intent, and previously locked import architecture decisions
- `.planning/STATE.md` — current milestone state and carry-forward decisions for chunked child jobs and secondary-work offloading
- `.planning/ROADMAP.md` — top-level milestone summary showing v1.11 sequencing and Phase 59 scope
- `.planning/milestones/v1.11-ROADMAP.md` — full Phase 59 goal, success criteria, dependencies, and execution order
- `.planning/milestones/v1.11-REQUIREMENTS.md` — CHUNK-01, CHUNK-05, CHUNK-06, and CHUNK-07 requirements

### Existing import pipeline
- `app/models/import_job.py` — current parent import schema and status model that chunk records must complement
- `app/schemas/import_job.py` — existing parent import response surface that should remain the user-facing abstraction
- `app/services/import_service.py` — current serial import path, bind-limit-aware batch sizing, per-batch commits, and resume semantics
- `app/tasks/import_task.py` — current task entry point, advisory-lock usage, and parent import lifecycle transitions
- `app/api/v1/imports.py` — current import API flow that should keep presenting one import job to callers
- `app/core/config.py` — existing settings pattern where chunking configuration should be introduced

### Design and historical context
- `docs/import-parallelization-options.md` — rationale for choosing chunked child jobs over other acceleration approaches
- `docs/issues/large-voter-import-crash.md` — historical context for why durable background imports and faster single-file throughput matter

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/models/import_job.py`: already holds parent import counters, recovery metadata, and lifecycle state, so `ImportChunk` should complement rather than replace it.
- `app/services/import_service.py`: already computes a safe effective batch size from mapped column count and the asyncpg bind-parameter ceiling.
- `app/tasks/import_task.py`: already owns import task boundaries and advisory-lock coordination, which later phases can extend for parent/child orchestration.
- `app/core/config.py`: already exposes import-specific settings, so chunk threshold and concurrency settings should land there.

### Established Patterns
- Import durability is built around per-batch commits plus resume from `last_committed_row`.
- The import API and schema expose one parent job, not internal worker steps.
- Recovery state is application-owned and stored on durable records, not inferred from queue internals.
- Project requirements explicitly keep chunk details out of the UI.

### Integration Points
- Alembic migration plus ORM model registration for the new chunk table
- Parent import settings/config in `app/core/config.py`
- Serial-path branching and chunk sizing helpers in `app/services/import_service.py`
- Future parent/child task orchestration in `app/tasks/import_task.py`

</code_context>

<deferred>
## Deferred Ideas

- Parent CSV pre-scan and child task fan-out belong to Phase 60.
- Parent progress aggregation, merged error reports, and `COMPLETED_WITH_ERRORS` belong to Phase 61.
- Chunk-level failure isolation, cancellation propagation, per-chunk resume, and deadlock prevention belong to Phase 62.
- VoterPhone creation and geometry/derived updates moving off the critical path belong to Phase 63.
- Throughput/ETA UI remains Phase 64 work.
- Fixing the stale GSD phase resolver so Phase 59 resolves to the active v1.11 phase instead of archived v1.7 planning should be handled separately from this feature phase.

</deferred>

---

*Phase: 59-chunk-schema-configuration*
*Context gathered: 2026-04-03*
