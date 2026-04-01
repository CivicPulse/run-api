---
phase: 50
slug: per-batch-commits-crash-resilience
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x with asyncio_mode=auto |
| **Config file** | pyproject.toml |
| **Quick run command** | `uv run pytest tests/ -x -q --timeout=30` |
| **Full suite command** | `uv run pytest tests/ -q --timeout=60` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/ -x -q --timeout=30`
- **After every plan wave:** Run `uv run pytest tests/ -q --timeout=60`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | RESL-01, RESL-04, RESL-05 | lint+import | `uv run ruff check app/models/import_job.py app/schemas/import_job.py app/core/config.py alembic/versions/018_add_last_committed_row.py && uv run python -c "from app.models.import_job import ImportJob; assert hasattr(ImportJob, 'last_committed_row')"` | N/A (lint) | ⬜ pending |
| 50-01-02 | 01 | 1 | RESL-01, RESL-02, RESL-05 | lint+import | `uv run ruff check app/services/storage.py app/db/rls.py && uv run python -c "from app.db.rls import commit_and_restore_rls; from app.services.storage import StorageService"` | N/A (lint) | ⬜ pending |
| 50-02-01 | 02 | 2 | RESL-01 through RESL-05 | unit | `uv run pytest tests/unit/test_batch_resilience.py -x -v` | Created by task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Plan 01 creates only model/schema/utility artifacts verified via ruff lint and Python import checks — no dedicated test stubs needed.

Plan 02 Task 1 creates `tests/unit/test_batch_resilience.py` as part of its implementation (tests written alongside production code). The `<behavior>` block in the plan specifies all 11 test cases upfront, providing equivalent design-first guidance.

No separate Wave 0 stub generation is required because:
- Plan 01 verification is ruff + Python import assertions (no test file needed)
- Plan 02 creates its own test file as part of the task action

*Existing pytest infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kill worker mid-import, verify committed rows visible | RESL-01 | Requires actual process kill | Start import, kill worker after 3+ batches, query voter count |
| Restart worker, verify resume from last batch | RESL-03 | Requires worker restart | After kill test, restart worker, verify it skips committed rows |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
