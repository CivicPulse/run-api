---
phase: 2
slug: voter-data-import-and-crm
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0+ with pytest-asyncio |
| **Config file** | pyproject.toml `[tool.pytest.ini_options]` |
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
| 02-01-01 | 01 | 1 | VOTER-01 | unit + integration | `uv run pytest tests/unit/test_import_service.py -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | VOTER-02 | unit | `uv run pytest tests/unit/test_import_service.py::test_l2_template -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | VOTER-03 | unit | `uv run pytest tests/unit/test_field_mapping.py -x` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | VOTER-04 | unit | `uv run pytest tests/unit/test_voter_model.py -x` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | VOTER-05 | unit | `uv run pytest tests/unit/test_voter_search.py -x` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | VOTER-06 | unit | `uv run pytest tests/unit/test_voter_lists.py::test_dynamic_list -x` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | VOTER-07 | unit | `uv run pytest tests/unit/test_voter_tags.py -x` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 1 | VOTER-08 | unit | `uv run pytest tests/unit/test_voter_lists.py::test_dynamic_list_filter -x` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | VOTER-09 | unit | `uv run pytest tests/unit/test_voter_interactions.py -x` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | VOTER-10 | unit | `uv run pytest tests/unit/test_voter_contacts.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_import_service.py` — stubs for VOTER-01, VOTER-02
- [ ] `tests/unit/test_field_mapping.py` — stubs for VOTER-03
- [ ] `tests/unit/test_voter_model.py` — stubs for VOTER-04
- [ ] `tests/unit/test_voter_search.py` — stubs for VOTER-05
- [ ] `tests/unit/test_voter_lists.py` — stubs for VOTER-06, VOTER-08
- [ ] `tests/unit/test_voter_tags.py` — stubs for VOTER-07
- [ ] `tests/unit/test_voter_interactions.py` — stubs for VOTER-09
- [ ] `tests/unit/test_voter_contacts.py` — stubs for VOTER-10
- [ ] `tests/unit/test_api_imports.py` — stubs for import API endpoints
- [ ] `tests/unit/test_api_voters.py` — stubs for voter API endpoints
- [ ] `tests/integration/test_voter_rls.py` — RLS isolation for voter tables

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pre-signed URL upload flow (browser → R2) | VOTER-01 | Browser-initiated direct upload to R2 | 1. Get pre-signed URL from API 2. Upload CSV via curl/browser 3. Verify file appears in R2 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
