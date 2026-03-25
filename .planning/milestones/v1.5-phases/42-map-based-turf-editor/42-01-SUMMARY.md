---
phase: 42-map-based-turf-editor
plan: 01
subsystem: turf-api-and-map-infrastructure
tags: [backend, frontend, api, geospatial, testing]
dependency_graph:
  requires: []
  provides: [turf-voter-count, turf-voters-endpoint, turf-overlaps-endpoint, leaflet-test-mocks]
  affects: [turf-list-ui, map-editor, map-overview]
tech_stack:
  added: []
  patterns: [batch-voter-count-query, spatial-overlap-detection]
key_files:
  created:
    - web/src/components/canvassing/map/__mocks__/leaflet.ts
    - web/src/components/canvassing/map/TurfMapEditor.test.tsx
    - web/src/components/canvassing/map/TurfOverviewMap.test.tsx
    - web/src/components/canvassing/map/VoterMarkerLayer.test.tsx
    - web/src/components/canvassing/map/GeoJsonImport.test.tsx
    - web/src/components/canvassing/map/AddressSearch.test.tsx
    - web/src/components/canvassing/map/OverlapHighlight.test.tsx
    - web/src/components/canvassing/map/MapProvider.test.tsx
  modified:
    - app/schemas/turf.py
    - app/api/v1/turfs.py
    - app/services/turf.py
    - web/src/types/turf.ts
    - web/src/hooks/useTurfs.ts
decisions:
  - Batch voter count query via outerjoin+ST_Contains for O(1) queries per list call
  - Overlaps endpoint registered before {turf_id} to avoid path conflict
  - Wave 0 test stubs use it.todo() to keep suite green while providing scaffold
metrics:
  duration: 7m
  completed: "2026-03-24T16:02:01Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 13
---

# Phase 42 Plan 01: API Extensions & Map Test Infrastructure Summary

Batch voter counts via outerjoin+ST_Contains, voters-by-turf and overlap detection endpoints, frontend hooks, and 7 test stubs with Leaflet mocks for all map components.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 0 | Wave 0 -- Leaflet mocks and test stubs | 40cfe0e | 8 test files + mock setup |
| 1 | Backend -- voter_count, voters-by-turf, overlap detection | dd3e1ac | turf.py (schema, service, routes) |
| 2 | Frontend -- TypeScript types and TanStack Query hooks | 3f9dc05 | turf.ts, useTurfs.ts |

## What Was Built

### Backend (Task 1)
- **TurfResponse.voter_count** -- Added `voter_count: int = 0` field to the turf response schema
- **VoterLocationResponse** -- Lightweight schema (id, lat, lng, name) for map markers
- **OverlappingTurfResponse** -- Schema for overlap detection results (id, name, boundary)
- **GET /turfs/{id}/voters** -- Returns all voters with geom within turf boundary (volunteer+ role)
- **GET /turfs/overlaps** -- Detects active turfs intersecting a given GeoJSON boundary (manager+ role)
- **get_voter_counts_batch** -- Service method using outerjoin + ST_Contains for batch voter counting
- **list_turfs** -- Now includes voter_count for each turf via batch query

### Frontend (Task 2)
- **TurfResponse** -- Added `voter_count: number` field
- **VoterLocation** -- New interface for map marker data
- **OverlappingTurf** -- New interface for overlap detection results
- **useTurfVoters** -- TanStack Query hook for fetching voters by turf
- **useTurfOverlaps** -- TanStack Query hook for checking boundary overlaps

### Test Infrastructure (Task 0)
- **Leaflet mock setup** -- Shared mock for leaflet, react-leaflet, react-leaflet-cluster, geoman
- **7 test stub files** -- 24 it.todo() placeholders covering MAP-01 through MAP-11
- All stubs pass cleanly (reported as todo, zero failures)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all code is fully wired. Test stubs are intentional Wave 0 placeholders that will be filled by Plans 02-04.

## Verification Results

- `uv run ruff check` -- All checks passed
- `uv run python -c "from app.schemas.turf import TurfResponse; assert 'voter_count' in TurfResponse.model_fields"` -- OK
- `npx tsc --noEmit` -- Clean compilation
- `npx vitest run src/components/canvassing/map/` -- 7 files, 24 todo tests, 0 failures

## Self-Check: PASSED

All 7 key files verified present. All 3 commit hashes verified in git log.
