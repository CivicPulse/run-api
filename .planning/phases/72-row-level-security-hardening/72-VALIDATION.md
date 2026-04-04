---
phase: 72
slug: row-level-security-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (asyncio_mode=auto), alembic |
| **Config file** | pyproject.toml [tool.pytest.ini_options], alembic.ini |
| **Quick run command** | `uv run pytest tests/integration/test_rls_hardening.py -x` |
| **Migration check** | `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head` |
| **Full suite command** | `uv run pytest tests/` |
| **Estimated runtime** | ~30 seconds (quick); ~3 min (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command + migration check if migration file touched
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green, migration must be cleanly reversible
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 72-01-01 | 01 | 0 | SEC-05, SEC-06 | fixture | `uv run pytest tests/integration/test_rls_hardening.py --collect-only` | ⬜ pending |
| 72-02-01 | 02 | 1 | SEC-05 | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_force_on_campaigns` | ⬜ pending |
| 72-02-02 | 02 | 1 | SEC-05 | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_force_on_campaign_members` | ⬜ pending |
| 72-02-03 | 02 | 1 | SEC-05 | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_force_on_users` | ⬜ pending |
| 72-02-04 | 02 | 1 | SEC-06 | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_organizations_cross_campaign_blocked` | ⬜ pending |
| 72-02-05 | 02 | 1 | SEC-06 | integration | `uv run pytest tests/integration/test_rls_hardening.py::test_organization_members_cross_campaign_blocked` | ⬜ pending |
| 72-02-06 | 02 | 1 | SEC-05, SEC-06 | migration | `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/test_rls_hardening.py` — new test file with failing test stubs
- [ ] `tests/integration/conftest.py` — new `two_orgs_with_campaigns` fixture
- [ ] alembic/versions/026_rls_hardening.py — new migration file (created Wave 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Prod app connects as non-superuser | SEC-05/SEC-06 | Out of scope for Phase 72 — but RLS is only real when app connects as `app_user`. Currently API connects as `postgres` (superuser). | Verify docker-compose.yml and k8s manifests. Track as tech debt for follow-up phase. |
