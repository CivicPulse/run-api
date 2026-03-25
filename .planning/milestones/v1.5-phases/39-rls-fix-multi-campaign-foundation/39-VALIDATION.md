---
phase: 39
slug: rls-fix-multi-campaign-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-24
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | `pyproject.toml` [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/ -x` |
| **Full suite command** | `uv run pytest` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x`
- **After every plan wave:** Run `uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | DATA-01 | integration | `uv run pytest tests/integration/test_rls_isolation.py -x -m integration` | No -- Wave 0 | pending |
| 39-01-02 | 01 | 1 | DATA-02 | unit | `uv run pytest tests/unit/test_pool_events.py -x` | No -- Wave 0 | pending |
| 39-02-01 | 02 | 2 | DATA-03 | unit | `uv run pytest tests/unit/test_rls_middleware.py -x` | No -- Wave 0 | pending |
| 39-03-01 | 03 | 3 | DATA-04 | unit | `uv run pytest tests/unit/test_user_sync.py -x` | No -- Wave 0 | pending |
| 39-03-02 | 03 | 3 | DATA-05 | unit + integration | `uv run pytest tests/unit/test_campaign_list.py -x` | No -- Wave 0 | pending |
| 39-04-01 | 04 | 4 | DATA-06 | manual | Manual browser testing | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/test_rls_isolation.py` — cross-campaign pool reuse test (DATA-01, DATA-02, TEST-03)
- [ ] `tests/unit/test_pool_events.py` — pool checkout event fires and resets context (DATA-02)
- [ ] `tests/unit/test_rls_middleware.py` — middleware/dependency sets context from path (DATA-03)
- [ ] `tests/unit/test_user_sync.py` — ensure_user_synced creates all memberships (DATA-04)
- [ ] `tests/unit/test_campaign_list.py` — campaign list returns all campaigns with valid membership (DATA-05)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings button hidden when campaignId unavailable | DATA-06 | Frontend UI behavior requires browser interaction | 1. Navigate to campaign list page (no campaignId in URL) 2. Verify settings button is hidden/disabled 3. Navigate to a campaign page 4. Verify settings button is visible and links to correct settings page |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
