---
phase: 41-organization-data-model-auth
plan: 03
subsystem: auth, api
tags: [org-role, api-endpoints, auth-dependency, fastapi]
dependency_graph:
  requires: [41-01]
  provides: [require_org_role, OrgService, org-api-endpoints]
  affects: [app/core/security.py, app/api/v1/router.py]
tech_stack:
  added: []
  patterns: [require_org_role factory, OrgService org-scoped queries]
key_files:
  created:
    - app/schemas/org.py
    - app/services/org.py
    - app/api/v1/org.py
    - tests/unit/test_org_auth.py
    - tests/unit/test_org_api.py
  modified:
    - app/core/security.py
    - app/api/v1/router.py
decisions:
  - "require_org_role() uses ORG_ROLE_LEVELS dict for level comparison (not StrEnum ordering)"
  - "Org endpoints use get_db() not get_campaign_db() per D-13 (no RLS)"
  - "All three endpoints gated by require_org_role('org_admin') minimum per D-10"
metrics:
  duration: 5m 35s
  completed: 2026-03-24
  tasks: 2/2
  tests_added: 9
  files_created: 5
  files_modified: 2
---

# Phase 41 Plan 03: Org Auth Dependency & API Endpoints Summary

require_org_role() factory with ORG_ROLE_LEVELS gating, OrgService with org-scoped queries, and three GET endpoints under /api/v1/org for org details, campaigns, and members.

## What Was Built

### Task 1: require_org_role() Factory (TDD)
- Added `require_org_role(minimum)` to `app/core/security.py`
- Validates JWT org_id against DB Organization record (D-11)
- Checks OrganizationMember for required role level using ORG_ROLE_LEVELS dict
- Returns 403 for: no matching org, no member record, insufficient role level
- Uses `get_db()` (no campaign RLS) per D-13
- 5 unit tests covering all allow/deny paths

### Task 2: Org Schemas, Service, API, Router (TDD)
- `app/schemas/org.py`: OrgResponse, OrgMemberResponse, OrgCampaignResponse
- `app/services/org.py`: OrgService with get_org, list_campaigns (with member counts), list_members (with user details)
- `app/api/v1/org.py`: 3 GET endpoints (/org, /org/campaigns, /org/members) all gated by require_org_role("org_admin")
- Router registered at `/api/v1/org` in `app/api/v1/router.py`
- 4 unit tests covering endpoint responses and 403 denial

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 3b6ecfd | feat(41-03): add require_org_role() factory with org membership level gating |
| 2 | aeb4320 | feat(41-03): add org schemas, service, API endpoints, and router registration |

## Verification Results

- `uv run pytest tests/unit/test_org_auth.py tests/unit/test_org_api.py -x -v`: 9 passed
- `uv run pytest tests/unit/ -x -q`: 505 passed (no regressions)
- `uv run ruff check`: all files clean
- Route count verification: 3 routes on org router

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all endpoints return real data from DB queries.

## Self-Check: PASSED

All 7 files found. Both commits verified.
