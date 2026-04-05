---
phase: 60
slug: parent-split-parallel-processing
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
updated: 2026-04-03
---

# Phase 60 — Validation Strategy

> Nyquist-compliant validation contract for parent split orchestration and chunk-worker fan-out.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio |
| **Config file** | `pyproject.toml` |
| **Quick run command** | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x` |
| **Full phase command** | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x` |
| **Estimated runtime** | ~90 seconds |

## Requirement Coverage

| Requirement | Behavior to Prove | Evidence |
|-------------|-------------------|----------|
| `CHUNK-02` | Parent pre-scan counts rows and persists totals before routing | `tests/unit/test_import_service.py`, `tests/unit/test_import_task.py` |
| `CHUNK-03` | Parent creates deterministic chunk rows and defers child workers | `tests/unit/test_import_task.py` |
| `CHUNK-04` | Chunk workers process only their assigned row bounds with isolated sessions and durable chunk-local progress | `tests/unit/test_import_service.py`, `tests/unit/test_import_task.py`, `tests/integration/test_import_parallel_processing.py` |

## Wave 0 Status

- [x] Unit coverage proves row counting and absolute row-bound processing
- [x] Unit coverage proves parent fan-out, queueing, and no-fallback failure behavior
- [x] Integration coverage proves concurrent chunk-worker execution against one parent import shape

## Sampling Strategy

- Service/runtime edits: `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x`
- Concurrency/fan-out edits: `uv run pytest tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x`
- Phase gate: `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x`

## Scope Guards

Validation for Phase 60 must reject claims that rely on later-phase behaviors:

- parent finalization and merged error reports belong to Phase 61
- cancellation propagation and crash recovery belong to Phase 62
- deferred phone/geometry work belongs to Phase 63

## Validation Sign-Off

- [x] All phase requirements have direct automated evidence
- [x] Wave 0 requirements are closed
- [x] Sampling cadence remains under the phase runtime budget
- [x] `nyquist_compliant: true` is supported by the evidence set

**Approval:** ready
