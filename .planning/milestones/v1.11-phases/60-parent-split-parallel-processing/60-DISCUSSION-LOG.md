# Phase 60: Parent Split & Parallel Processing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 60-parent-split-parallel-processing
**Areas discussed:** Orchestration entrypoint, Chunk dispatch policy, Chunk worker contract, Startup failure behavior

---

## Orchestration entrypoint

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `process_import` as parent coordinator | Reuse existing queue entrypoint, lock behavior, and serial branch. | ✓ |
| Add `split_import` parent task | Separate orchestration task for large files. | |
| Replace task layout entirely | Full parent/child refactor. | |

**User's choice:** Keep `process_import` as the parent coordinator.
**Notes:** Existing task entrypoint and lock/cancel behavior should stay in place; Phase 60 extends the large-file branch instead of adding another orchestration layer.

## Chunk dispatch policy

| Option | Description | Selected |
|--------|-------------|----------|
| Eager fan-out | Create all chunk records and defer all child tasks immediately. | ✓ |
| Concurrency-capped defer | Create all chunks but only defer up to the cap initially. | |
| Rolling waves | Parent dispatches chunks in batches over time. | |

**User's choice:** Eager fan-out.
**Notes:** Phase 60 should match the milestone wording directly and avoid introducing a scheduler before later resilience/aggregation phases.

## Chunk worker contract

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse current serial loop | Adapt existing import loop with chunk row bounds. | ✓ |
| Dedicated chunk engine | Build a separate chunk-processing path. | |
| External wrapper around serial path | Keep serial method untouched and wrap around it. | |

**User's choice:** Reuse the current serial loop.
**Notes:** The existing streamed CSV, per-batch commit, and RLS restore logic is the safest base; Phase 60 should add chunk-aware bounds instead of duplicating sensitive import behavior.

## Startup failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast | Mark the import failed if pre-scan or fan-out setup fails. | ✓ |
| Fall back to serial | Silently run the large import on the serial path. | |
| Mixed policy | Fail for some setup failures, fall back for others. | |

**User's choice:** Fail fast.
**Notes:** Large imports that qualify for chunking should not silently degrade to serial processing; orchestration failures must be explicit and debuggable.

---

*Audit log only. Decisions live in `60-CONTEXT.md`.*
