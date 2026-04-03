# Phase 62: Resilience & Cancellation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 62-resilience-cancellation
**Mode:** Autonomous auto-selection
**Areas discussed:** Failure isolation and parent outcome, Cancellation propagation, Crash resume model, Deadlock prevention

---

## Failure isolation and parent outcome

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve successful sibling chunks | Failed chunks stay local; parent outcome comes from final fan-in | ✓ |
| Fail fast on first chunk error | Abort remaining chunk work and fail parent immediately | |
| Add separate chunk-retry coordinator | New orchestration layer for failure recovery | |

**Auto choice:** Preserve successful sibling chunks.
**Notes:** Parent finalization remains Phase 61’s responsibility; chunk-local errors stay on chunk rows plus the merged parent artifact.

## Cancellation propagation

| Option | Description | Selected |
|--------|-------------|----------|
| Parent `cancelled_at` drives queued and in-flight chunk shutdown | Queued chunks skip; active chunks stop at next batch boundary | ✓ |
| Kill chunks immediately mid-batch | Interrupt active chunk work before the next commit | |
| Separate chunk-cancel state machine | Add independent per-chunk cancel requests | |

**Auto choice:** Parent `cancelled_at` drives queued and in-flight chunk shutdown.
**Notes:** Chunked cancellation should preserve the same durability semantics as the serial importer.

## Crash resume model

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse the same chunk row and resume from `last_committed_row` | Retry picks up after durable chunk progress | ✓ |
| Recreate failed chunks on retry | New chunk rows replace failed ones | |
| Restart chunk from its original row_start | Simpler retry but reprocesses committed work | |

**Auto choice:** Reuse the same chunk row and resume from `last_committed_row`.
**Notes:** Parent aggregation stays deterministic only if retries keep one durable chunk record.

## Deadlock prevention

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic sort before conflict upserts | Batch rows lock records in the same order across workers | ✓ |
| Add broader locks around chunk execution | Reduce concurrency to avoid row-lock contention | |
| Ignore ordering and rely on retry only | Accept avoidable deadlocks at runtime | |

**Auto choice:** Deterministic sort before conflict upserts.
**Notes:** Ordering should match the actual voter and phone conflict keys inside the existing batch-processing path.

---

*Audit log only. Decisions live in `62-CONTEXT.md`.*
