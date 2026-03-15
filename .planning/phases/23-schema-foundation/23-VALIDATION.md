---
phase: 23
slug: schema-foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
updated: 2026-03-15
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | pyproject.toml [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | VMOD-01 | unit | `uv run pytest tests/unit/test_voter_model.py::TestPropensityColumns -x` | Yes | green |
| 23-01-02 | 01 | 1 | VMOD-02 | unit | `uv run pytest tests/unit/test_voter_model.py::TestMailingAddressColumns -x` | Yes | green |
| 23-01-03 | 01 | 1 | VMOD-03 | unit | `uv run pytest tests/unit/test_voter_model.py::TestSpokenLanguageColumn -x` | Yes | green |
| 23-01-04 | 01 | 1 | VMOD-04 | unit | `uv run pytest tests/unit/test_voter_model.py::TestDemographicColumns -x` | Yes | green |
| 23-01-05 | 01 | 1 | VMOD-05 | unit | `uv run pytest tests/unit/test_voter_model.py::TestCellPhoneConfidenceColumn -x` | Yes | green |
| 23-01-06 | 01 | 1 | VMOD-06 | unit | `uv run pytest tests/unit/test_voter_model.py::TestHouseholdColumns -x` | Yes | green |
| 23-01-07 | 01 | 1 | VMOD-07 | unit | `uv run pytest tests/unit/test_voter_model.py::TestZip4AndApartmentTypeColumns -x` | Yes | green |
| 23-01-08 | 01 | 1 | VMOD-10 | unit | `uv run pytest tests/unit/test_voter_model.py::TestVoterPhoneUniqueConstraint -x` | Yes | green |
| 23-02-01 | 02 | 1 | VMOD-09 | unit | `uv run pytest tests/unit/test_voter_schemas.py -x` | Yes | green |
| 23-02-02 | 02 | 1 | VMOD-08 | integration | `uv run alembic upgrade head` | manual-only | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/test_voter_model.py` -- 8 tests for VMOD-01 through VMOD-07, VMOD-10 (model column existence, types, constraints)
- [x] `tests/unit/test_voter_schemas.py` -- 14 tests for VMOD-09 (schema field existence, negative assertions, serialization roundtrip)
- [x] `tests/unit/test_voter_search.py` -- existing tests updated for renamed filter fields (completed in 23-02)
- [x] `tests/unit/test_field_mapping.py` -- existing tests updated for registration_ canonical names (completed in 23-02)
- [x] `tests/unit/test_import_service.py` -- existing tests updated for renamed canonical fields (completed in 23-02)

*Existing infrastructure covers framework setup. Wave 0 creates test files only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly to existing data | VMOD-08 | Requires live DB with existing voter rows | Run `uv run alembic upgrade head` against dev DB with data |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (22 tests run in 0.13s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** green (2026-03-15, nyquist-auditor)

---

## Validation Audit 2026-03-15

| Metric | Count |
|--------|-------|
| Gaps found | 9 |
| Resolved | 9 |
| Escalated | 0 |
