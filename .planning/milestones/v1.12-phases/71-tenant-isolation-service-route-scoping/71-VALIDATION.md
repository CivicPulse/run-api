---
phase: 71
slug: tenant-isolation-service-route-scoping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (asyncio_mode=auto) |
| **Config file** | pyproject.toml [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/integration/test_tenant_isolation.py -x` |
| **Full suite command** | `uv run pytest tests/` |
| **Estimated runtime** | ~30 seconds (quick); ~3 min (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 1 | SEC-01 | integration | `uv run pytest tests/integration/test_tenant_isolation.py::test_list_campaigns_scoped` | ❌ W0 | ⬜ pending |
| 71-01-02 | 01 | 1 | SEC-02 | integration | `uv run pytest tests/integration/test_tenant_isolation.py::test_voter_list_cross_campaign_404` | ❌ W0 | ⬜ pending |
| 71-01-03 | 01 | 1 | SEC-03 | integration | `uv run pytest tests/integration/test_tenant_isolation.py::test_import_job_cross_campaign_404` | ❌ W0 | ⬜ pending |
| 71-01-04 | 01 | 1 | SEC-04 | integration | `uv run pytest tests/integration/test_tenant_isolation.py::test_revoke_invite_cross_campaign_404` | ❌ W0 | ⬜ pending |
| 71-01-05 | 01 | 1 | SEC-13 | integration | `uv run pytest tests/integration/test_tenant_isolation.py::test_add_tag_cross_campaign_404` | ❌ W0 | ⬜ pending |
| 71-01-06 | 01 | 1 | SEC-13 | integration | `uv run pytest tests/integration/test_tenant_isolation.py::test_survey_script_question_cross_campaign_404` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/test_tenant_isolation.py` — new test file with positive+negative cases per endpoint
- [ ] `tests/integration/conftest.py` — extend `two_campaigns` fixture with `two_campaigns_with_resources` sibling
- [ ] Existing `_make_app_for_campaign` helper (tests/integration/test_rls_api_smoke.py:191) — reuse

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | All criteria automatable | — |
