---
phase: 64-frontend-throughput-status-ui
plan: 01
subsystem: api
tags: [imports, frontend-contract, status, api]
requires:
  - phase: 63-secondary-work-offloading
    provides: terminal backend status and merged error report support
provides:
  - explicit `error_report_url` response field
  - terminal frontend handling for `completed_with_errors`
  - normalized import status labels and polling logic
affects: [phase-64-frontend-status, import-api-contract, import-hooks]
tech-stack:
  added: []
  patterns:
    [
      separate raw storage key from browser download URL,
      shared terminal-status helper at the hook boundary,
    ]
key-files:
  created:
    - .planning/phases/64-frontend-throughput-status-ui/64-01-SUMMARY.md
  modified:
    - app/schemas/import_job.py
    - app/api/v1/imports.py
    - web/src/types/import-job.ts
    - web/src/hooks/useImports.ts
    - web/src/hooks/useImports.test.ts
key-decisions:
  - "Added a dedicated `error_report_url` field instead of overloading `error_report_key` with signed URLs."
  - "Treated `completed_with_errors` as terminal in wizard step restoration and polling shutdown."
patterns-established:
  - "Import hook helpers now own terminal-status reasoning and user-facing status labels."
requirements-completed: [PROG-05]
duration: 8min
completed: 2026-04-03
---

# Phase 64 Plan 01: Frontend Throughput & Status UI Summary

**Contract cleanup for partial-success imports and direct error-report access**

## Accomplishments

- Added `error_report_url` to the import response contract and populated it from both detail and history endpoints when a merged report exists.
- Updated the frontend import type union to include `completed_with_errors` plus the recovery/progress fields already exposed by the API.
- Centralized terminal-status and label handling in the import hooks so partial-success jobs stop polling and restore to the completion step.

## Verification

- `npm --prefix web test -- --run src/hooks/useImports.test.ts`
- `uv run pytest tests/unit/test_batch_resilience.py -x`

## Next Phase Readiness

- The frontend can now reason about partial-success imports and browser-safe error-report URLs consistently across import surfaces.
