---
phase: 26-frontend-updates
plan: 01
subsystem: ui, api
tags: [typescript, react, fastapi, shadcn, tanstack-query, voter-types]

# Dependency graph
requires:
  - phase: 23-voter-model-expansion
    provides: Backend VoterResponse/VoterFilter schemas with registration_* field names
  - phase: 25-filter-builder
    provides: VoterFilter with propensity ranges, multi-select demographics, mailing address fields
provides:
  - Updated TypeScript Voter, VoterFilter, VoterCreate, VoterUpdate interfaces matching backend schemas
  - Field rename propagation (address_line1->registration_line1, city->registration_city, etc.) across all consuming files
  - Backend GET /voters/distinct-values endpoint for dynamic filter options
  - useDistinctValues TanStack Query hook
  - shadcn Accordion, Slider, Collapsible components installed
affects: [26-02, 26-03, 26-04]

# Tech tracking
tech-stack:
  added: [shadcn accordion, shadcn slider, shadcn collapsible]
  patterns: [distinct-values endpoint with field whitelist, useDistinctValues hook with 5min staleTime]

key-files:
  created:
    - web/src/components/ui/accordion.tsx
    - web/src/components/ui/slider.tsx
    - web/src/components/ui/collapsible.tsx
  modified:
    - web/src/types/voter.ts
    - web/src/hooks/useVoters.ts
    - web/src/routes/campaigns/$campaignId/voters/index.tsx
    - web/src/routes/campaigns/$campaignId/voters/$voterId.tsx
    - web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx
    - web/src/components/voters/VoterFilterBuilder.tsx
    - web/src/components/voters/AddVotersDialog.tsx
    - app/api/v1/voters.py
    - app/services/voter.py

key-decisions:
  - "Keep GET /voters query param names (city/state/county) for backward compat, map to registration_* in VoterFilter construction"
  - "ContactsTab address_line1/city/state/zip_code references are VoterAddress model (separate schema), not in scope for field rename"

patterns-established:
  - "Distinct values endpoint: whitelist-gated field querying with grouped counts"
  - "useDistinctValues: TanStack Query hook with 5min staleTime for dynamic filter options"

requirements-completed: [FRNT-05]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 26 Plan 01: TypeScript Types & Backend Foundation Summary

**Updated TypeScript voter interfaces to match backend schemas, propagated field renames across 7 frontend files, installed shadcn accordion/slider/collapsible, and added distinct-values backend endpoint with useDistinctValues hook**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T16:36:41Z
- **Completed:** 2026-03-14T16:41:14Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Voter, VoterFilter, VoterCreate, VoterUpdate TypeScript interfaces now match backend schemas exactly (25+ new fields added, 6 fields renamed)
- All 6 field renames (address_line1->registration_line1, city->registration_city, state->registration_state, zip_code->registration_zip, county->registration_county, address_line2->registration_line2) propagated to every consuming file
- Backend distinct-values endpoint functional with whitelist validation
- shadcn Accordion, Slider, Collapsible components installed for use by Plans 02-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Install shadcn components and update TypeScript types** - `7297009` (feat)
2. **Task 2: Propagate field renames, add distinct-values endpoint and hook** - `f1fe260` (feat)

## Files Created/Modified
- `web/src/types/voter.ts` - Updated Voter (25+ new fields), VoterFilter (12 new fields), VoterCreate (registration_* names)
- `web/src/components/ui/accordion.tsx` - shadcn Accordion component
- `web/src/components/ui/slider.tsx` - shadcn Slider component (dual-handle)
- `web/src/components/ui/collapsible.tsx` - shadcn Collapsible component
- `web/src/hooks/useVoters.ts` - Added useDistinctValues hook
- `web/src/routes/campaigns/$campaignId/voters/index.tsx` - Renamed voterSchema fields, column accessor, filter chips, create form fields
- `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` - Renamed address field references in detail page
- `web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx` - Renamed city column accessor
- `web/src/components/voters/VoterFilterBuilder.tsx` - Renamed city/state/zip_code filter fields
- `web/src/components/voters/AddVotersDialog.tsx` - Renamed voter.city to voter.registration_city
- `app/api/v1/voters.py` - Added distinct-values endpoint, fixed VoterFilter construction
- `app/services/voter.py` - Added distinct_values method

## Decisions Made
- Kept GET /voters query param names (city/state/county) for backward compatibility, mapping them to registration_city/registration_state/registration_county in VoterFilter construction
- ContactsTab.tsx address references (address_line1, city, state, zip_code) are VoterAddress contact model fields, not Voter model fields -- correctly left unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AddVotersDialog voter.city reference**
- **Found during:** Task 2
- **Issue:** AddVotersDialog.tsx referenced voter.city which no longer exists on the Voter interface
- **Fix:** Renamed to voter.registration_city
- **Files modified:** web/src/components/voters/AddVotersDialog.tsx
- **Committed in:** f1fe260 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for correctness -- AddVotersDialog would show undefined city at runtime. No scope creep.

## Issues Encountered
None -- tsc passed with 0 errors after type updates (TypeScript did not catch the property accesses on Voter objects via column definitions due to JSX typing), but all references were manually identified and fixed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TypeScript types are now the single source of truth matching backend schemas
- shadcn Accordion, Slider, Collapsible ready for Plan 03 (filter builder restructure) and Plan 02 (voter detail page)
- useDistinctValues hook ready for Plan 03 (dynamic filter checkboxes)
- Backend distinct-values endpoint operational for Plan 03

## Self-Check: PASSED

All 12 files verified present. Both task commits (7297009, f1fe260) verified in git log.

---
*Phase: 26-frontend-updates*
*Completed: 2026-03-14*
