---
phase: 8
slug: containerization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest with pytest-asyncio |
| **Config file** | `pyproject.toml` [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/unit/ -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/unit/ -q` + Docker build smoke test
- **Before `/gsd:verify-work`:** Full suite must be green + Docker build + container run verification
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | CTR-02 | unit | `uv run pytest tests/unit/test_health.py -x -q` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | CTR-02 | unit | `uv run pytest tests/unit/test_health.py -x -q` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | CTR-01 | smoke | `docker build -t run-api:test . && docker run --rm run-api:test python -c "from app.main import create_app; print('ok')"` | ❌ W0 | ⬜ pending |
| 08-01-04 | 01 | 1 | CTR-03 | smoke | `docker run --rm run-api:test sh -c 'test ! -d /home/app/tests && test ! -d /home/app/.planning && test ! -d /home/app/.git'` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_health.py` — unit tests for `/health/live` and `/health/ready` endpoints with mocked DB
- [ ] Docker build smoke test steps documented in plan

*Existing pytest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/health/ready` returns ok with live DB | CTR-02 | Requires running PostgreSQL | Start container with DB, `curl localhost:8000/health/ready`, verify `"status": "ok"` and `"database": "connected"` |
| Container serves frontend at `/` | CTR-01 | Requires built frontend + running container | `docker run -p 8000:8000 run-api:test`, open `http://localhost:8000/`, verify SPA loads |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
