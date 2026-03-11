---
phase: 13-voter-management-completion
plan: "06"
subsystem: frontend-voter-lists
tags: [voter, lists, datatable, dynamic-lists, static-lists, typescript]
dependency_graph:
  requires:
    - 13-01 (useVoterLists hooks with correct URLs)
    - 13-02 (voters routing scaffold with stubs)
    - 13-03 (VoterFilterBuilder component)
  provides:
    - Voter lists index with DataTable (VOTR-07)
    - Create/Edit/Delete list dialogs (VOTR-08)
    - List detail for static and dynamic lists (VOTR-09)
    - AddVotersDialog for static list member management
  affects:
    - Campaign staff canvassing and phone banking workflows
    - Any plans consuming voter list membership data
tech_stack:
  added: []
  patterns:
    - Two-step create dialog (type selector → details form)
    - filter_query JSON serialization/deserialization for dynamic lists
    - Kebab menu via DropdownMenu in DataTable actions column
    - DestructiveConfirmDialog with confirmText for delete safety
    - Debounced search in AddVotersDialog using useEffect + setTimeout
key_files:
  created:
    - web/src/components/voters/AddVotersDialog.tsx
  modified:
    - web/src/routes/campaigns/$campaignId/voters/lists/index.tsx
    - web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx
decisions:
  - "Two-step New List dialog: type selector first, then name/filter form — avoids confusing mixed form"
  - "Dynamic list filter_query serialized as JSON.stringify(VoterFilter) — consistent with backend contract"
  - "AddVotersDialog takes first page of useVoters infinite query (max 20 results) for simplicity"
  - "Remove button in static list member table calls useRemoveListMembers with single voter_id array"
metrics:
  duration: "4 min 33 sec"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  tests_added: 0
  tests_total: 83
---

# Phase 13 Plan 06: Voter Lists Feature Summary

**One-liner:** Voter lists index with DataTable and two-step New/Edit/Delete dialogs, plus list detail pages handling both static member management and dynamic filter criteria editing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build voter lists index with DataTable and New/Edit/Delete list dialogs | bd1f26e | lists/index.tsx |
| 2 | Build list detail page and AddVotersDialog | 72d2a2d | lists/$listId.tsx, AddVotersDialog.tsx |

## What Was Built

### Voter Lists Index (lists/index.tsx)

Full lists index replacing the stub:

- **DataTable** with columns: name (link to detail), type badge (Dynamic/Static), voter count (right-aligned), created date, actions kebab menu
- **RequireRole(manager)** gates: + New List button and kebab menu visibility
- **New List dialog** — two-step flow:
  1. Type selector screen: two cards (Static List / Dynamic List) with descriptions
  2. Details form: name input for static; name + VoterFilterBuilder for dynamic
- **Edit dialog** — pre-populates name, parses filter_query back to VoterFilter for dynamic lists
- **Delete** — DestructiveConfirmDialog with confirmText={list.name}

### List Detail Page ($listId.tsx)

Handles both list types in a single component:

**Static list:**
- Member DataTable: voter name (link to $voterId), party, city, Remove button (RequireRole manager)
- "+ Add Voters" button opens AddVotersDialog
- Empty state: "No members yet. Add voters to get started."

**Dynamic list:**
- Filter criteria summary: chips showing each active filter key/value parsed from filter_query
- "Edit Filters" button opens Dialog with VoterFilterBuilder pre-populated
- On save: calls useUpdateVoterList with JSON.stringify(newFilters)
- Member table: same as static but no Remove button (membership is automatic)

### AddVotersDialog (AddVotersDialog.tsx)

Search-and-select dialog for adding voters to static lists:
- Debounced search input (300ms, manual useEffect pattern — usehooks-ts not installed)
- Results from useVoters first page, max 20 results
- Checkbox selection per row (name, party, city displayed)
- "Add N Voter(s)" submit button calls useAddListMembers.mutateAsync
- Resets search and selection on close

## Verification Results

- Lists index DataTable: confirmed (line 236)
- VoterFilterBuilder used for dynamic lists: confirmed (lines 292, 350)
- JSON.stringify for filter_query: confirmed (lines 74, 113)
- AddVotersDialog exists: `/web/src/components/voters/AddVotersDialog.tsx`
- TypeScript: 0 errors
- Tests: 83 passing (0 regressions)

## Deviations from Plan

### Auto-fixed: VoterFilterBuilder missing (dependency not executed)

**Found during:** Task 1 planning
**Issue:** Plan 13-03 (which was supposed to build VoterFilterBuilder) had no SUMMARY.md, but the component was already present in the filesystem (13-03 had been executed but its SUMMARY.md was never created). VoterFilterBuilder.tsx existed and its tests passed.
**Resolution:** No action needed — component was present and functional. Proceeded directly to Task 1.

None — plan executed as written. VoterFilterBuilder was available as expected.

## Self-Check

### Files Exist
- web/src/routes/campaigns/$campaignId/voters/lists/index.tsx: FOUND
- web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx: FOUND
- web/src/components/voters/AddVotersDialog.tsx: FOUND

### Commits Exist
- bd1f26e: FOUND
- 72d2a2d: FOUND

## Self-Check: PASSED
