---
phase: 49
slug: procrastinate-integration-worker-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x with asyncio_mode=auto |
| **Config file** | pyproject.toml [tool.pytest.ini_options] |
| **Quick run command** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | BGND-02 | unit | `uv run pytest tests/unit/test_procrastinate_app.py -x` | ❌ W0 | ⬜ pending |
| 49-01-02 | 01 | 1 | BGND-02 | unit | `uv run pytest tests/unit/test_import_task.py -x` | ✅ | ⬜ pending |
| 49-02-01 | 02 | 1 | BGND-01 | unit | `uv run pytest tests/unit/test_import_service.py -x` | ✅ | ⬜ pending |
| 49-03-01 | 03 | 2 | MEMD-02 | integration | `docker compose config --services \| grep worker` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_procrastinate_app.py` — stubs for Procrastinate App creation, task registration, connector setup
- [ ] Update `tests/unit/test_import_task.py` — adapt existing stubs for Procrastinate task signature
- [ ] Verify `procrastinate[psycopg]` installs without conflicts alongside asyncpg

*Existing test infrastructure (pytest, conftest.py fixtures) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Worker survives pod restart | BGND-02 | Requires docker compose restart | 1. Start import 2. `docker compose restart worker` 3. Verify job resumes |
| K8s worker deployment | MEMD-02 | Requires K8s cluster | 1. Apply manifests 2. Verify pod starts 3. Check health endpoint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
