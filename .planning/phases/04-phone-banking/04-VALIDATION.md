---
phase: 4
slug: phone-banking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | pyproject.toml `[tool.pytest.ini_options]` |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -x` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PHONE-01 | unit | `uv run pytest tests/unit/test_call_lists.py -x` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | PHONE-01 | integration | `uv run pytest tests/integration/test_phone_banking_rls.py -x` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | PHONE-02 | unit | `uv run pytest tests/unit/test_phone_bank.py::test_session_with_script -x` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | PHONE-03 | unit | `uv run pytest tests/unit/test_phone_bank.py::test_record_call -x` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 1 | PHONE-03 | unit | `uv run pytest tests/unit/test_call_lists.py::test_entry_status -x` | ❌ W0 | ⬜ pending |
| 04-02-04 | 02 | 1 | PHONE-04 | unit | `uv run pytest tests/unit/test_phone_bank.py::test_call_with_survey -x` | ❌ W0 | ⬜ pending |
| 04-02-05 | 02 | 1 | PHONE-05 | unit | `uv run pytest tests/unit/test_phone_bank.py::test_interaction_events -x` | ❌ W0 | ⬜ pending |
| 04-02-06 | 02 | 1 | PHONE-05 | unit | `uv run pytest tests/unit/test_dnc.py::test_auto_flag_refused -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_call_lists.py` — stubs for PHONE-01, entry claiming, priority ordering
- [ ] `tests/unit/test_phone_bank.py` — stubs for PHONE-02/03/04/05, session lifecycle, call recording
- [ ] `tests/unit/test_dnc.py` — stubs for DNC CRUD, bulk import, auto-flag
- [ ] `tests/integration/test_phone_banking_rls.py` — stubs for RLS on all new tables

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supervisor live progress view | PHONE-03 | Real-time data refresh depends on timing | 1. Start session 2. Record calls 3. Check /progress endpoint returns updated stats |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
