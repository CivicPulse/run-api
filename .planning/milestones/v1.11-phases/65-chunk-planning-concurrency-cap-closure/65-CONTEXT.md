# Phase 65: Chunk Planning & Concurrency Cap Closure - Context

**Gathered:** 2026-04-03
**Status:** Ready for execution
**Mode:** Autonomous gap closure

<domain>
## Phase Boundary

Close the remaining backend/runtime gaps so chunk planning honors file characteristics and parent orchestration enforces bounded concurrency.

</domain>

<decisions>
## Implementation Decisions

### Locked for this phase

- Add object-size lookup through `StorageService` rather than re-streaming files for sizing.
- Keep `plan_chunk_ranges()` deterministic and pure while extending it with `file_size_bytes`.
- Enforce `import_max_chunks_per_import` with durable rolling-window dispatch instead of deferring every chunk immediately.
- Promote successors from `process_import_chunk()` using database state and row locking, not in-memory coordination.

</decisions>

<code_context>
## Existing Code Insights

- `app/tasks/import_task.py` already creates all `ImportChunk` rows up front and owns parent fan-out.
- `app/services/import_service.py` already owns chunk sizing and batch bind-limit safety.
- `ImportChunk.status` plus row ordering is sufficient to drive successor promotion without schema changes.

</code_context>

<specifics>
## Specific Ideas

- Prove file-size-aware chunk planning with focused unit tests.
- Prove capped initial fan-out and successor promotion with unit and integration coverage.
- Update requirement traceability and the v1.11 audit only after the repaired runtime and tests exist.

</specifics>

<deferred>
## Deferred Ideas

- No new scheduler service, queue coordinator, or schema fields in this phase.

</deferred>
