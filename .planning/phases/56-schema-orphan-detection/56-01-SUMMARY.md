---
phase: 56-schema-orphan-detection
plan: 01
subsystem: imports, worker
tags: [import-recovery, orphan-detection, schema, logging]
requires: []
provides:
  - "ImportJob progress and orphan metadata fields"
  - "Configurable orphan threshold with default 30 minutes"
  - "Persistent orphan scan diagnostics for stale imports"
affects: [57-recovery-engine-completion-hardening, 58-test-coverage]
tech-stack:
  added: []
  patterns:
    - "Application-owned progress heartbeat"
    - "Persisted orphan detection metadata"
key-files:
  created:
    - alembic/versions/021_import_recovery_metadata.py
    - app/services/import_recovery.py
  modified:
    - app/core/config.py
    - app/models/import_job.py
    - app/schemas/import_job.py
    - app/services/import_service.py
key-decisions:
  - "Use last_progress_at as the durable stale-detection signal"
  - "Persist orphaned_at and orphaned_reason on the import job for later recovery and debugging"
patterns-established:
  - "Progress timestamps update only on durable import boundaries"
requirements-completed: [ORPH-01, ORPH-02, ORPH-03, ORPH-04]
duration: 1d
completed: 2026-04-01
---

# Phase 56 Plan 01 Summary

Phase 56 established the detection layer for import recovery. The import job schema now tracks durable progress timestamps and orphan metadata, the application config exposes a safe default staleness threshold, and the import service updates progress only at durable checkpoints. The new orphan scan classifies stale processing jobs and persists recovery-ready metadata instead of relying on queue internals.
