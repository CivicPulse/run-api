---
phase: 57-test-infrastructure
plan: 01
subsystem: testing
tags: [playwright, zitadel, e2e, provisioning, multi-role]

# Dependency graph
requires:
  - phase: 56-feature-fixes
    provides: note edit/delete and walk list rename features for E2E testing
provides:
  - 15-user ZITADEL provisioning script with campaign membership
  - 5 role-based Playwright auth projects with filename-suffix routing
  - Blob reporter for CI shard merging
affects: [57-02, 58-e2e-specs, 59-e2e-specs, 60-e2e-specs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-based Playwright projects with filename suffix routing (.admin.spec.ts, .viewer.spec.ts)"
    - "Campaign membership provisioning via direct SQL with ON CONFLICT upsert"

key-files:
  created: [web/playwright/.auth/.gitkeep]
  modified: [scripts/create-e2e-users.py, web/playwright.config.ts, web/.gitignore]

key-decisions:
  - "Owner is default auth context (unsuffixed specs), replacing admin@localhost"
  - "All 15 users get campaign membership to seed campaign via ensure_campaign_membership()"
  - "Blob reporter in CI for downstream shard merging (Plan 02)"
  - ".gitignore uses wildcard playwright/.auth/ instead of per-file exclusions"

patterns-established:
  - "Filename suffix routing: .admin.spec.ts runs in admin project, unsuffixed runs as owner"
  - "ensure_campaign_membership() SQL pattern for idempotent campaign member creation"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 57 Plan 01: E2E User Provisioning & Playwright Config Summary

**15-user ZITADEL provisioning with campaign membership and 5 role-based Playwright auth projects with blob reporter for CI sharding**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T16:26:32Z
- **Completed:** 2026-03-29T16:29:39Z
- **Tasks:** 2
- **Files modified:** 3 (+ 1 created)

## Accomplishments
- Expanded E2E user provisioning from 2 to 15 users across 5 campaign roles (owner, admin, manager, volunteer, viewer)
- Added ensure_campaign_membership() function for idempotent seed campaign assignment
- Restructured Playwright config from 3 auth projects to 5 role-based projects with filename-suffix routing
- Switched CI reporter to blob for downstream shard merging

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand provisioning script to 15 users with campaign membership** - `dd22cc2` (feat)
2. **Task 2: Restructure Playwright config for 5 role-based projects and update .gitignore** - `d572ccb` (feat)

## Files Created/Modified
- `scripts/create-e2e-users.py` - Expanded from 2 to 15 users, added ensure_campaign_membership(), updated ensure_org_membership() signature
- `web/playwright.config.ts` - 5 role-based auth projects, blob reporter in CI, owner as default
- `web/.gitignore` - Wildcard playwright/.auth/ exclusion with .gitkeep
- `web/playwright/.auth/.gitkeep` - Directory placeholder for auth state files

## Decisions Made
- Owner is the default auth context (unsuffixed specs run as owner1@localhost, not admin@localhost)
- All 15 users get campaign membership to the seed campaign (Macon-Bibb demo)
- ensure_org_membership() updated to accept display_name and email parameters instead of hardcoded values
- Reporter switches from html to blob in CI for downstream shard merging in Plan 02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality fully implemented.

## Next Phase Readiness
- Provisioning script ready for 15-user E2E testing
- Playwright config ready for role-based spec routing (auth setup files created in Plan 02)
- Plan 02 (CI sharding + auth setup files) can proceed immediately

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 57-test-infrastructure*
*Completed: 2026-03-29*
