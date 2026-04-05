---
phase: 57-recovery-engine-completion-hardening
plan: 01
subsystem: imports, worker
tags: [import-recovery, advisory-locks, finalization]
requires:
  - phase: 56-schema-orphan-detection
    provides: "stale import metadata and orphan scan helpers"
provides:
  - "Startup recovery scan that queues fresh recovery work"
  - "Recovery task that resumes from last_committed_row"
  - "Advisory-lock protection for processing and recovery"
  - "Explicit hardening for post-EOF finalization"
affects: [58-test-coverage]
tech-stack:
  added: []
  patterns:
    - "Per-import advisory locking"
    - "Recovery via fresh task enqueue"
key-files:
  created: []
  modified:
    - app/tasks/import_task.py
    - app/services/import_recovery.py
    - app/services/import_service.py
    - scripts/worker.py
key-decisions:
  - "Queue recovery as new work from worker startup"
  - "Finalize exhausted imports directly during recovery when rows are already consumed"
patterns-established:
  - "Skip terminal imports before lock acquisition"
requirements-completed: [RECV-01, RECV-02, RECV-03, RECV-04, HARD-01, HARD-02]
duration: 1d
completed: 2026-04-01
---

# Phase 57 Plan 01 Summary

Phase 57 turned orphan detection into actual recovery behavior. The worker now scans for stale imports on startup, logs each candidate, and enqueues a fresh `recover_import` task. Both normal processing and recovery claim the same advisory lock, recovery skips terminal or fresh jobs, and source-exhausted imports can be finalized directly instead of being left in `PROCESSING`.
