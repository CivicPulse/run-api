# Phase 80 Context

## Goal

Restore the launch-critical product flows that were still broken after the production shakedown.

## Why This Phase Exists

Phase 79 closed the security-hardening blockers around leaked failures and edge posture. The next blocker class is operational: several core product flows still fail or behave inconsistently under realistic launch conditions, including campaign creation, CSV import confirmation, volunteer signup/cancellation, phone-bank session creation, and survey question reorder.

## Inputs

- `.planning/ROADMAP.md` v1.13 Phase 80 requirements and success criteria
- Existing service code in `app/services/join.py`, import flows, phone-bank session creation, and survey reorder logic
- Existing unit/integration regressions around campaigns, imports, phone banking, volunteers, and surveys

## Requirements

- OPS-01: `POST /campaigns` succeeds when the ZITADEL project grant already exists and leaves no orphaned rows on failure
- OPS-02: CSV import confirm moves jobs from queued to processing/completed instead of immediate worker failure
- OPS-03: Volunteer signup and cancellation semantics are consistent and explicitly supported
- OPS-04: Phone-bank session creation rejects nonexistent `call_list_id` cleanly and invalid `result_code` values return `422`
- OPS-05: Survey question reorder rejects partial ID sets with `400` while preserving valid reorder behavior

## Constraints

- Preserve Phase 78 tenant isolation and Phase 79 sanitized failure behavior
- Prefer regression-first fixes for each broken workflow
- Keep supported contracts explicit where product behavior is intentionally idempotent or narrowed
