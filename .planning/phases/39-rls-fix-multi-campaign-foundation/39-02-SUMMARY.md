---
phase: 39-rls-fix-multi-campaign-foundation
plan: 02
subsystem: api
tags: [rls, fastapi, dependency-injection, multi-tenancy, security, refactor]

requires:
  - phase: 39-rls-fix-multi-campaign-foundation
    plan: 01
    provides: "Transaction-scoped set_config and pool checkout event"
provides:
  - "Centralized get_campaign_db dependency replacing 244 inline set_campaign_context calls"
  - "Zero-skip RLS enforcement: no campaign-scoped endpoint can bypass RLS context"
  - "HTTPException 403 on invalid campaign context"
affects: [39-03, 39-04, 41-org-context]

tech-stack:
  added: []
  patterns: ["Centralized FastAPI dependency for RLS context injection via URL path parameter"]

key-files:
  created:
    - tests/unit/test_rls_middleware.py
  modified:
    - app/api/deps.py
    - app/api/v1/voters.py
    - app/api/v1/shifts.py
    - app/api/v1/volunteers.py
    - app/api/v1/surveys.py
    - app/api/v1/phone_banks.py
    - app/api/v1/members.py
    - app/api/v1/voter_lists.py
    - app/api/v1/field.py
    - app/api/v1/voter_contacts.py
    - app/api/v1/voter_tags.py
    - app/api/v1/turfs.py
    - app/api/v1/walk_lists.py
    - app/api/v1/dashboard.py
    - app/api/v1/dnc.py
    - app/api/v1/imports.py
    - app/api/v1/voter_interactions.py
    - app/api/v1/call_lists.py
    - tests/unit/test_api_members.py

key-decisions:
  - "get_campaign_db takes uuid.UUID (not str) for type safety from FastAPI path param extraction"
  - "ValueError from set_campaign_context converted to 403 HTTPException per D-03"
  - "get_db_with_rls kept as deprecated for backward compatibility during transition"

patterns-established:
  - "All campaign-scoped routes use Depends(get_campaign_db) — no manual RLS calls"
  - "Non-campaign routes (campaigns list, invites, join, health) still use get_db"

requirements-completed: [DATA-03]

duration: 4min
completed: 2026-03-24
---

# Phase 39 Plan 02: Centralize RLS Dependency Summary

**Centralized get_campaign_db FastAPI dependency replacing 244 inline set_campaign_context calls across 17 route files, ensuring zero-skip RLS enforcement**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T07:12:55Z
- **Completed:** 2026-03-24T07:16:58Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Created centralized `get_campaign_db` dependency in `app/api/deps.py` that auto-sets RLS context from URL path parameter
- Removed all 244 inline `set_campaign_context` calls across 17 route files
- Added ValueError-to-403 conversion for invalid campaign context (per D-03)
- All 478 unit tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create get_campaign_db dependency and write tests (TDD)**
   - `9a65a37` (test: RED - failing tests for get_campaign_db)
   - `4362f4e` (feat: GREEN - implement get_campaign_db dependency)
2. **Task 2: Replace all inline set_campaign_context calls** - `9728950` (refactor)

## Files Created/Modified
- `app/api/deps.py` - Added `get_campaign_db` dependency, marked `get_db_with_rls` as deprecated
- `tests/unit/test_rls_middleware.py` - 3 unit tests for get_campaign_db behavior
- `app/api/v1/voters.py` - Replaced 7 inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/dashboard.py` - Replaced 19 inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/volunteers.py` - Replaced 16 inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/shifts.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/phone_banks.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/surveys.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/voter_contacts.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/walk_lists.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/call_lists.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/voter_lists.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/imports.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/turfs.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/dnc.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/voter_tags.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/voter_interactions.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/members.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `app/api/v1/field.py` - Replaced inline RLS calls with Depends(get_campaign_db)
- `tests/unit/test_api_members.py` - Added get_campaign_db dependency override

## Decisions Made
- `get_campaign_db` accepts `uuid.UUID` (not `str`) for type safety — FastAPI automatically extracts and validates from the URL path parameter
- Kept `get_db_with_rls` as deprecated for backward compatibility during transition
- ValueError from `set_campaign_context` is caught and re-raised as HTTPException 403 per D-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test_api_members.py to override get_campaign_db**
- **Found during:** Task 2 (route refactoring)
- **Issue:** test_api_members.py only overrode `get_db` dependency but members endpoints now use `get_campaign_db`, causing test to hit real DB
- **Fix:** Added `app.dependency_overrides[get_campaign_db] = _get_db` alongside existing `get_db` override
- **Files modified:** tests/unit/test_api_members.py
- **Committed in:** 9728950 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix to prevent test failure. No scope creep.

## Issues Encountered
None beyond the test override fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All campaign-scoped endpoints now use centralized `get_campaign_db` dependency
- Ready for Plan 03 (multi-campaign membership model)
- Ready for Plan 04 (campaign switcher UI)
- `get_db_with_rls` can be removed after Phase 39 migration is fully complete

---
*Phase: 39-rls-fix-multi-campaign-foundation*
*Completed: 2026-03-24*
