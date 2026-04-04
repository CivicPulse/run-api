# Phase 57: Recovery Engine & Completion Hardening - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning
**Mode:** Auto-generated during autonomous milestone execution

<domain>
## Phase Boundary

Reclaim stale imports safely, queue fresh recovery work from worker startup, resume from `last_committed_row`, and ensure post-EOF finalization failures cannot leave completed work stuck in `PROCESSING`.

</domain>

<decisions>
## Implementation Decisions

- Use a fresh `recover_import` task rather than mutating existing queue rows.
- Guard both normal processing and recovery with advisory locks keyed by import job UUID.
- Skip recovery for terminal statuses and for fresh non-stale processing jobs.
- If the source is already exhausted, recovery should finalize status directly instead of replaying rows.

</decisions>

<canonical_refs>
## Canonical References

- `app/tasks/import_task.py`
- `app/services/import_recovery.py`
- `app/services/import_service.py`
- `scripts/worker.py`
- `.planning/REQUIREMENTS.md`

</canonical_refs>
