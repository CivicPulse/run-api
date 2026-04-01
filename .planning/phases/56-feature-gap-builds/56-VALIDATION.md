---
phase: 56
slug: feature-gap-builds
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest with pytest-asyncio (asyncio_mode=auto) |
| **Config file** | `pyproject.toml` [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/test_voter_interactions.py tests/unit/test_walk_lists.py -x` |
| **Full suite command** | `uv run pytest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_voter_interactions.py tests/unit/test_walk_lists.py -x`
- **After every plan wave:** Run `uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | FEAT-01 | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_update_note -x` | ❌ W0 | ⬜ pending |
| 56-01-02 | 01 | 1 | FEAT-01 | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_update_rejects_non_note -x` | ❌ W0 | ⬜ pending |
| 56-01-03 | 01 | 1 | FEAT-02 | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_delete_note -x` | ❌ W0 | ⬜ pending |
| 56-01-04 | 01 | 1 | FEAT-02 | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_delete_rejects_non_note -x` | ❌ W0 | ⬜ pending |
| 56-02-01 | 02 | 1 | FEAT-03 | unit | `uv run pytest tests/unit/test_walk_lists.py::TestWalkListService::test_rename_walk_list -x` | ❌ W0 | ⬜ pending |
| 56-03-01 | 03 | 2 | FEAT-01 | manual/e2e | Playwright MCP screenshot verification | Deferred to Phase 58 | ⬜ pending |
| 56-03-02 | 03 | 2 | FEAT-02 | manual/e2e | Playwright MCP screenshot verification | Deferred to Phase 58 | ⬜ pending |
| 56-04-01 | 04 | 2 | FEAT-03 | manual/e2e | Playwright MCP screenshot verification | Deferred to Phase 59 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update `tests/unit/test_voter_interactions.py` — add test stubs for update_note, delete_note, reject non-note types
- [ ] Update `tests/unit/test_walk_lists.py` — add test stub for rename_walk_list
- [ ] Remove or update `test_service_has_no_update_or_delete_methods` test that will fail once new methods are added

*Existing infrastructure covers framework requirements. Only test file updates needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Edit note UI renders and saves | FEAT-01 | Frontend visual verification | Take Playwright screenshot of HistoryTab with edit dialog open; verify edited text appears after save |
| Delete note UI confirms and removes | FEAT-02 | Frontend visual verification | Take Playwright screenshot of HistoryTab with confirm dialog; verify note removed after confirmation |
| Rename walk list UI on canvassing/detail pages | FEAT-03 | Frontend visual verification | Take Playwright screenshot of canvassing index and walk list detail showing rename affordance |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
