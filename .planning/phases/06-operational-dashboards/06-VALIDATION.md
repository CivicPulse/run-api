---
phase: 6
slug: operational-dashboards
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | pyproject.toml [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/test_dashboard_*.py -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_dashboard_*.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | DASH-01 | unit | `uv run pytest tests/unit/test_dashboard_canvassing.py -x` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 0 | DASH-02 | unit | `uv run pytest tests/unit/test_dashboard_phone_banking.py -x` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 0 | DASH-03 | unit | `uv run pytest tests/unit/test_dashboard_volunteers.py -x` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 0 | ALL | unit | `uv run pytest tests/unit/test_dashboard_overview.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_dashboard_canvassing.py` — stubs for DASH-01
- [ ] `tests/unit/test_dashboard_phone_banking.py` — stubs for DASH-02
- [ ] `tests/unit/test_dashboard_volunteers.py` — stubs for DASH-03
- [ ] `tests/unit/test_dashboard_overview.py` — stubs for overview + my-stats

*Existing infrastructure covers framework and conftest needs.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
