---
phase: 01-authentication-and-multi-tenancy
plan: 02
subsystem: api
tags: [fastapi, zitadel, campaign-crud, compensating-transaction, rls, httpx, pydantic]

# Dependency graph
requires:
  - phase: 01-authentication-and-multi-tenancy
    plan: 01
    provides: "JWT validation, role enforcement, SQLAlchemy models, RLS helpers, error handlers"
provides:
  - "ZitadelService HTTP client for org lifecycle management"
  - "CampaignService with compensating transaction pattern"
  - "Campaign CRUD endpoints (POST/GET/PATCH/DELETE) with role enforcement"
  - "/me and /me/campaigns user identity endpoints"
  - "User identity sync from JWT claims on authenticated requests"
  - "Shared API dependencies (ensure_user_synced, get_db_with_rls)"
  - "Campaign and User Pydantic request/response schemas"
affects: [01-03-invitation-flow, 02-voter-data, 03-turf-management]

# Tech tracking
tech-stack:
  added: [httpx (ZITADEL client)]
  patterns: [compensating-transaction, cursor-based-pagination, user-sync-on-auth, service-layer-pattern]

key-files:
  created:
    - app/services/zitadel.py
    - app/services/campaign.py
    - app/api/v1/campaigns.py
    - app/api/v1/users.py
    - app/api/deps.py
    - app/schemas/campaign.py
    - app/schemas/user.py
    - tests/unit/test_campaign_service.py
    - tests/unit/test_api_campaigns.py
  modified:
    - app/api/v1/router.py
    - app/core/errors.py
    - app/services/__init__.py

key-decisions:
  - "CampaignResponse.id uses uuid.UUID type (not str) for proper serialization"
  - "Error handlers return ProblemResponse (not Problem) for ASGI compatibility"
  - "User created_at/updated_at set explicitly in ensure_user_synced (not relying on server_default outside DB)"
  - "ensure_user_synced runs on every authenticated endpoint for belt-and-suspenders user/member sync"

patterns-established:
  - "Compensating transaction: create external resource first, delete on local failure"
  - "Cursor-based pagination: created_at|id composite cursor for stable ordering"
  - "User sync dependency: ensure_user_synced called at start of each endpoint"
  - "Service layer: CampaignService encapsulates business logic, endpoints are thin"

requirements-completed: [AUTH-02, AUTH-03, AUTH-05, AUTH-06]

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 1 Plan 2: Campaign CRUD with ZITADEL org provisioning, compensating transactions, and role-enforced API endpoints

**Campaign CRUD endpoints with ZITADEL org lifecycle, compensating transaction rollback, role enforcement (viewer/admin/owner), user identity sync, and /me endpoints -- 23 test cases total**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T16:41:54Z
- **Completed:** 2026-03-09T16:50:13Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- ZitadelService HTTP client with token caching, org CRUD, and role management
- CampaignService with compensating transaction pattern (deletes ZITADEL org on local DB failure)
- Campaign CRUD endpoints with proper role enforcement (POST=any auth, GET=viewer+, PATCH=admin+, DELETE=owner)
- User identity sync from JWT claims on every authenticated request
- /me and /me/campaigns endpoints for user identity
- Cursor-based pagination for campaign listing
- 23 new unit tests (10 service + 13 API) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: ZITADEL service client + Campaign service** - `491afea` (feat)
2. **Task 2: Campaign API endpoints, user sync, /me endpoints** - `d8123d5` (feat)

_Both tasks followed TDD: RED (failing tests) -> GREEN (implementation) -> REFACTOR (lint fixes)_

## Files Created/Modified
- `app/services/zitadel.py` - ZITADEL Management API client (org create/deactivate/delete, role assign/remove)
- `app/services/campaign.py` - Campaign business logic with compensating transactions
- `app/api/v1/campaigns.py` - Campaign CRUD endpoints with role enforcement
- `app/api/v1/users.py` - /me and /me/campaigns endpoints
- `app/api/deps.py` - Shared deps: ensure_user_synced, get_db_with_rls, get_campaign_from_token
- `app/schemas/campaign.py` - CampaignCreate, CampaignUpdate, CampaignResponse
- `app/schemas/user.py` - UserResponse, UserCampaignResponse
- `app/api/v1/router.py` - Wired campaign and user routers
- `app/core/errors.py` - Fixed error handlers to return ProblemResponse
- `app/services/__init__.py` - Services package init
- `tests/unit/test_campaign_service.py` - 10 service-level tests
- `tests/unit/test_api_campaigns.py` - 13 API-level tests

## Decisions Made
- CampaignResponse.id typed as uuid.UUID instead of str for proper Pydantic serialization from SQLAlchemy models
- Error handlers return ProblemResponse (JSONResponse subclass) not Problem object -- Problem is not an ASGI-callable response
- User created_at/updated_at set explicitly in ensure_user_synced to avoid None values when server_default doesn't apply outside real DB
- ensure_user_synced belt-and-suspenders: also creates CampaignMember record if missing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed error handler return type**
- **Found during:** Task 2 (API endpoint testing)
- **Issue:** Error handlers in app/core/errors.py returned `problem.Problem` objects which are not ASGI-callable responses, causing TypeError
- **Fix:** Changed to `problem.ProblemResponse` which extends JSONResponse
- **Files modified:** app/core/errors.py
- **Verification:** 404 test returns proper RFC 9457 structure
- **Committed in:** d8123d5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for error handling correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed bug above.

## User Setup Required
None - no external service configuration required. All tests use mocked ZITADEL.

## Next Phase Readiness
- Campaign CRUD fully operational with mocked ZITADEL
- Role enforcement tested at every endpoint
- Ready for Plan 03 (invitation flow / campaign member management)
- User sync mechanism in place for all future authenticated endpoints

## Self-Check: PASSED

All 9 created files verified present. Both task commits (491afea, d8123d5) verified in git log. 40 unit tests passing, ruff clean.

---
*Phase: 01-authentication-and-multi-tenancy*
*Completed: 2026-03-09*
