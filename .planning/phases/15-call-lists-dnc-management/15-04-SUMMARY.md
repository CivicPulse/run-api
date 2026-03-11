---
phase: 15-call-lists-dnc-management
plan: 04
subsystem: ui
tags: [react, tanstack-query, tanstack-router, typescript, shadcn]

# Dependency graph
requires:
  - phase: 15-02
    provides: useCallList, useCallListEntries hooks and CallListDetail, CallListEntry types
  - phase: 15-03
    provides: call-lists directory and $callListId.tsx route file with full detail page implementation
provides:
  - CallListDetailPage with stats row, status filter tabs, and filterable entries DataTable
  - STATUS_LABELS mapping (available→Unclaimed, in_progress→Claimed, completed→Completed, max_attempts→Skipped, terminal→Error)
  - FILTER_TABS constant for server-side status filtering via useCallListEntries
affects: [15-05, 15-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Stats chip row pattern: flex gap-4 row of border bg-card px-4 py-2 chips with count + label
    - Status filter tabs passed server-side: selectedStatus === "all" ? undefined : selectedStatus
    - STATUS_LABELS Record<string, string> maps backend enum values to UI vocabulary

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.tsx
  modified: []

key-decisions:
  - "Stats chips computed client-side from entries.items array when loaded — avoids a second aggregate endpoint"
  - "Status filter tabs use shadcn Tabs with backend enum values as tab values; 'all' sentinel mapped to undefined before passing to useCallListEntries"
  - "terminal (Error) intentionally excluded from filter tabs — rare status, managers don't filter for it"
  - "Voter link uses e.stopPropagation() to prevent row click interference in DataTable"

patterns-established:
  - "Status translation pattern: STATUS_LABELS Record maps raw backend values to human-readable UI labels"
  - "Stats row pattern: flex gap-4 row of rounded-lg border bg-card chips with 2xl count + muted label"

requirements-completed: [CALL-02]

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 15 Plan 04: Call List Detail Page Summary

**Call list detail page with stats header showing entry counts by status, filterable entries DataTable with voter links, and STATUS_LABELS mapping backend enums to UI vocabulary**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T15:25:02Z
- **Completed:** 2026-03-11T15:28:07Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `$callListId.tsx` route with full call list detail page
- Stats row showing Total, Unclaimed, Claimed, Completed, Skipped counts computed from entries data
- Status filter tabs (All/Unclaimed/Claimed/Completed/Skipped) pass status server-side to useCallListEntries
- Entries DataTable with voter name as Link to voter detail, primary phone, UI-labeled status badge, assigned caller
- Empty states for both no-filter and filtered-with-no-results cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Build call list detail page with stats row and filterable entries DataTable** - `fd2f490` (feat, committed as part of Plan 03)

## Files Created/Modified

- `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.tsx` - CallListDetailPage with stats chips, Tabs filter, and DataTable — satisfies CALL-02

## Decisions Made

- Stats chips compute from entries.items (client-side count) rather than a dedicated aggregate endpoint — avoids complexity for v1 and the entries query is already loaded
- STATUS_LABELS Record maps backend enum values to human-readable labels; DataTable cells always show UI labels, never raw backend values
- Terminal (Error) status is excluded from filter tabs per plan spec — it's a rare error condition, not something managers actively filter for
- Voter name cells use `e.stopPropagation()` on the Link to prevent the DataTable row click from firing

## Deviations from Plan

None — the `$callListId.tsx` file was built exactly as specified. The file was committed as part of Plan 03's execution (which anticipated Plan 04's output), so no new commit was needed for the task itself.

## Issues Encountered

None — TypeScript compiled without errors, all 110 tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Call list detail page is live and navigable from the call lists index (Plan 03)
- Voter name cells link correctly to `/campaigns/$campaignId/voters/$voterId`
- Status filter tabs are wired to useCallListEntries status param for server-side filtering
- Ready for Phase 15-05 (Caller workflow) which builds on this detail page

---
*Phase: 15-call-lists-dnc-management*
*Completed: 2026-03-11*
