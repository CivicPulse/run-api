# Phase 67: Chunk Import Cleanup & Deletion Semantics - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Autonomous post-audit cleanup

<domain>
## Phase Boundary

Close the remaining v1.11 debt around chunked import deletion and stale Phase 59 traceability.

</domain>

<decisions>
## Implementation Decisions

- Delete-time cleanup should remove child `import_chunks` rows before deleting the parent import job so runtime behavior is correct even before the DB-level cascade is in place.
- The `import_chunks.import_job_id` foreign key should still be upgraded to `ON DELETE CASCADE` so direct SQL/admin deletes follow the same contract.
- Phase 59 artifacts should describe schema foundation only; runtime chunk creation belongs to Phase 60.

</decisions>

<code_context>
## Existing Code Insights

- `app/api/v1/imports.py` deletes only the parent `ImportJob` today and falls back to HTTP 409 on foreign-key conflicts.
- `app/models/import_job.py` defines `ImportChunk.import_job_id` without cascade delete behavior.
- `tests/unit/test_import_cancel.py` already covers delete guards and is the right place for the chunked-delete regression.

</code_context>

<specifics>
## Specific Ideas

- Clean up chunk error report objects alongside parent import objects.
- Add regression coverage that proves chunk child rows are explicitly removed before the parent delete.

</specifics>

<deferred>
## Deferred Ideas

- Broader import artifact lifecycle garbage collection beyond chunk error reports.

</deferred>
