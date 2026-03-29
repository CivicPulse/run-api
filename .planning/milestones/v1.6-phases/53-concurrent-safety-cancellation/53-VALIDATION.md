---
phase: 53
slug: concurrent-safety-cancellation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend) / vitest (frontend) |
| **Config file** | `pyproject.toml` (pytest section) / `web/vitest.config.ts` |
| **Quick run command** | `uv run pytest tests/ -x -q --timeout=30` |
| **Full suite command** | `uv run pytest tests/ -q --timeout=60` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/ -x -q --timeout=30`
- **After every plan wave:** Run `uv run pytest tests/ -q --timeout=60`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | BGND-03 | unit | `uv run pytest tests/test_import_cancel.py -x -q` | ❌ W0 | ⬜ pending |
| 53-01-02 | 01 | 1 | BGND-03 | unit | `uv run pytest tests/test_import_service.py -x -q -k cancel` | ❌ W0 | ⬜ pending |
| 53-02-01 | 02 | 1 | BGND-03 | unit | `uv run pytest tests/test_import_cancel.py -x -q -k frontend` | ❌ W0 | ⬜ pending |
| 53-03-01 | 03 | 2 | BGND-04 | integration | `uv run pytest tests/test_import_confirm.py -x -q -k concurrent` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_import_cancel.py` — stubs for BGND-03 cancel endpoint and service tests
- [ ] Existing `tests/test_import_confirm.py` already covers BGND-04 queueing lock

*Existing infrastructure covers most phase requirements. Only cancel-specific test file needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cancel button appears during PROCESSING | BGND-03 | Visual UI state | Start import, verify cancel button visible during processing |
| CANCELLING state shows disabled indicator | BGND-03 | Visual UI state | Click cancel, verify "Cancelling..." replaces button |
| ConfirmDialog appears on cancel click | BGND-03 | Visual interaction | Click cancel button, verify confirmation dialog |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
