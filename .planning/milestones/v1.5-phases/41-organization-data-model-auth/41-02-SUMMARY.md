---
phase: 41-organization-data-model-auth
plan: 02
subsystem: auth
tags: [security, rbac, organization, sqlalchemy, fastapi]

requires:
  - phase: 41-organization-data-model-auth
    provides: "OrganizationMember model, OrgRole StrEnum, ORG_ROLE_CAMPAIGN_EQUIVALENT mapping"
  - phase: 01-authentication
    provides: "CampaignRole IntEnum, resolve_campaign_role function, security.py"
provides:
  - "Modified resolve_campaign_role() with 4-step org role resolution"
  - "Additive max() semantics for campaign + org roles (D-08)"
  - "JWT fallback removal (D-07)"
  - "NULL CampaignMember.role backward compatibility (VIEWER default)"
affects: [41-03-org-auth-dependencies]

tech-stack:
  added: []
  patterns: ["Additive role resolution: max(campaign_role, org_derived_role)"]

key-files:
  created: []
  modified:
    - app/core/security.py
    - tests/unit/test_resolve_campaign_role.py
    - tests/unit/test_api_campaigns.py
    - tests/unit/test_api_invites.py
    - tests/unit/test_api_members.py

key-decisions:
  - "Full CampaignMember row selected instead of just role column to distinguish NULL role from no record"
  - "Org lookup runs unconditionally when user_org_id set, enabling additive resolution even with existing campaign role"

patterns-established:
  - "Additive role resolution: both CampaignMember and OrganizationMember checked, max() wins"
  - "Test mock pattern: _setup_role_resolution returns CampaignMember mock with explicit role (not None)"

requirements-completed: [ORG-03]

duration: 7min
completed: 2026-03-24
---

# Phase 41 Plan 02: Org Role Resolution Summary

**Additive org role resolution in resolve_campaign_role() with max() semantics, JWT fallback removal, and NULL role backward compatibility**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T13:53:57Z
- **Completed:** 2026-03-24T14:01:21Z
- **Tasks:** 1 (TDD with RED/GREEN commits)
- **Files modified:** 5

## Accomplishments
- resolve_campaign_role() now implements 4-step resolution: explicit CampaignMember role, OrganizationMember-derived campaign equivalent, additive max(), deny
- org_admin grants ADMIN-equivalent, org_owner grants OWNER-equivalent on any campaign in their org
- JWT role fallback completely removed (D-07) -- users must have CampaignMember or OrganizationMember record
- NULL CampaignMember.role treated as VIEWER for backward compatibility with existing data
- 14 comprehensive unit tests covering all org role scenarios
- All 503 unit tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for org role resolution** - `d17c8ac` (test)
2. **Task 1 (GREEN): Implement org role resolution + fix existing tests** - `9e83589` (feat)

_Note: TDD task with separate RED/GREEN commits_

## Files Created/Modified
- `app/core/security.py` - Modified resolve_campaign_role() with org role lookup, additive max(), JWT fallback removal
- `tests/unit/test_resolve_campaign_role.py` - 14 tests covering org admin/owner, additive semantics, NULL role, cross-org denial
- `tests/unit/test_api_campaigns.py` - Updated _setup_role_resolution to provide CampaignMember mocks with explicit roles
- `tests/unit/test_api_invites.py` - Updated _setup_role_resolution for JWT fallback removal
- `tests/unit/test_api_members.py` - Updated _setup_role_resolution for JWT fallback removal

## Decisions Made
- Selected full CampaignMember row instead of just .role column to distinguish NULL role from no-record case
- Org lookup always runs when user_org_id is set (not just when no campaign member found) to enable additive semantics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test mocks in test_api_campaigns, test_api_invites, test_api_members**
- **Found during:** Task 1 GREEN phase (unit test regression check)
- **Issue:** Existing tests relied on JWT fallback behavior (returning jwt_role when no CampaignMember). After removing JWT fallback (D-07), these tests returned 403 instead of expected success codes.
- **Fix:** Updated _setup_role_resolution in 3 test files to return CampaignMember mock with explicit role instead of None, matching the new behavior where users need actual membership records.
- **Files modified:** tests/unit/test_api_campaigns.py, tests/unit/test_api_invites.py, tests/unit/test_api_members.py
- **Verification:** All 503 unit tests pass
- **Committed in:** 9e83589 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential test update for JWT fallback removal. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- resolve_campaign_role() ready for Plan 03 (org auth dependencies) which builds require_org_role() and route-level org guards
- OrganizationMember queries established in security.py, reusable pattern for Plan 03

## Self-Check: PASSED

All modified files verified on disk. Both commit hashes verified in git log.

---
*Phase: 41-organization-data-model-auth*
*Completed: 2026-03-24*
