---
phase: 27-wire-advanced-filters-to-backend
plan: 02
subsystem: ui
tags: [react, tanstack-query, typescript, ky, post-search]

# Dependency graph
requires:
  - phase: 27-wire-advanced-filters-to-backend/01
    provides: POST /voters/search endpoint with VoterSearchBody schema and dynamic sort
provides:
  - VoterSearchBody TypeScript interface mirroring backend schema
  - useVoterSearch hook using useQuery with POST /voters/search
  - Voter list page wired to POST with all 32 filter fields, cursor, limit, sort_by, sort_dir
  - AddVotersDialog using POST search with limit=20
  - SORT_COLUMN_MAP translating DataTable column IDs to backend column names
affects: [27-wire-advanced-filters-to-backend/03]

# Tech tracking
tech-stack:
  added: []
  patterns: [POST-based search with useQuery and keepPreviousData, sort column ID mapping]

key-files:
  created: []
  modified:
    - web/src/types/voter.ts
    - web/src/hooks/useVoters.ts
    - web/src/routes/campaigns/$campaignId/voters/index.tsx
    - web/src/components/voters/AddVotersDialog.tsx

key-decisions:
  - "useQuery with POST (not useMutation) for idempotent search -- body in queryKey enables automatic refetch on filter changes"
  - "placeholderData: keepPreviousData (TanStack Query v5 API) keeps previous results visible during loading"
  - "SORT_COLUMN_MAP maps DataTable column IDs to backend sort columns (full_name->last_name, city->registration_city)"

patterns-established:
  - "POST-based search with useQuery: queryKey includes body for deep comparison, placeholderData for smooth UX"
  - "Sort column mapping: frontend column IDs mapped to backend column names via constant record"

requirements-completed: [FILT-01, FILT-02, FILT-03, FILT-04, FILT-05, FRNT-02]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 27 Plan 02: Frontend POST Migration Summary

**All voter fetching migrated from GET query params to POST /voters/search with VoterSearchBody, enabling all 32 filter fields plus sort/cursor/limit**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T03:41:59Z
- **Completed:** 2026-03-15T03:45:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created VoterSearchBody TypeScript interface mirroring backend schema (filters, cursor, limit, sort_by, sort_dir)
- Replaced 3 deprecated hooks (useVoters, useVotersQuery, useSearchVoters) with single useVoterSearch hook using POST
- Wired voter list page with sort column mapping and full filter/pagination support via POST body
- Migrated AddVotersDialog from infinite query pages pattern to direct PaginatedResponse with limit=20

## Task Commits

Each task was committed atomically:

1. **Task 1: TypeScript types and new hooks** - `733462f` (feat)
2. **Task 2: Wire voter list page and AddVotersDialog** - `8f59e86` (feat)

## Files Created/Modified
- `web/src/types/voter.ts` - Deleted VoterSearchRequest, added VoterSearchBody interface
- `web/src/hooks/useVoters.ts` - Deleted useVoters/useVotersQuery/useSearchVoters, added useVoterSearch with POST + keepPreviousData
- `web/src/routes/campaigns/$campaignId/voters/index.tsx` - Voter list page using useVoterSearch with SORT_COLUMN_MAP and VoterSearchBody
- `web/src/components/voters/AddVotersDialog.tsx` - AddVotersDialog using useVoterSearch with search filter and limit=20

## Decisions Made
- Used useQuery with POST (not useMutation) for idempotent search -- body in queryKey enables automatic refetch on filter changes
- TanStack Query v5 `placeholderData: keepPreviousData` keeps previous results visible during loading transitions
- SORT_COLUMN_MAP maps DataTable column IDs to backend sort columns (full_name->last_name, city->registration_city)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Frontend fully wired to POST /voters/search endpoint
- Plan 03 (end-to-end verification and cleanup) can proceed
- All deprecated hooks and types removed from codebase

## Self-Check: PASSED

All files exist. All commits verified. All content checks passed.

---
*Phase: 27-wire-advanced-filters-to-backend*
*Completed: 2026-03-15*
