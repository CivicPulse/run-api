---
phase: 41
slug: organization-data-model-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | pyproject.toml [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | ORG-01 | unit (model) | `uv run pytest tests/unit/test_org_model.py -x` | ❌ W0 | ⬜ pending |
| 41-01-02 | 01 | 1 | ORG-02 | unit (migration) | `docker compose exec api alembic upgrade head` | ❌ W0 | ⬜ pending |
| 41-02-01 | 02 | 1 | ORG-03 | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | ✅ (extend) | ⬜ pending |
| 41-02-02 | 02 | 1 | ORG-03 | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | ✅ (extend) | ⬜ pending |
| 41-02-03 | 02 | 1 | ORG-03 | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | ✅ (extend) | ⬜ pending |
| 41-02-04 | 02 | 1 | ORG-03 | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | ✅ (extend) | ⬜ pending |
| 41-03-01 | 03 | 2 | ORG-04 | unit | `uv run pytest tests/unit/test_org_auth.py -x` | ❌ W0 | ⬜ pending |
| 41-03-02 | 03 | 2 | ORG-04 | unit | `uv run pytest tests/unit/test_org_auth.py -x` | ❌ W0 | ⬜ pending |
| 41-03-03 | 03 | 2 | ORG-04 | unit | `uv run pytest tests/unit/test_org_auth.py -x` | ❌ W0 | ⬜ pending |
| 41-04-01 | 04 | 2 | ORG-04 | unit | `uv run pytest tests/unit/test_org_api.py -x` | ❌ W0 | ⬜ pending |
| 41-04-02 | 04 | 2 | ORG-04 | unit | `uv run pytest tests/unit/test_org_api.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_org_model.py` — stubs for ORG-01 (OrganizationMember model validation)
- [ ] `tests/unit/test_org_auth.py` — stubs for ORG-04 (require_org_role tests)
- [ ] `tests/unit/test_org_api.py` — stubs for ORG-04 (org endpoint tests)
- [ ] Extend `tests/unit/test_resolve_campaign_role.py` — stubs for ORG-03 (org role additive resolution)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Seed migration promotes created_by to org_owner | ORG-02 | Data migration against live DB state | Run `docker compose exec api alembic upgrade head`, then query `SELECT * FROM organization_members WHERE role = 'org_owner'` to verify records match `organizations.created_by` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
