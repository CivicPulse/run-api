---
phase: 15-call-lists-dnc-management
plan: 02
subsystem: ui
tags: [react, tanstack-query, tanstack-router, typescript]

# Dependency graph
requires:
  - phase: 15-01
    provides: backend call-list and DNC API endpoints
provides:
  - CallListSummary, CallListDetail, CallListEntry, CallListCreate, CallListUpdate TypeScript types
  - DNCEntry, DNCImportResult TypeScript types
  - useCallLists, useCallList, useCallListEntries, useCreateCallList, useUpdateCallList, useDeleteCallList hooks
  - useDNCEntries, useAddDNCEntry, useDeleteDNCEntry, useImportDNC hooks
  - PhoneBankingLayout sidebar with Call Lists and DNC List nav items
  - phone-banking/index.tsx redirect to call-lists
affects: [15-03, 15-04, 15-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - callListKeys query key factory for cache invalidation
    - dncKeys query key factory for cache invalidation
    - useImportDNC uses body: formData (not json:) for multipart upload

key-files:
  created:
    - web/src/types/call-list.ts
    - web/src/types/dnc.ts
    - web/src/hooks/useCallLists.ts
    - web/src/hooks/useDNC.ts
    - web/src/routes/campaigns/$campaignId/phone-banking/index.tsx
  modified:
    - web/src/routes/campaigns/$campaignId/phone-banking.tsx
    - web/src/routeTree.gen.ts

key-decisions:
  - "useCallLists and useDNC use @/api/client (not @/lib/api) — matching existing project hook pattern"
  - "useDNCEntries typed as DNCEntry[] (not paginated) — backend returns plain array"
  - "useImportDNC uses body: formData (not json:) — multipart upload pattern, browser sets boundary"
  - "PhoneBankingLayout sidebar nav has no end:true on Call Lists — sub-route active matching needed"

patterns-established:
  - "Query key factory pattern: callListKeys.all/detail/entries and dncKeys.all for consistent invalidation"
  - "Sidebar layout pattern: phone-banking.tsx mirrors voters.tsx exactly — h1 header + border-r nav + flex-1 Outlet"
  - "Index redirect via beforeLoad throw redirect() — consistent with settings and voters patterns"

requirements-completed: [CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, CALL-07, CALL-08]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 15 Plan 02: Type Contracts, Hook Layer, and Sidebar Layout Scaffold Summary

**TypeScript types + TanStack Query hooks for call lists and DNC, plus phone-banking.tsx converted from single-page to sidebar layout with Call Lists and DNC List sub-navigation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T15:19:54Z
- **Completed:** 2026-03-11T15:21:58Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created 2 type files providing all shapes for plans 03–05 to import
- Created 6-hook call list layer and 4-hook DNC layer with full query key factories
- Converted phone-banking.tsx from content page to sidebar layout with Outlet, matching voters.tsx pattern exactly
- Added phone-banking/index.tsx redirect and registered new route in routeTree.gen.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create type files for call lists and DNC** - `71ddfae` (feat)
2. **Task 2: Create hook files and convert phone-banking.tsx to sidebar layout** - `9ba069e` (feat)

## Files Created/Modified

- `web/src/types/call-list.ts` - CallListSummary, CallListDetail, CallListEntry, CallListCreate, CallListUpdate interfaces
- `web/src/types/dnc.ts` - DNCEntry, DNCImportResult interfaces
- `web/src/hooks/useCallLists.ts` - 6 hooks with callListKeys query key factory
- `web/src/hooks/useDNC.ts` - 4 hooks with dncKeys query key factory; useImportDNC uses body: formData
- `web/src/routes/campaigns/$campaignId/phone-banking.tsx` - Replaced content page with PhoneBankingLayout sidebar
- `web/src/routes/campaigns/$campaignId/phone-banking/index.tsx` - Redirect to /phone-banking/call-lists via beforeLoad
- `web/src/routeTree.gen.ts` - Registered new phone-banking index route

## Decisions Made

- Used `@/api/client` import (not `@/lib/api` as written in plan) — the plan specified the wrong path; project uses `@/api/client` consistently across all hooks
- `useDNCEntries` typed as `DNCEntry[]` directly matching the non-paginated backend response
- `useImportDNC` uses `body: formData` (not `json:`) so browser sets the multipart/form-data Content-Type boundary automatically
- Campaign nav ordering confirmed: Phone Banking is at index 3 (after Voters at 1, before Volunteers at 5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected API client import path**
- **Found during:** Task 2 (creating hook files)
- **Issue:** Plan specified `import { api } from "@/lib/api"` but project uses `@/api/client` (file is `web/src/api/client.ts`)
- **Fix:** Used `@/api/client` consistent with all other hook files in the project
- **Files modified:** web/src/hooks/useCallLists.ts, web/src/hooks/useDNC.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 9ba069e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — wrong import path in plan)
**Impact on plan:** Essential correction; using the wrong path would have caused compile errors. No scope creep.

## Issues Encountered

None beyond the import path deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Types and hooks ready for plans 03 (Call Lists UI), 04 (DNC List UI), 05 (caller workflow)
- PhoneBankingLayout sidebar is wired and will activate sub-route links once call-lists and dnc routes are created
- All 14 tests remain green
