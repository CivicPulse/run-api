---
phase: 1
slug: authentication-and-multi-tenancy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `pytest tests/ -x -q --timeout=30` |
| **Full suite command** | `pytest tests/ -v --timeout=60` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/ -x -q --timeout=30`
- **After every plan wave:** Run `pytest tests/ -v --timeout=60`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01 | 1 | ALL | infrastructure | `docker compose up -d && alembic upgrade head && ruff check` | ❌ W0 | ⬜ pending |
| 01-01-T2 | 01 | 1 | AUTH-01, AUTH-04 | unit | `pytest tests/unit/test_security.py -x -v --timeout=30` | ❌ W0 | ⬜ pending |
| 01-02-T1 | 02 | 2 | AUTH-02, AUTH-03 | unit | `pytest tests/unit/test_campaign_service.py -x -v --timeout=30` | ❌ W0 | ⬜ pending |
| 01-02-T2 | 02 | 2 | AUTH-05, AUTH-06 | unit | `pytest tests/unit/test_api_campaigns.py tests/unit/test_campaign_service.py -x -v --timeout=30` | ❌ W0 | ⬜ pending |
| 01-03-T1 | 03 | 3 | AUTH-07 | unit | `pytest tests/unit/test_invite_service.py tests/unit/test_api_invites.py -x -v --timeout=30` | ❌ W0 | ⬜ pending |
| 01-03-T2 | 03 | 3 | AUTH-04, AUTH-05, AUTH-06 | integration | `pytest tests/integration/test_rls.py -x -v --timeout=60` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pyproject.toml [tool.pytest.ini_options]` — pytest configuration
- [ ] `tests/conftest.py` — shared fixtures (mock JWT, test DB session, test client)
- [ ] `tests/unit/` — directory structure
- [ ] `tests/integration/` — directory structure
- [ ] pytest, pytest-asyncio, httpx (test client) as dev dependencies via `uv add --dev`
- [ ] Docker Compose service for test PostgreSQL

*Wave 0 must complete before any task verification can run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ZITADEL org creation via Management API | AUTH-02 | Requires live ZITADEL instance | 1. Start ZITADEL dev instance 2. Call campaign creation endpoint 3. Verify org appears in ZITADEL console |
| ZITADEL invite email delivery | AUTH-07 | Requires ZITADEL email configuration | 1. Create invite 2. Check ZITADEL notification log or test mailbox |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
