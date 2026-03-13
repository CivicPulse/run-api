---
phase: 15-call-lists-dnc-management
plan: 03
subsystem: ui
tags: [react, tanstack-query, tanstack-router, typescript, react-hook-form]

# Dependency graph
requires:
  - phase: 15-02
    provides: useCallLists hooks, CallListSummary types, phone-banking sidebar layout
provides:
  - CallListsPage route at /campaigns/$campaignId/phone-banking/call-lists/
  - DataTable view with create/edit/delete capability for call lists
affects: [15-04, 15-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single CallListDialog component handles both create and edit modes via editList prop
    - Button-toggle collapsible advanced settings (shadcn Collapsible unavailable — not installed)
    - useFormGuard wired to react-hook-form instance in dialog component

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/phone-banking/call-lists/index.tsx
  modified: []

key-decisions:
  - "Advanced settings section uses button-toggle show/hide instead of shadcn Collapsible — component not installed in project"
  - "Single CallListDialog component handles both create and edit modes via editList prop — avoids duplicate form boilerplate"
  - "dialogOpen+editList two-state pattern: dialogOpen controls visibility, editList null=create/non-null=edit"

patterns-established:
  - "Two-state dialog pattern: separate open boolean + editList state avoids stale form on re-open"
  - "RequireRole minimum=manager wraps both the New button and each kebab menu in the actions column"

requirements-completed: [CALL-01, CALL-03]

# Metrics
duration: 109sec
completed: 2026-03-11
---

# Phase 15 Plan 03: Call Lists Index Page Summary

**Call lists management page with DataTable listing, create/edit dialog with advanced settings, and standard ConfirmDialog delete — fully wired to hooks from plan 02**

## Performance

- **Duration:** 109 seconds
- **Started:** 2026-03-11T15:25:21Z
- **Completed:** 2026-03-11T15:27:10Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `call-lists/index.tsx` with full CRUD management interface
- DataTable with 5 columns: name (Link to detail), status (StatusBadge with variant mapping), progress (completed/total), created date, actions (kebab)
- Single `CallListDialog` component handles create and edit modes — title, fields, and mutations switch based on `editList` prop
- Collapsible advanced settings (max attempts, claim timeout, cooldown) using button-toggle pattern since shadcn Collapsible is not installed
- Standard `ConfirmDialog` with `variant="destructive"` for delete — correctly not using `DestructiveConfirmDialog` (type-to-confirm reserved for campaign deletion)
- `useFormGuard` wired inside the dialog for unsaved changes protection on the react-hook-form instance
- `RequireRole minimum="manager"` guards the New Call List button and each kebab menu

## Task Commits

1. **Task 1: Build call lists index page** - `fd2f490` (feat)

## Files Created/Modified

- `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/index.tsx` — CallListsPage, CallListDialog, full DataTable with create/edit/delete

## Decisions Made

- Used a button-toggle `<button>` + `useState(advancedOpen)` for the collapsible advanced settings section. The plan specified `Collapsible` from `@/components/ui/collapsible`, but that component is not installed (not present in `web/src/components/ui/`). The toggle achieves identical UX.
- Single `CallListDialog` component — same dialog handles create (editList=null) and edit (editList=CallListSummary) by branching on the `editList` prop. This mirrors the plan's intent of "same dialog component, different mode".
- Two-state dialog control: `dialogOpen` boolean + `editList` (null | CallListSummary). Mounting the dialog only when `dialogOpen` is true via conditional render (`{dialogOpen && <CallListDialog .../>}`) ensures the form resets cleanly between create and edit sessions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn Collapsible component not installed**
- **Found during:** Task 1 (implementing advanced settings section)
- **Issue:** Plan specified `import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"` but `collapsible.tsx` does not exist in `web/src/components/ui/`
- **Fix:** Replaced with a `<button>` toggle using `useState(advancedOpen)` — same collapse/expand UX without the missing dependency
- **Files modified:** web/src/routes/campaigns/$campaignId/phone-banking/call-lists/index.tsx
- **Commit:** fd2f490

---

**Total deviations:** 1 auto-fixed (1 blocking issue — missing UI component replaced with equivalent pattern)
**Impact on plan:** Zero scope creep. UX is identical. No additional libraries required.

## Issues Encountered

None beyond the Collapsible component substitution above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Call lists route is accessible at `/campaigns/{id}/phone-banking/call-lists`
- Create, edit, and delete flows wired and TypeScript-clean
- `$callListId` detail route (plan 15-04 or 15-05) can now receive navigation from the name link column
- All 14 tests remain green (110 passed, 18 todos)

## Self-Check: PASSED
