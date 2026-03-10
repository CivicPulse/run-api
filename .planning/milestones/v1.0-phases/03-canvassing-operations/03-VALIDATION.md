---
phase: 3
slug: canvassing-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio |
| **Config file** | pyproject.toml `[tool.pytest.ini_options]` |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -x` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CANV-01 | unit | `uv run pytest tests/unit/test_turfs.py -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CANV-01 | integration | `uv run pytest tests/integration/test_spatial.py -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | CANV-02 | unit | `uv run pytest tests/unit/test_walk_lists.py -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | CANV-03 | unit | `uv run pytest tests/unit/test_walk_lists.py::test_household_clustering -x` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | CANV-06 | unit | `uv run pytest tests/unit/test_walk_lists.py::test_canvasser_assignment -x` | ❌ W0 | ⬜ pending |
| 03-03-01 | 01 | 2 | CANV-04 | unit | `uv run pytest tests/unit/test_canvassing.py -x` | ❌ W0 | ⬜ pending |
| 03-03-02 | 01 | 2 | CANV-05 | unit | `uv run pytest tests/unit/test_canvassing.py::test_contact_attempts -x` | ❌ W0 | ⬜ pending |
| 03-04-01 | 02 | 2 | CANV-07 | unit | `uv run pytest tests/unit/test_surveys.py -x` | ❌ W0 | ⬜ pending |
| 03-04-02 | 02 | 2 | CANV-08 | unit | `uv run pytest tests/unit/test_surveys.py::test_survey_responses -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_turfs.py` — stubs for CANV-01 (turf CRUD, GeoJSON validation)
- [ ] `tests/unit/test_walk_lists.py` — stubs for CANV-02, CANV-03, CANV-06 (generation, clustering, assignment)
- [ ] `tests/unit/test_canvassing.py` — stubs for CANV-04, CANV-05 (door-knock recording, contact tracking)
- [ ] `tests/unit/test_surveys.py` — stubs for CANV-07, CANV-08 (scripts, questions, responses)
- [ ] `tests/integration/test_spatial.py` — stubs for CANV-01 PostGIS integration (ST_Contains, GiST index)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GeoJSON polygon rendering in frontend | CANV-01 | API-only phase, no frontend | Verify GeoJSON output via API response |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
