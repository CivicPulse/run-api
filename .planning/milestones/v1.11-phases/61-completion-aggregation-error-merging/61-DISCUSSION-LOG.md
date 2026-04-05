# Phase 61: Completion Aggregation & Error Merging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 61-completion-aggregation-error-merging
**Areas discussed:** Final outcome policy, Aggregation and finalizer ownership, Error merge shape

---

## Final outcome policy

| Option | Description | Selected |
|--------|-------------|----------|
| Partial-success terminal state | `COMPLETED_WITH_ERRORS` when at least one chunk succeeds and at least one fails | ✓ |
| Any failure means `FAILED` | Parent fails if any chunk fails | |
| Success-only terminal state | Keep `COMPLETED` unless all chunks fail | |

**User's choice:** Accept recommended partial-success policy.
**Notes:** Parent stays `PROCESSING` until locked finalization runs; all-failed imports become `FAILED`; parent gets one summary error message plus merged row-level detail.

## Aggregation and finalizer ownership

| Option | Description | Selected |
|--------|-------------|----------|
| SQL SUM + lock-guarded finalizer | Recompute parent counters from chunk rows and let one finalizer proceed behind advisory lock | ✓ |
| Incremental parent writes | Each chunk updates parent counters directly | |
| Separate coordinator/finalizer loop | Polling parent or out-of-band finalizer job | |

**User's choice:** Accept SQL-aggregation and advisory-lock finalizer model.
**Notes:** Finalization triggers only after all chunks are terminal and merged-error generation happens once inside the locked path.

## Error merge shape

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve merged CSV contract | Merge chunk row-level CSV errors into one parent artifact, minimal parent detail | ✓ |
| JSON or zipped chunk outputs | New artifact format or raw chunk bundle | |
| Silent merge degradation | Report success even if merge fails | |

**User's choice:** Accept merged CSV contract.
**Notes:** Successful chunks add nothing to the merged file; merge failure should fail finalization explicitly; parent exposes only one merged artifact plus one summary message.

---

*Audit log only. Decisions live in `61-CONTEXT.md`.*
