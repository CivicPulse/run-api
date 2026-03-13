---
phase: 25
slug: filter-builder-query-enhancement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2+ with pytest-asyncio |
| **Config file** | pyproject.toml `[tool.pytest.ini_options]` |
| **Quick run command** | `uv run pytest tests/unit/test_voter_search.py -x -q` |
| **Full suite command** | `uv run pytest tests/unit/ -x -q` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_voter_search.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/unit/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | FILT-01 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_propensity_general_range -x` | Exists (extend) | ⬜ pending |
| 25-01-02 | 01 | 1 | FILT-01 | unit | `uv run pytest tests/unit/test_voter_search.py::TestVoterFilterSchema -x` | New class | ⬜ pending |
| 25-01-03 | 01 | 1 | FILT-02 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_ethnicities_multi_select -x` | Exists (extend) | ⬜ pending |
| 25-01-04 | 01 | 1 | FILT-03 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_mailing_city_filter -x` | Exists (extend) | ⬜ pending |
| 25-01-05 | 01 | 1 | FILT-04 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery -x` | Exists (extend) | ⬜ pending |
| 25-01-06 | 01 | 1 | FILT-05 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_voted_in_year_only_expansion -x` | Exists (extend) | ⬜ pending |
| 25-01-07 | 01 | 1 | FILT-05 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_not_voted_in_year_expansion -x` | Exists (extend) | ⬜ pending |
| 25-01-08 | 01 | 1 | FILT-05 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_voted_in_canonical_unchanged -x` | Exists (extend) | ⬜ pending |
| 25-01-09 | 01 | 1 | FILT-03 | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_registration_city_case_insensitive -x` | Exists (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `tests/unit/test_voter_search.py` already has `TestBuildVoterQuery` class with the `_compiled_sql` helper and compile-to-SQL pattern. New tests are added as methods to this existing class.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
