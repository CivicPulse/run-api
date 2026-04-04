---
phase: 64-frontend-throughput-status-ui
plan: 02
subsystem: web
tags: [imports, progress-ui, metrics, testing]
requires:
  - phase: 64-frontend-throughput-status-ui
    provides: normalized import contract and terminal status behavior
provides:
  - pure client-side throughput and ETA helper
  - progress-card rendering for throughput and ETA
  - focused component coverage for progress metrics
affects: [phase-64-throughput, import-progress-ui]
tech-stack:
  added: [web/src/lib/import-progress.ts]
  patterns:
    [
      pure metric derivation helper,
      queued and calculating UI guards for unstable ETA data,
    ]
key-files:
  created:
    - .planning/phases/64-frontend-throughput-status-ui/64-02-SUMMARY.md
    - web/src/lib/import-progress.ts
    - web/src/components/voters/ImportProgress.test.tsx
  modified:
    - web/src/components/voters/ImportProgress.tsx
key-decisions:
  - "Derived throughput and ETA purely from existing timestamps and counters instead of adding new backend fields."
  - "Displayed waiting or calculating copy until enough progress data exists for a stable ETA."
patterns-established:
  - "Import progress metrics belong in a pure helper so tests can verify time math independently of the React component."
requirements-completed: [PROG-04]
duration: 10min
completed: 2026-04-03
---

# Phase 64 Plan 02: Frontend Throughput & Status UI Summary

**Client-side throughput and ETA metrics on the live import progress card**

## Accomplishments

- Added `deriveImportProgressMetrics()` to compute rows-per-second throughput and ETA from durable import fields.
- Updated `ImportProgress` to show throughput and ETA alongside existing progress counts, with queued and calculating fallback states.
- Added component tests that lock in the metric math and the new processing/queued/partial-success render states.

## Verification

- `npm --prefix web test -- --run src/components/voters/ImportProgress.test.tsx`

## Next Phase Readiness

- The progress card now surfaces meaningful speed and remaining-time context for long-running imports.
