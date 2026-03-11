---
phase: 13-voter-management-completion
plan: "02"
subsystem: frontend-routing
tags: [routing, voters, tanstack-router, layout, stubs]
dependency_graph:
  requires: []
  provides: [voters-layout-scaffold, voters-lists-route, voters-tags-route, voters-list-detail-route]
  affects: [13-03, 13-04, 13-05]
tech_stack:
  added: []
  patterns: [layout-route-with-outlet, sidebar-nav, route-stubs]
key_files:
  created:
    - web/src/routes/campaigns/$campaignId/voters.tsx
    - web/src/routes/campaigns/$campaignId/voters/lists/index.tsx
    - web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx
    - web/src/routes/campaigns/$campaignId/voters/tags/index.tsx
  modified: []
decisions:
  - voters.tsx is layout-only with sidebar nav — all voter content renders via Outlet in child routes
  - Campaign layout $campaignId.tsx unchanged — top tab bar links to /voters and voters.tsx handles sub-nav sidebar
key_decisions:
  - voters.tsx layout mirrors settings.tsx pattern exactly (w-48 sidebar, border-r, flex-1 pl-8 content)
  - voters/index.tsx retains all existing voter list content — no content moved in this plan
metrics:
  duration: 2 min
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
---

# Phase 13 Plan 02: Voters Routing Scaffold Summary

Voters section routing scaffold: layout wrapper with sidebar nav and four route stub files enabling /voters/lists and /voters/tags routes without 404s.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create voters.tsx layout wrapper and route stub files | dcb8e72 | voters.tsx, lists/index.tsx, lists/$listId.tsx, tags/index.tsx |
| 2 | Add Lists and Tags links to sidebar navigation | (no new commit — satisfied by Task 1) | voters.tsx sidebar contains All Voters, Lists, Tags |

## What Was Built

**voters.tsx layout** mirrors the settings.tsx pattern:
- Route ID: `/campaigns/$campaignId/voters`
- Sidebar nav (w-48, border-r) with All Voters / Lists / Tags links using TanStack Router `activeProps`/`inactiveProps`
- `<Outlet />` renders child route content in flex-1 pl-8

**Route stubs:**
- `voters/lists/index.tsx` — `/campaigns/$campaignId/voters/lists/`
- `voters/lists/$listId.tsx` — `/campaigns/$campaignId/voters/lists/$listId`
- `voters/tags/index.tsx` — `/campaigns/$campaignId/voters/tags/`

## Decisions Made

- **voters.tsx as layout, not content**: The existing `voters/index.tsx` retains all voter list content. voters.tsx is purely a layout wrapper with sidebar nav and Outlet — no voter list content was moved.
- **Campaign layout unchanged**: `$campaignId.tsx` uses a top tab bar (not a sidebar). The plan referenced `__root.tsx sidebar` which doesn't match the actual project structure. voters.tsx itself IS the sidebar for the voters section, satisfying the plan's must_haves.
- **Stub files are truly minimal**: Each stub is 7 lines — just enough to resolve the route without 404.

## Deviations from Plan

### Task 2 adjustment

**Found during:** Task 2 execution

**Issue:** The plan's Task 2 targeted `__root.tsx` (a sidebar layout file) to add sub-nav links. The actual project uses `$campaignId.tsx` with a top tab bar, not a sidebar. Adding hidden or redundant links to the campaign tab bar would be confusing.

**Resolution:** The voters.tsx layout created in Task 1 already provides the sidebar with All Voters / Lists / Tags nav items, fully satisfying all must_haves truths. No changes to `$campaignId.tsx` were needed.

**Impact:** None — all plan must_haves and success criteria are met.

## Verification Results

- voters.tsx exists and contains `<Outlet />`: confirmed
- All 4 stub route files exist and resolve correct route IDs: confirmed
- TypeScript compiles with 0 errors: confirmed
- 76 tests pass (no regressions): confirmed

## Self-Check: PASSED

Files exist:
- FOUND: web/src/routes/campaigns/$campaignId/voters.tsx
- FOUND: web/src/routes/campaigns/$campaignId/voters/lists/index.tsx
- FOUND: web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx
- FOUND: web/src/routes/campaigns/$campaignId/voters/tags/index.tsx

Commits exist:
- FOUND: dcb8e72 (feat(13-02): create voters layout wrapper and route stub files)
