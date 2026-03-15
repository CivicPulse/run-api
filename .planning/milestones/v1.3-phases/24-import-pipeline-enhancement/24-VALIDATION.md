---
phase: 24
slug: import-pipeline-enhancement
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
audited: 2026-03-15
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
| **Estimated runtime** | ~0.21 seconds |

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
| 24-01-01 | 01 | 1 | IMPT-01 | unit | `uv run pytest tests/unit/test_import_service.py::TestPhoneCreationInBatch -x` | ✅ | ✅ green |
| 24-01-02 | 01 | 1 | IMPT-02 | unit | `uv run pytest tests/unit/test_import_parsing.py::TestVotingHistoryParsing -x` | ✅ | ✅ green |
| 24-01-03 | 01 | 1 | IMPT-03 | unit | `uv run pytest tests/unit/test_import_parsing.py::TestPropensityParsing -x` | ✅ | ✅ green |
| 24-01-04 | 01 | 1 | IMPT-04 | unit | `uv run pytest tests/unit/test_field_mapping.py::TestSuggestFieldMapping::test_l2_expanded_aliases -x` | ✅ | ✅ green |
| 24-01-05 | 01 | 1 | IMPT-05 | manual | Review migration SQL; verify in test DB | N/A | ⬜ manual |
| 24-01-06 | 01 | 1 | IMPT-06 | unit | `uv run pytest tests/unit/test_import_service.py::TestUpsertSetClause::test_upsert_set_clause_all_columns -x` | ✅ | ✅ green |
| 24-01-07 | 01 | 1 | IMPT-07 | unit | `uv run pytest tests/unit/test_import_parsing.py::TestPhoneNormalization -x` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/test_import_parsing.py` — new file for parse_voting_history, parse_propensity, normalize_phone unit tests (covers IMPT-02, IMPT-03, IMPT-07)
- [x] Additional test methods in `tests/unit/test_import_service.py` for RETURNING-based phone creation (IMPT-01), SET clause fix (IMPT-06)
- [x] Additional test methods in `tests/unit/test_field_mapping.py` for expanded L2 aliases (IMPT-04)

*Existing test infrastructure is sufficient — pytest + pytest-asyncio configured, test directory structure in place, mock patterns established in test_import_service.py*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| L2 template migration adds new mappings | IMPT-05 | Migration testing requires live DB | Review migration 007 SQL; verify in test DB |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved

---

## Validation Audit 2026-03-15

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Path corrections | 2 |

**Notes:** All 6 automated requirements already had passing tests (74 total, 0.21s runtime). Fixed stale test paths for IMPT-01 (`TestPhoneCreationInBatch` not `TestProcessCsvBatch::test_phone_creation`) and IMPT-06 (`TestUpsertSetClause::test_upsert_set_clause_all_columns` not `TestProcessCsvBatch::test_upsert_set_clause_all_columns`).
