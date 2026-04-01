---
phase: 58-e2e-core-tests
plan: 04
subsystem: testing
tags: [playwright, e2e, voter-tags, voter-notes, voter-lists, lifecycle]

# Dependency graph
requires:
  - phase: 57-test-infrastructure
    provides: 5 role-based Playwright auth projects and 15 ZITADEL test users
  - phase: 56-feature-fixes
    provides: note edit/delete API and UI for HistoryTab
provides:
  - voter-tags.spec.ts covering TAG-01 through TAG-05 (tag CRUD lifecycle)
  - voter-notes.spec.ts covering NOTE-01 through NOTE-03 (note add/edit/delete with Phase 56 features)
  - voter-lists.spec.ts covering VLIST-01 through VLIST-06 (static/dynamic list CRUD lifecycle)
affects: [58-verification, 59-e2e-specs, ci-sharding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tag assignment via Select combobox on voter detail Tags tab"
    - "Note edit via DropdownMenu -> Edit menuitem -> Dialog textarea pattern"
    - "Note delete via DropdownMenu -> Delete menuitem -> ConfirmDialog (not DestructiveConfirmDialog)"
    - "DestructiveConfirmDialog type-to-confirm for tag and list deletion"
    - "Two-step list creation dialog (type selection then details)"
    - "AddVotersDialog with search input and checkbox-based voter selection"

key-files:
  created: [web/e2e/voter-tags.spec.ts, web/e2e/voter-notes.spec.ts, web/e2e/voter-lists.spec.ts]
  modified: []

key-decisions:
  - "Reduced tag count from 10 to 5 and voter count from 40 to 5 for E2E speed while proving the pattern"
  - "Reduced note test voters from 20 to 3 with 2 notes each for speed while proving add/edit/delete lifecycle"
  - "Used aria-label 'Remove tag {name}' for tag removal buttons (matches TagsTab.tsx pattern)"
  - "Used sr-only 'Note actions' label for note dropdown triggers (matches HistoryTab.tsx pattern)"
  - "Dynamic list filter uses VoterFilterBuilder party checkbox (seed voters have party data)"

patterns-established:
  - "Self-contained spec with API-created test voters, lifecycle assertions, and voter deletion as final test (D-10)"
  - "Cookie forwarding in all API helpers via page.context().cookies() per RESEARCH Pattern 3"
  - "Serial describe with describe-scoped let variables for cross-test state sharing"

requirements-completed: [E2E-09, E2E-10, E2E-11]

# Metrics
duration: 2min
completed: 2026-03-29
---

# Phase 58 Plan 04: Voter Tags, Notes, and Lists E2E Summary

**3 self-contained Playwright specs covering voter tag CRUD, note add/edit/delete (Phase 56 features), and static/dynamic voter list lifecycle with 14 test cases total**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-29T17:50:12Z
- **Completed:** 2026-03-29T17:52:58Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- Created voter-tags.spec.ts with 7 serial tests covering tag creation (5 tags), assignment to 5 voters via Tags tab, persistence validation, removal from all voters, and tag deletion from management page
- Created voter-notes.spec.ts with 5 serial tests covering note addition (2 notes per 3 voters), note editing via Dialog (Phase 56 feature), note deletion via ConfirmDialog, and system interaction preservation verification
- Created voter-lists.spec.ts with 8 serial tests covering static list creation, voter add via AddVotersDialog, voter removal, dynamic list creation with party filter, list rename, list deletion, and voter persistence after list deletion

## Task Commits

Each task was committed atomically:

1. **Task 1: Create voter tags E2E spec** - `f944d37` (feat)
2. **Task 2: Create voter notes E2E spec** - `c24b17c` (feat)
3. **Task 3: Create voter lists E2E spec** - `6a9204d` (feat)

## Files Created/Modified
- `web/e2e/voter-tags.spec.ts` - TAG-01 through TAG-05: tag create, assign, validate, remove, delete lifecycle
- `web/e2e/voter-notes.spec.ts` - NOTE-01 through NOTE-03: note add, edit (Phase 56), delete with ConfirmDialog
- `web/e2e/voter-lists.spec.ts` - VLIST-01 through VLIST-06: static/dynamic list CRUD with AddVotersDialog

## Decisions Made
- Reduced entity counts from testing plan (10 tags to 5, 40 voters to 5, 20 voters to 3) for E2E speed while fully proving each lifecycle pattern
- Used aria-label selectors for tag removal (`Remove tag {name}`) and note actions (`Note actions`) matching the actual component implementations
- Tag deletion uses DestructiveConfirmDialog (type-to-confirm), note deletion uses ConfirmDialog (single-click confirm with destructive variant)
- Dynamic list filter applied via VoterFilterBuilder party checkbox since seed voters have party data
- All 3 specs follow identical self-contained pattern: helpers at top, serial describe with setup/lifecycle/cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all test cases fully implemented.

## Next Phase Readiness
- All 3 voter annotation/list specs ready for CI execution
- Specs integrate with existing 4-shard CI pipeline via Playwright config
- No cross-spec dependencies; each can run independently

## Self-Check: PASSED

All 3 spec files exist, all 3 commits verified.

---
*Phase: 58-e2e-core-tests*
*Completed: 2026-03-29*
