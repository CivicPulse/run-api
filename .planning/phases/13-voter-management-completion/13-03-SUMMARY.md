---
phase: 13-voter-management-completion
plan: "03"
subsystem: frontend-components
tags: [voter, filter, datatable, tdd, typescript, sheet]
dependency_graph:
  requires: [13-01, 13-02]
  provides:
    - VoterFilterBuilder reusable filter component (for 13-06 dynamic list creation)
    - Voters index with DataTable, filter panel, active chips, New Voter sheet
    - useVotersQuery cursor-based pagination hook
  affects:
    - 13-06 (VoterFilterBuilder reused for dynamic list creation)
tech_stack:
  added:
    - "@radix-ui/react-checkbox" (via shadcn Checkbox component)
  patterns:
    - TDD red-green cycle for component tests
    - VoterFilterBuilder: primary/secondary filter dimension split behind More filters toggle
    - Active filter chips as dismissible Badges between filter panel and DataTable
    - Cursor stack pattern for DataTable prev/next navigation (prevCursors stack)
    - Sheet for create form (no useFormGuard — create form, user stays on same page)
    - RequireRole(minimum="manager") gates mutative actions
key_files:
  created:
    - web/src/components/voters/VoterFilterBuilder.tsx
    - web/src/components/voters/VoterFilterBuilder.test.tsx
    - web/src/components/ui/checkbox.tsx
  modified:
    - web/src/routes/campaigns/$campaignId/voters/index.tsx
    - web/src/hooks/useVoters.ts
decisions:
  - "VoterFilterBuilder reads campaignId via useParams(strict:false) when no prop provided — gracefully falls back to empty state in tests"
  - "useVotersQuery added to useVoters.ts as cursor-based useQuery variant; existing useVoters (useInfiniteQuery) preserved for backward compatibility"
  - "Checkbox component installed via shadcn (not present in the codebase) — auto-fixed as Rule 3 (missing dependency)"
metrics:
  duration: "4 min 24 sec"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  tests_added: 7
  tests_total: 83
---

# Phase 13 Plan 03: VoterFilterBuilder + Voters Index Upgrade Summary

**One-liner:** VoterFilterBuilder component with 5 primary + 8 secondary filter dimensions, TDD test suite (7 tests), and voters index upgraded from infinite-scroll raw table to DataTable with collapsible filter panel, active filter chips, and New Voter creation sheet.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build VoterFilterBuilder component with tests (TDD) | 1908d9e | VoterFilterBuilder.tsx, VoterFilterBuilder.test.tsx, checkbox.tsx |
| 2 | Upgrade voters index to DataTable + filter panel + New Voter sheet | 643b1cf | voters/index.tsx, useVoters.ts |

## What Was Built

### VoterFilterBuilder (web/src/components/voters/VoterFilterBuilder.tsx)

Primary filter dimensions (always visible):
- **Party**: multi-select Checkboxes for DEM, REP, NPA, LIB, GRN, OTH — maps to `parties?: string[]`
- **Age Range**: Min/Max number inputs — maps to `age_min`, `age_max`
- **Voting History**: Voted in + Did not vote in checkboxes for last 9 election years — maps to `voted_in[]`, `not_voted_in[]`
- **Tags**: Click-to-toggle Badges from `useCampaignTags` — maps to `tags?: string[]`
- **City**: text input — maps to `city`

Secondary filter dimensions (under More filters toggle, collapsed by default):
- Zip Code, State, Gender, Precinct, Congressional District
- Registered After / Before (date inputs)
- Filter Logic (AND/OR radio)

Props interface: `{ value: VoterFilter, onChange: (filters: VoterFilter) => void, className?: string, campaignId?: string }`

### Voters Index Upgrade (voters/index.tsx)

- **Page header**: "All Voters" title + Filters toggle button + RequireRole(manager) New Voter button
- **Filter panel**: Collapsible, renders VoterFilterBuilder when Filters is clicked
- **Active filter chips**: Dismissible Badges for each non-empty filter field, with "Clear all" shortcut
- **DataTable**: Replaces raw Table + infinite scroll. Server-side sorting (sort_by, sort_dir), cursor-based pagination via prevCursors stack pattern
- **New Voter sheet**: react-hook-form + zod schema, creates voter via useCreateVoter, toast.success on submit, resets form on success

### useVotersQuery (web/src/hooks/useVoters.ts)

Added cursor-based `useQuery` variant accepting `{ cursor, pageSize, sortBy, sortDir, filters }`. The existing `useVoters` (useInfiniteQuery) is preserved for any other consumers.

## Verification Results

- VoterFilterBuilder exists: CONFIRMED
- VoterFilterBuilder tests pass: 7/7 PASSED
- Voters index uses DataTable: CONFIRMED (DataTable imported and rendered)
- No useInfiniteQuery in voters index: CONFIRMED (not found)
- TypeScript: 0 errors
- Full test suite: 83 tests passing (11 test files, 0 failures)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing Dependency] shadcn Checkbox component not present**
- **Found during:** Task 1 (GREEN phase — component compile failed)
- **Issue:** VoterFilterBuilder imports `@/components/ui/checkbox` which did not exist in the project. All other shadcn components were present but Checkbox had not been added.
- **Fix:** Ran `npx shadcn@latest add checkbox` to install the component to `web/src/components/ui/checkbox.tsx`
- **Files modified:** web/src/components/ui/checkbox.tsx (created), web/package.json, web/package-lock.json
- **Commit:** 1908d9e

**2. [Rule 1 - Bug] Test 7 used `getByText(/tags/i)` which matched multiple elements**
- **Found during:** Task 1 (GREEN phase — test 7 failed with "Found multiple elements" error)
- **Issue:** The Tags section renders both a "Tags" label and "No tags available" paragraph text, causing `getByText` to throw on ambiguity.
- **Fix:** Changed assertion to `getAllByText(/tags/i).length > 0` which handles multiple matches correctly.
- **Files modified:** VoterFilterBuilder.test.tsx
- **Commit:** 1908d9e (same commit — fixed before committing)

## Self-Check

### Files Exist
- web/src/components/voters/VoterFilterBuilder.tsx: FOUND
- web/src/components/voters/VoterFilterBuilder.test.tsx: FOUND
- web/src/components/ui/checkbox.tsx: FOUND
- web/src/routes/campaigns/$campaignId/voters/index.tsx: FOUND (modified)
- web/src/hooks/useVoters.ts: FOUND (modified)

### Commits Exist
- 1908d9e: FOUND
- 643b1cf: FOUND

## Self-Check: PASSED
