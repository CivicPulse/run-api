---
phase: 68-progress-metric-accuracy-validation-closeout
plan: 01
subsystem: imports
tags: [progress, frontend, validation, closeout]
requires:
  - phase: 67-chunk-import-cleanup-deletion-semantics
    provides: clean runtime and milestone traceability baseline
provides:
  - durable `processing_started_at` contract for import progress metrics
  - corrected frontend throughput and ETA timing
  - Nyquist-compliant validation artifacts for Phases 59 and 60
affects: [import-progress-ui, import-runtime, validation-artifacts, milestone-audit]
tech-stack:
  added: []
  patterns:
    - explicit backend timestamp contracts for frontend-derived metrics
key-files:
  created:
    - .planning/phases/68-progress-metric-accuracy-validation-closeout/68-01-SUMMARY.md
  modified:
    - app/models/import_job.py
    - app/schemas/import_job.py
    - app/services/import_service.py
    - app/tasks/import_task.py
    - web/src/types/import-job.ts
    - web/src/lib/import-progress.ts
    - web/src/components/voters/ImportProgress.test.tsx
    - tests/unit/test_import_service.py
    - .planning/phases/59-chunk-schema-configuration/59-VALIDATION.md
    - .planning/phases/60-parent-split-parallel-processing/60-VALIDATION.md
key-decisions:
  - "Expose a durable processing-start timestamp instead of trying to infer real work start from `created_at`."
  - "Normalize the old validation docs to the later Nyquist frontmatter contract instead of treating them as special cases."
patterns-established:
  - "Frontend throughput displays should derive from server-owned lifecycle timestamps, not upload-time metadata."
requirements-completed: []
duration: 12min
completed: 2026-04-03
---

# Phase 68 Plan 01: Progress Metric Accuracy & Validation Closeout Summary

**Import throughput now measures actual processing time, and the old validation debt is closed**

## Accomplishments

- Added `processing_started_at` to the import job model, schema, task flow, and migration path.
- Updated the frontend import progress helper to derive throughput and ETA from `processing_started_at` instead of `created_at`.
- Extended frontend and backend tests so the revised metric contract is covered on both sides.
- Rewrote the Phase 59 and 60 validation strategy files into the compliant Nyquist frontmatter format and marked their wave-0 obligations complete.

## Verification

- `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_cancel.py -x`
- `npm test -- --run src/components/voters/ImportProgress.test.tsx`

## Next Phase Readiness

- v1.11 no longer carries open audit debt and is ready to stand as a fully closed milestone.
