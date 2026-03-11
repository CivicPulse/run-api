---
phase: 14-voter-import-wizard
plan: "04"
subsystem: ui
tags: [react, tanstack-router, tanstack-query, datatable, polling, status-badges]

# Dependency graph
requires:
  - phase: 14-voter-import-wizard-03
    provides: Wizard step components (DropZone, ColumnMappingTable, MappingPreview, ImportProgress), import wizard route at voters/imports/new
  - phase: 14-voter-import-wizard-02
    provides: useImports hook with conditional 3-second polling, useImportJob hook, import API client
  - phase: 14-voter-import-wizard-01
    provides: ImportJob and ImportStatus types, backend import endpoints
provides:
  - Import history page at voters/imports/ with DataTable, status badges, auto-polling, kebab menu
  - Voters sidebar nav updated with Imports link making the feature discoverable
  - Full voter import wizard and history flow verified end-to-end (IMPT-06)
affects:
  - future phases that build on voters section sidebar nav
  - phase-15 and beyond that depend on complete voter import feature

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DataTable with conditional auto-polling via useImports refetchInterval
    - StatusBadge with importStatusVariant mapping for 5 import states
    - Kebab menu ColumnDef cell renderer pattern (from Phase 12/13) applied to import history
    - EmptyState CTA pattern for zero-data states

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/voters/imports/index.tsx
  modified:
    - web/src/routes/campaigns/$campaignId/voters.tsx

key-decisions:
  - "Error report download: disabled DropdownMenuItem shown when error_report_key present but no /error-report backend endpoint confirmed — avoids constructing MinIO URLs client-side"
  - "useImports polling built in Plan 02 handles the 3-second auto-poll automatically — index.tsx only consumes the hook"

patterns-established:
  - "Import history pattern: useImports(campaignId) + DataTable + StatusBadge + EmptyState CTA"
  - "Sidebar nav extension: add to navItems array in voters.tsx layout for section-level discovery"

requirements-completed: [IMPT-06]

# Metrics
duration: ~15min
completed: 2026-03-11
---

# Phase 14 Plan 04: Import History Page and Full Wizard Verification Summary

**Import history page with polling DataTable and status badges wired to voters sidebar nav, closing IMPT-06 and verifying the full wizard flow end-to-end.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-11T04:17:34Z
- **Completed:** 2026-03-11T04:29:36Z
- **Tasks:** 2 (1 auto, 1 human-verify)
- **Files modified:** 2

## Accomplishments

- Import history page at `voters/imports/` showing all past import jobs with filename, status badge, row counts, and kebab menu
- Status badges use correct color variants: pending=grey, processing/queued=blue, completed=green, failed=red
- DataTable auto-polls every 3 seconds when any job is queued or processing (via useImports hook built in Plan 02)
- Empty state with "No imports yet" CTA navigates to the wizard
- "Imports" link added to voters sidebar nav alongside All Voters, Lists, Tags
- Full wizard flow (upload, column mapping, mapping preview, progress monitoring, completion, history) verified by user across all 10 checkpoint checks

## Task Commits

Each task was committed atomically:

1. **Task 1: Import history page and sidebar nav update** - `ea8e7db` (feat)
2. **Task 2: Visual verification of full import wizard flow** - Human-verify checkpoint, approved by user

**Plan metadata:** (docs commit — created with this summary)

## Files Created/Modified

- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx` - Import history page: DataTable with StatusBadge per row, polling via useImports, kebab menu (View details + disabled Download error report), EmptyState CTA
- `web/src/routes/campaigns/$campaignId/voters.tsx` - Voters sidebar nav updated with "Imports" navItem

## Decisions Made

- Error report download: displayed as a disabled DropdownMenuItem when `error_report_key` is truthy but no dedicated `/error-report` backend endpoint was confirmed — does not construct MinIO URLs client-side per plan guidance.
- useImports polling strategy fully encapsulated in the hook (Plan 02) — the history page is a pure consumer with no polling logic of its own.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- IMPT-06 closed. All seven IMPT requirements (IMPT-01 through IMPT-07) are now implemented and verified.
- Phase 14 voter import wizard is feature-complete.
- Phase 15 (or the next roadmap phase) can proceed from a clean state.

---
*Phase: 14-voter-import-wizard*
*Completed: 2026-03-11*
