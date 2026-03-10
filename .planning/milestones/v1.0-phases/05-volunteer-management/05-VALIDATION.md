---
phase: 5
slug: volunteer-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | pyproject.toml [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | VOL-01 | unit | `uv run pytest tests/unit/test_volunteers.py -x` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 0 | VOL-02,VOL-03 | unit | `uv run pytest tests/unit/test_shifts.py -x` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 0 | RLS | integration | `uv run pytest tests/integration/test_volunteer_rls.py -x` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | X | VOL-01 | unit | `uv run pytest tests/unit/test_volunteers.py -x` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | X | VOL-02 | unit | `uv run pytest tests/unit/test_shifts.py::TestShiftAssignment -x` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | X | VOL-03 | unit | `uv run pytest tests/unit/test_shifts.py::TestShiftCRUD -x` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | X | VOL-04 | unit | `uv run pytest tests/unit/test_shifts.py::TestShiftSignup -x` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | X | VOL-05 | unit | `uv run pytest tests/unit/test_shifts.py::TestCheckInOut -x` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | X | VOL-06 | unit | `uv run pytest tests/unit/test_shifts.py::TestHoursCalculation -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_volunteers.py` — stubs for VOL-01 (volunteer CRUD, skills, availability)
- [ ] `tests/unit/test_shifts.py` — stubs for VOL-02 through VOL-06 (shift CRUD, signup, check-in, hours)
- [ ] `tests/integration/test_volunteer_rls.py` — stubs for RLS isolation on all new tables

*Existing infrastructure (pytest, conftest fixtures) covers framework needs.*

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
