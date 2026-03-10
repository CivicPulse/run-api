---
phase: 03-canvassing-operations
plan: 02
subsystem: api
tags: [postgis, geoalchemy2, shapely, spatial, canvassing, walk-list, turf, door-knock, fastapi]

# Dependency graph
requires:
  - phase: 03-canvassing-operations
    provides: "Turf, WalkList, WalkListEntry, WalkListCanvasser models, Pydantic schemas, migration"
provides:
  - "TurfService with CRUD, GeoJSON validation, spatial voter count"
  - "WalkListService with frozen snapshot generation, household clustering, canvasser assignment"
  - "CanvassService with atomic door-knock recording"
  - "Turf API endpoints (CRUD with GeoJSON input/output)"
  - "Walk list API endpoints (generation, entries, canvassers, door-knocks)"
  - "Address sort and household clustering helper functions"
affects: [03-canvassing-operations, 04-phone-banking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GeoJSON validation: shapely shape() + is_valid + explain_validity"
    - "WKB-to-GeoJSON conversion: to_shape() + mapping()"
    - "Spatial voter query: ST_Contains with scalar subquery for turf boundary"
    - "Frozen snapshot walk list: entries created at generation time, immutable voter set"
    - "Household clustering: exact address match on normalized (address_line1, zip5)"
    - "Atomic door-knock: interaction + entry status + list stats in one flush"
    - "Composition pattern: CanvassService wraps VoterInteractionService"

key-files:
  created:
    - app/services/turf.py
    - app/services/walk_list.py
    - app/services/canvass.py
    - app/api/v1/turfs.py
    - app/api/v1/walk_lists.py
  modified:
    - app/api/v1/router.py
    - tests/unit/test_walk_lists.py
    - tests/unit/test_canvassing.py

key-decisions:
  - "parse_address_sort_key and household_key as standalone functions in turf.py for testability"
  - "Walk list entries use sequence-based cursor pagination (not created_at)"
  - "CanvassService computes attempt_number on read via COUNT query (not stored in payload)"
  - "Status transitions enforced: draft->active->completed only (no backward transitions)"
  - "Walk list deletion manually cascades entries and canvassers before deleting parent"

patterns-established:
  - "GeoJSON polygon validation: shapely shape() + is_valid + area > 0 check"
  - "Spatial voter containment: ST_Contains with scalar subquery pattern"
  - "Address sort key: regex extract (house_number, street_name) from address_line1"
  - "Household key: normalized (address_line1.upper().strip(), zip[:5]) or household_id"

requirements-completed: [CANV-01, CANV-02, CANV-03, CANV-04, CANV-05, CANV-06]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 3 Plan 02: Canvassing Services and API Summary

**TurfService with GeoJSON validation, WalkListService with spatial generation and household clustering, CanvassService with atomic door-knock recording, and full REST API for turfs and walk lists**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T20:08:59Z
- **Completed:** 2026-03-09T20:14:09Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- TurfService with CRUD, GeoJSON polygon validation via shapely, status transitions, and spatial voter count via ST_Contains
- WalkListService generates frozen snapshot walk lists with spatial queries, address-sort ordering (street name then house number), exact-address household clustering, canvasser assignment, and entry management
- CanvassService records door knocks atomically (VoterInteraction + entry status VISITED + walk list visited_entries increment in one transaction)
- Full REST API: 5 turf endpoints (CRUD + list) and 10 walk list endpoints (generation, entries, canvassers, door-knocks, delete)
- All endpoints enforce role-based access (manager for creation/assignment, volunteer for recording/viewing)
- 13 unit tests passing across walk list and canvassing test suites

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement TurfService and WalkListService with spatial queries and household clustering** - `4859804` (feat)
2. **Task 2: Implement CanvassService and all API endpoints for turfs and walk lists** - `f520f51` (feat)

## Files Created/Modified
- `app/services/turf.py` - TurfService with CRUD, GeoJSON validation, voter count, address sort/household helpers
- `app/services/walk_list.py` - WalkListService with generation, household clustering, entry management, canvasser assignment
- `app/services/canvass.py` - CanvassService with atomic door-knock recording via VoterInteractionService composition
- `app/api/v1/turfs.py` - Turf CRUD endpoints with GeoJSON input/output and RFC 9457 error responses
- `app/api/v1/walk_lists.py` - Walk list generation, entries, canvassers, door-knock, and delete endpoints
- `app/api/v1/router.py` - Added turfs and walk_lists sub-routers
- `tests/unit/test_walk_lists.py` - 8 tests: generation, frozen snapshot, clustering, sort order, assignment, status
- `tests/unit/test_canvassing.py` - 5 tests: door-knock recording, entry status, visited count, contacts, attempts

## Decisions Made
- `parse_address_sort_key` and `household_key` implemented as standalone functions for direct unit testing
- Walk list entries use sequence-based cursor pagination (ascending) instead of created_at (since entries are ordered by walking sequence)
- CanvassService computes attempt_number on read via COUNT query per research pitfall 7 (avoids race conditions)
- Turf status transitions strictly enforced: draft->active->completed, no backward moves
- Walk list deletion explicitly deletes entries and canvassers first for safety (not relying solely on DB CASCADE)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full turf-to-door-knock workflow operational for Plan 03 (surveys service and API)
- Services ready for integration testing with real PostGIS database
- All 156 unit tests passing (full suite)

## Self-Check: PASSED
