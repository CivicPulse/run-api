---
phase: 43-organization-ui
plan: 01
subsystem: api, ui
tags: [fastapi, tanstack-query, zustand, oidc, zitadel, org-management]

requires:
  - phase: 41-organization-model
    provides: Organization model, OrganizationMember model (from parallel branch)
provides:
  - PATCH /api/v1/org endpoint (org_owner)
  - POST /api/v1/org/campaigns/{id}/members endpoint (org_admin)
  - GET /api/v1/me/orgs endpoint (any auth user)
  - Extended GET /org/campaigns with status field
  - Extended GET /org/members with campaign_roles array
  - OrgRole enum and require_org_role dependency
  - Frontend org TypeScript types (OrgCampaign, OrgMember, UserOrg)
  - TanStack Query hooks for all org API calls
  - RequireOrgRole component for org-level permission gating
  - authStore.switchOrg for multi-org switching via ZITADEL
affects: [43-02, 43-03, 43-04, org-dashboard, org-switcher, campaign-wizard, member-directory]

tech-stack:
  added: []
  patterns:
    - "require_org_role dependency factory for org-level auth gating"
    - "useOrgPermissions hook with ORG_ROLE_LEVELS hierarchy"
    - "RequireOrgRole mirrors RequireRole component pattern"
    - "switchOrg uses signinRedirect with urn:zitadel:iam:org:id:{orgId} scope"

key-files:
  created:
    - app/schemas/org.py
    - app/services/org.py
    - app/api/v1/org.py
    - app/models/organization_member.py
    - web/src/types/org.ts
    - web/src/hooks/useOrg.ts
    - web/src/hooks/useOrgPermissions.ts
    - web/src/components/shared/RequireOrgRole.tsx
  modified:
    - app/core/security.py
    - app/api/v1/router.py
    - app/api/v1/users.py
    - web/src/stores/authStore.ts

key-decisions:
  - "Brought in Phase 41 prerequisite code (OrgRole, require_org_role, OrganizationMember model) as part of this plan since parallel branch not yet merged"
  - "switchOrg uses zitadel_org_id string (not internal UUID) in ZITADEL scope per Pitfall 6"
  - "GET /me/orgs uses get_current_user (not require_org_role) so any authenticated user can list orgs for switcher"

patterns-established:
  - "require_org_role('org_owner') for owner-only operations, require_org_role('org_admin') for admin+ operations"
  - "OrgService.list_members_with_campaign_roles builds cross-campaign role matrix"
  - "useOrgPermissions extracts org context from JWT claims via urn:zitadel:iam:user:resourceowner:id"

requirements-completed: [ORG-05, ORG-09, ORG-10, ORG-12, ORG-13]

duration: 4min
completed: 2026-03-24
---

# Phase 43 Plan 01: API Endpoints & Frontend Foundation Summary

**Org management backend with 5 endpoints (CRUD + member assignment) plus frontend hooks, types, RequireOrgRole, and ZITADEL org-switching auth store extension**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T19:13:14Z
- **Completed:** 2026-03-24T19:17:21Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- 5 backend endpoints: GET /org, PATCH /org, GET /org/campaigns (with status), GET /org/members (with campaign_roles), POST /org/campaigns/{id}/members, GET /me/orgs
- Full frontend foundation: TypeScript types, 6 TanStack Query hooks, org permissions hook, RequireOrgRole component
- Auth store switchOrg method for multi-org ZITADEL re-authentication

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend backend org endpoints and add new endpoints** - `fe64276` (feat)
2. **Task 2: Frontend types, hooks, RequireOrgRole, and auth store switchOrg** - `09fa4ff` (feat)

## Files Created/Modified
- `app/schemas/org.py` - OrgUpdate, CampaignRoleEntry, UserOrgResponse, AddMemberToCampaignRequest schemas
- `app/services/org.py` - OrgService with list_members_with_campaign_roles and add_member_to_campaign
- `app/api/v1/org.py` - 5 org endpoints (GET, PATCH, GET campaigns, GET members, POST add member)
- `app/api/v1/users.py` - Added GET /me/orgs endpoint
- `app/api/v1/router.py` - Registered org router
- `app/core/security.py` - Added OrgRole enum, ORG_ROLE_LEVELS, require_org_role dependency
- `app/models/organization_member.py` - OrganizationMember model
- `web/src/types/org.ts` - OrgCampaign, OrgMember, UserOrg, AddMemberRequest interfaces
- `web/src/hooks/useOrg.ts` - 6 hooks for org API calls
- `web/src/hooks/useOrgPermissions.ts` - Org permission check hook
- `web/src/components/shared/RequireOrgRole.tsx` - Org-level role gate component
- `web/src/stores/authStore.ts` - Added switchOrg method

## Decisions Made
- Brought in Phase 41 prerequisite code (OrgRole, require_org_role, OrganizationMember model) directly since the parallel branch was not yet merged to this worktree
- switchOrg uses zitadel_org_id string (not internal UUID) in the ZITADEL scope parameter
- GET /me/orgs uses get_current_user (not require_org_role) so any authenticated user can list their orgs for the switcher

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Brought in Phase 41 prerequisite files**
- **Found during:** Task 1 (backend endpoint creation)
- **Issue:** Phase 41 code (OrgRole, require_org_role, OrganizationMember model, org schemas/service/api) existed on parallel branch not merged to this worktree
- **Fix:** Created all prerequisite files directly (organization_member.py model, OrgRole enum in security.py, require_org_role dependency) and built the base org schemas/service/api as part of this plan
- **Files modified:** app/core/security.py, app/models/organization_member.py, app/schemas/org.py, app/services/org.py, app/api/v1/org.py, app/api/v1/router.py
- **Verification:** ruff check passes, schema imports succeed
- **Committed in:** fe64276 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Prerequisite code from Phase 41 was necessary for this plan to function. No scope creep -- all added code was required by the plan's endpoints.

## Issues Encountered
None beyond the prerequisite code resolution noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend endpoints ready for frontend pages (plans 02-04)
- Frontend hooks and types ready for org dashboard, member directory, settings, and campaign wizard
- RequireOrgRole component ready for permission gating in UI

---
*Phase: 43-organization-ui*
*Completed: 2026-03-24*
