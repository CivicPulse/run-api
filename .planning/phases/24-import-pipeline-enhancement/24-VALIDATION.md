---
phase: 24
slug: import-pipeline-enhancement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x + pytest-asyncio |
| **Config file** | `pyproject.toml` ([tool.pytest.ini_options]) |
| **Quick run command** | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_parsing.py tests/unit/test_field_mapping.py -x -q` |
| **Full suite command** | `uv run pytest tests/unit/ -x -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_parsing.py tests/unit/test_field_mapping.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/unit/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | IMPT-01 | unit | `uv run pytest tests/unit/test_import_service.py::TestProcessCsvBatch::test_phone_creation -x` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | IMPT-02 | unit | `uv run pytest tests/unit/test_import_parsing.py::TestVotingHistoryParsing -x` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | IMPT-03 | unit | `uv run pytest tests/unit/test_import_parsing.py::TestPropensityParsing -x` | ❌ W0 | ⬜ pending |
| 24-01-04 | 01 | 1 | IMPT-04 | unit | `uv run pytest tests/unit/test_field_mapping.py::TestSuggestFieldMapping::test_l2_expanded_aliases -x` | ❌ W0 | ⬜ pending |
| 24-01-05 | 01 | 1 | IMPT-05 | manual | Review migration SQL; verify in test DB | N/A | ⬜ pending |
| 24-01-06 | 01 | 1 | IMPT-06 | unit | `uv run pytest tests/unit/test_import_service.py::TestProcessCsvBatch::test_upsert_set_clause_all_columns -x` | ❌ W0 | ⬜ pending |
| 24-01-07 | 01 | 1 | IMPT-07 | unit | `uv run pytest tests/unit/test_import_parsing.py::TestPhoneNormalization -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_import_parsing.py` — new file for parse_voting_history, parse_propensity, normalize_phone unit tests (covers IMPT-02, IMPT-03, IMPT-07)
- [ ] Additional test methods in `tests/unit/test_import_service.py` for RETURNING-based phone creation (IMPT-01), SET clause fix (IMPT-06)
- [ ] Additional test methods in `tests/unit/test_field_mapping.py` for expanded L2 aliases (IMPT-04)

*Existing test infrastructure is sufficient — pytest + pytest-asyncio configured, test directory structure in place, mock patterns established in test_import_service.py*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| L2 template migration adds new mappings | IMPT-05 | Migration testing requires live DB | Review migration 007 SQL; verify in test DB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
