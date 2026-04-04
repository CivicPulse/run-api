---
phase: 61
slug: completion-aggregation-error-merging
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio |
| **Config file** | `pyproject.toml` |
| **Quick run command** | `uv run pytest tests/unit/test_import_service.py -x` |
| **Full suite command** | `uv run pytest` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest impacted command from the task map, defaulting to `uv run pytest tests/unit/test_import_service.py -x`
- **After every plan wave:** Run `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | PROG-01 | unit | `uv run pytest tests/unit/test_import_service.py -x` | ✅ | ⬜ pending |
| 61-01-02 | 01 | 1 | PROG-01, PROG-05 | unit | `uv run pytest tests/unit/test_import_service.py -x` | ✅ | ⬜ pending |
| 61-02-01 | 02 | 2 | PROG-02 | unit | `uv run pytest tests/unit/test_import_task.py -x` | ✅ | ⬜ pending |
| 61-02-02 | 02 | 2 | PROG-01, PROG-02, PROG-03, PROG-05 | unit | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x` | ✅ | ⬜ pending |
| 61-03-01 | 03 | 3 | PROG-01, PROG-02, PROG-03, PROG-05 | integration | `uv run pytest tests/integration/test_import_parallel_processing.py -x` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_import_service.py` — add aggregate/finalizer/merge coverage for PROG-01, PROG-03, and PROG-05
- [ ] `tests/unit/test_import_task.py` — add chunk-terminal handoff and lock-contention coverage for PROG-02
- [ ] `tests/integration/test_import_parallel_processing.py` — extend concurrent chunk completion coverage for exactly-once finalization

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
