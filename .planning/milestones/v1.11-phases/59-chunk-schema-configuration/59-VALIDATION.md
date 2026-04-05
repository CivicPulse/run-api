---
phase: 59
slug: chunk-schema-configuration
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
updated: 2026-04-03
---

# Phase 59 — Validation Strategy

> Nyquist-compliant validation contract for the schema-foundation slice of chunked imports.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio |
| **Config file** | `pyproject.toml` |
| **Quick run command** | `uv run pytest tests/unit/test_model_coverage.py tests/unit/test_batch_resilience.py tests/integration/test_voter_rls.py -x` |
| **Full phase command** | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/unit/test_model_coverage.py tests/unit/test_batch_resilience.py tests/integration/test_voter_rls.py -x` |
| **Estimated runtime** | ~120 seconds |

## Requirement Coverage

| Requirement | Behavior to Prove | Evidence |
|-------------|-------------------|----------|
| `CHUNK-01` | Durable `ImportChunk` schema exists with row-range state and campaign RLS | `tests/unit/test_model_coverage.py`, `tests/unit/test_batch_resilience.py`, `tests/integration/test_voter_rls.py`, `alembic/versions/022_import_chunks.py` |
| `CHUNK-05` | Serial path remains available for non-chunked imports | `tests/unit/test_import_task.py`, `tests/unit/test_import_service.py` |
| `CHUNK-06` | Chunk sizing respects bind-limit-driven sizing rules | `tests/unit/test_import_service.py` |
| `CHUNK-07` | Concurrency defaults/config are present for later orchestration phases | `tests/unit/test_batch_resilience.py`, `app/core/config.py` |

## Wave 0 Status

- [x] `tests/unit/test_model_coverage.py` proves `ImportChunk` exports and registration
- [x] `tests/unit/test_batch_resilience.py` proves durable chunk fields/config defaults exist
- [x] `tests/integration/test_voter_rls.py` proves `import_chunks` obeys campaign isolation
- [x] Alembic review confirms `import_chunks` table, indexes, grants, and RLS policy exist

## Sampling Strategy

- After schema/model changes: `uv run pytest tests/unit/test_model_coverage.py tests/unit/test_batch_resilience.py -x`
- After migration or RLS changes: `uv run pytest tests/integration/test_voter_rls.py -x`
- Phase gate: `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/unit/test_model_coverage.py tests/unit/test_batch_resilience.py tests/integration/test_voter_rls.py -x`

## Validation Sign-Off

- [x] All phase requirements map to direct automated or migration-review evidence
- [x] Wave 0 gaps are closed
- [x] No watch-mode commands are required
- [x] Feedback latency remains bounded to targeted suites
- [x] `nyquist_compliant: true` is justified by the recorded evidence

**Approval:** ready
