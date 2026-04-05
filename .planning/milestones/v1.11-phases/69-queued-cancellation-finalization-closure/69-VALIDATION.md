---
phase: 69
slug: queued-cancellation-finalization-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x + pytest-asyncio |
| **Config file** | pyproject.toml `[tool.pytest.ini_options]` |
| **Quick run command** | `uv run pytest tests/unit/test_import_task.py tests/unit/test_import_service.py tests/unit/test_import_cancel.py -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_import_task.py tests/unit/test_import_service.py tests/unit/test_import_cancel.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 69-01-01 | 01 | 1 | RESL-02 | unit | `uv run pytest tests/unit/test_import_task.py::test_process_import_chunk_skips_when_parent_cancelled -x` | ✅ (needs update) | ⬜ pending |
| 69-01-02 | 01 | 1 | RESL-02 | unit | `uv run pytest tests/unit/test_import_service.py::test_maybe_complete_chunk_passes_gate_for_cancelled_chunk -x` | ❌ W0 | ⬜ pending |
| 69-02-01 | 02 | 1 | PROG-02 | unit | `uv run pytest tests/unit/test_import_cancel.py::test_queued_only_cancellation_finalizes_parent -x` | ❌ W0 | ⬜ pending |
| 69-02-02 | 02 | 1 | PROG-02 | unit | `uv run pytest tests/unit/test_import_service.py::test_maybe_finalize_chunked_import_marks_parent_cancelled -x` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update assertions in `tests/unit/test_import_task.py::test_process_import_chunk_skips_when_parent_cancelled` for secondary task status
- [ ] New test `tests/unit/test_import_service.py::test_maybe_complete_chunk_passes_gate_for_cancelled_chunk`
- [ ] New test `tests/unit/test_import_cancel.py::test_queued_only_cancellation_finalizes_parent`

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
