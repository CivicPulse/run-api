---
phase: 23
slug: schema-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
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
| 23-01-01 | 01 | 1 | VMOD-01 | unit | `uv run pytest tests/unit/test_voter_model.py::test_propensity_columns -x` | No -- Wave 0 | pending |
| 23-01-02 | 01 | 1 | VMOD-02 | unit | `uv run pytest tests/unit/test_voter_model.py::test_mailing_address_columns -x` | No -- Wave 0 | pending |
| 23-01-03 | 01 | 1 | VMOD-03 | unit | `uv run pytest tests/unit/test_voter_model.py::test_spoken_language_column -x` | No -- Wave 0 | pending |
| 23-01-04 | 01 | 1 | VMOD-04 | unit | `uv run pytest tests/unit/test_voter_model.py::test_demographic_columns -x` | No -- Wave 0 | pending |
| 23-01-05 | 01 | 1 | VMOD-05 | unit | `uv run pytest tests/unit/test_voter_model.py::test_cell_phone_confidence_column -x` | No -- Wave 0 | pending |
| 23-01-06 | 01 | 1 | VMOD-06 | unit | `uv run pytest tests/unit/test_voter_model.py::test_household_columns -x` | No -- Wave 0 | pending |
| 23-01-07 | 01 | 1 | VMOD-07 | unit | `uv run pytest tests/unit/test_voter_model.py::test_zip4_apartment_type_columns -x` | No -- Wave 0 | pending |
| 23-01-08 | 01 | 1 | VMOD-10 | unit | `uv run pytest tests/unit/test_voter_model.py::test_voter_phone_unique_constraint -x` | No -- Wave 0 | pending |
| 23-02-01 | 02 | 1 | VMOD-09 | unit | `uv run pytest tests/unit/test_voter_schemas.py -x` | No -- Wave 0 | pending |
| 23-02-02 | 02 | 1 | VMOD-08 | integration | `uv run alembic upgrade head` | manual-only | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_voter_model.py` -- stubs for VMOD-01 through VMOD-08, VMOD-10 (model column existence, types, constraints)
- [ ] `tests/unit/test_voter_schemas.py` -- stubs for VMOD-09 (schema field existence, serialization roundtrip)
- [ ] Update `tests/unit/test_voter_search.py` -- existing tests reference old field names (city, state, zip_code)
- [ ] Update `tests/unit/test_field_mapping.py` -- existing tests assert `address_line1` mapping
- [ ] Update `tests/unit/test_import_service.py` -- existing tests use old canonical field names

*Existing infrastructure covers framework setup. Wave 0 creates test files only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly to existing data | VMOD-08 | Requires live DB with existing voter rows | Run `uv run alembic upgrade head` against dev DB with data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
