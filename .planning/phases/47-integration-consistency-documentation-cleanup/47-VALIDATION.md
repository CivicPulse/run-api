---
phase: 47
slug: integration-consistency-documentation-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | pyproject.toml |
| **Quick run command** | `uv run pytest tests/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -v` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | DATA-03 | unit | `uv run pytest tests/unit/test_turf_rls.py -v` | ❌ W0 | ⬜ pending |
| 47-02-01 | 02 | 1 | OBS-03, OBS-04 | unit | `uv run pytest tests/unit/test_rate_limits.py -v` | ❌ W0 | ⬜ pending |
| 47-03-01 | 03 | 2 | DATA-03, OBS-03, OBS-04 | integration | `uv run pytest tests/ -v` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_turf_rls.py` — stubs for DATA-03 (turf RLS centralization)
- [ ] `tests/unit/test_rate_limits.py` — stubs for OBS-03, OBS-04 (rate limiting coverage)

*Existing infrastructure covers test framework and fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| REQUIREMENTS.md traceability | DATA-03, OBS-03, OBS-04 | Documentation verification | Grep REQUIREMENTS.md for "Satisfied" status on all 48 rows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
