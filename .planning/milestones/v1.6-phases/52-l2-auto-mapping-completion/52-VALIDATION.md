---
phase: 52
slug: l2-auto-mapping-completion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 (backend), vitest 4.0.18 (frontend) |
| **Config file** | `pyproject.toml` [tool.pytest.ini_options], `web/vitest.config.ts` |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/unit/ -q && cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/unit/ -q && cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | L2MP-01 | unit | `uv run pytest tests/unit/test_l2_mapping.py -x` | ❌ W0 | ⬜ pending |
| 52-01-02 | 01 | 1 | L2MP-01 | unit | `uv run pytest tests/unit/test_l2_mapping.py::test_new_columns_in_voter_columns -x` | ❌ W0 | ⬜ pending |
| 52-02-01 | 02 | 1 | L2MP-02 | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | ❌ W0 | ⬜ pending |
| 52-02-02 | 02 | 1 | L2MP-02 | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | ❌ W0 | ⬜ pending |
| 52-02-03 | 02 | 1 | L2MP-02 | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | ❌ W0 | ⬜ pending |
| 52-02-04 | 02 | 1 | L2MP-02 | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | ❌ W0 | ⬜ pending |
| 52-03-01 | 03 | 1 | L2MP-03 | unit | `uv run pytest tests/unit/test_l2_detection.py -x` | ❌ W0 | ⬜ pending |
| 52-03-02 | 03 | 1 | L2MP-03 | unit | `uv run pytest tests/unit/test_l2_detection.py -x` | ❌ W0 | ⬜ pending |
| 52-03-03 | 03 | 1 | L2MP-03 | unit | `uv run pytest tests/unit/test_l2_mapping.py -x` | ❌ W0 | ⬜ pending |
| 52-03-04 | 03 | 2 | L2MP-03 | vitest | `cd web && npx vitest run src/components/voters/ColumnMappingTable.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_l2_mapping.py` — stubs for L2MP-01 (all 47 data columns mapped, new columns in _VOTER_COLUMNS)
- [ ] `tests/unit/test_voting_history_l2.py` — stubs for L2MP-02 (all 4 new voting history patterns)
- [ ] `tests/unit/test_l2_detection.py` — stubs for L2MP-03 (detection heuristic, format_detected, match_type)
- [ ] `web/src/components/voters/ColumnMappingTable.test.tsx` updates — stubs for L2MP-03 frontend (L2 banner, match_type badges)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| L2 banner visual appearance | L2MP-03 | Visual design verification | Upload L2 sample file, verify blue info banner renders at top of mapping step |
| Auto-mapped badge rendering | L2MP-03 | Visual design verification | Verify each auto-mapped field shows checkmark badge, fuzzy matches show warning icon |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
