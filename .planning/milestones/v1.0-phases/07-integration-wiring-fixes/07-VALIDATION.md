---
phase: 7
slug: integration-wiring-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest >=9.0.2 + pytest-asyncio >=1.3.0 |
| **Config file** | `pyproject.toml` [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | AUTH-02, AUTH-03, AUTH-05, AUTH-07 | unit | `uv run pytest tests/unit/test_lifespan.py -x` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | PHONE-01, PHONE-02, PHONE-03, PHONE-04, PHONE-05 | unit | `uv run pytest tests/unit/test_model_coverage.py -x` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | AUTH-02 (FLOW-01) | unit (E2E mock) | `uv run pytest tests/unit/test_lifespan.py::test_campaign_create_flow -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_lifespan.py` — lifespan wiring, startup failures, campaign E2E flow
- [ ] `tests/unit/test_model_coverage.py` — Alembic model discovery regression test

*Existing infrastructure covers test framework and fixtures.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
