# Phase 58: Test Coverage - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning
**Mode:** Auto-generated during autonomous milestone execution

<domain>
## Phase Boundary

Add automated coverage for stale-import detection, recovery queuing, recovery skip behavior, crash-resume flow, and duplicate prevention on resumed imports.

</domain>

<decisions>
## Implementation Decisions

- Add focused unit tests for orphan scans and worker startup queuing.
- Add recovery-task tests for terminal-status and fresh-progress skip behavior.
- Add an integration-marked recovery-flow test that exercises `recover_import` through the real import service path while asserting resumed rows are not duplicated.

</decisions>

<canonical_refs>
## Canonical References

- `tests/unit/test_batch_resilience.py`
- `tests/unit/test_import_task.py`
- `tests/unit/test_import_recovery.py`
- `tests/integration/test_import_recovery_flow.py`
- `.planning/REQUIREMENTS.md`

</canonical_refs>
