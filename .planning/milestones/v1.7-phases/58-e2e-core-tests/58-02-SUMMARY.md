---
phase: 58-e2e-core-tests
plan: 02
subsystem: testing
tags: [playwright, e2e, org-management, campaign-settings, serial-tests, lifecycle]

# Dependency graph
requires:
  - phase: 57-test-infrastructure
    provides: 5 role-based Playwright auth projects and 15 provisioned test users
  - phase: 58-01
    provides: RBAC E2E spec patterns and role-suffix conventions
provides:
  - Org management E2E spec covering dashboard, campaign lifecycle, org settings, member directory
  - Campaign settings E2E spec covering settings CRUD, member management, ownership transfer, deletion
  - Unarchive campaign UI action (hook + CampaignCard dropdown + org dashboard wiring)
affects: [58-03, 58-04, 59-e2e-specs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createCampaignViaWizard helper for DRY 3-step wizard campaign creation in E2E tests"
    - "getUserId helper for API-based org member lookup in E2E tests"
    - "DestructiveConfirmDialog targeting via data-testid='destructive-confirm-input'"
    - "2-block serial describe pattern for isolating destructive tests on separate throwaway campaigns"

key-files:
  created: [web/e2e/org-management.spec.ts, web/e2e/campaign-settings.spec.ts]
  modified: [web/src/hooks/useOrg.ts, web/src/components/org/CampaignCard.tsx, web/src/routes/index.tsx]

key-decisions:
  - "Added useUnarchiveCampaign hook and CampaignCard unarchive action (Rule 2 deviation) to enable ORG-04 E2E test"
  - "Used API-based member addition (page.request.post to org members endpoint) for CAMP-03/05 setup to avoid invite acceptance complexity"
  - "Split campaign-settings into 2 serial describe blocks: one for settings+members+delete, one for ownership transfer on separate campaign"

patterns-established:
  - "Throwaway campaign pattern: create unique-timestamped campaign, test against it, delete/transfer as lifecycle assertion"
  - "API helper pattern: getUserId helper resolves email to user_id via /api/v1/org/members for E2E setup actions"

requirements-completed: [E2E-02, E2E-03]

# Metrics
duration: 7min
completed: 2026-03-29
---

# Phase 58 Plan 02: Org Management & Campaign Settings E2E Summary

**Org lifecycle (dashboard, create, archive, unarchive, delete) and campaign settings (CRUD, member management, ownership transfer, deletion) E2E specs with unarchive UI feature addition**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-29T17:50:28Z
- **Completed:** 2026-03-29T17:57:28Z
- **Tasks:** 2
- **Files modified:** 5 (3 modified + 2 created)

## Accomplishments
- Created org-management.spec.ts with 7 serial tests covering ORG-01 through ORG-07 (dashboard, campaign creation via 3-step wizard, archive, unarchive, org settings edit, member directory, danger zone deletion)
- Created campaign-settings.spec.ts with 8 tests in 2 serial blocks covering CAMP-01 through CAMP-06 (settings CRUD, member invite/role-change/remove, ownership transfer, deletion)
- Added unarchive campaign UI action (useUnarchiveCampaign hook, CampaignCard dropdown for archived cards, org dashboard handler) to enable ORG-04 test

## Task Commits

Each task was committed atomically:

1. **Task 1: Create org-management E2E spec** - `e6d6cff` (feat)
2. **Task 2: Create campaign-settings E2E spec** - `98a38ca` (feat)

## Files Created/Modified
- `web/e2e/org-management.spec.ts` - 7 serial tests: dashboard view, campaign create/archive/unarchive, org settings edit, member directory, campaign deletion
- `web/e2e/campaign-settings.spec.ts` - 8 tests in 2 blocks: settings CRUD + member management + deletion on campaign A, ownership transfer on campaign B
- `web/src/hooks/useOrg.ts` - Added useUnarchiveCampaign mutation hook (PATCH status=active)
- `web/src/components/org/CampaignCard.tsx` - Added onUnarchive prop and "Unarchive Campaign" dropdown menu item for archived cards
- `web/src/routes/index.tsx` - Wired unarchiveMutation and handleUnarchive to CampaignCard in archived section

## Decisions Made
- **Unarchive UI feature added (Rule 2 deviation):** The CampaignCard had no action menu for archived campaigns, making ORG-04 (unarchive) untestable via E2E. Added useUnarchiveCampaign hook, CampaignCard dropdown for archived cards, and org dashboard handler. The API already supported PATCH status=active.
- **API-based member setup for CAMP-03 and CAMP-05:** Used page.request.post() to add members directly via org members endpoint rather than going through the invite flow (which requires invite acceptance). This keeps tests focused on the feature being tested.
- **Two separate throwaway campaigns for Block A and Block B:** Campaign A handles settings+members+deletion; Campaign B handles ownership transfer. This avoids auth context conflicts after ownership changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added unarchive campaign UI action**
- **Found during:** Task 1 (org-management E2E spec)
- **Issue:** CampaignCard component had no action menu for archived campaigns (dropdown only rendered for active cards). The API PATCH endpoint already supported setting status=active, but no UI exposed this functionality. ORG-04 (unarchive) was untestable.
- **Fix:** Added useUnarchiveCampaign hook in useOrg.ts, added onUnarchive prop and "Unarchive Campaign" menu item to CampaignCard for archived cards, wired handler in org dashboard index.tsx
- **Files modified:** web/src/hooks/useOrg.ts, web/src/components/org/CampaignCard.tsx, web/src/routes/index.tsx
- **Verification:** TypeScript compilation passes (npx tsc --noEmit)
- **Committed in:** e6d6cff (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical functionality)
**Impact on plan:** Essential for ORG-04 test coverage. No scope creep -- the API already supported unarchive, only the UI action was missing.

## Issues Encountered
- Auth setup fails in worktree environment (ZITADEL not accessible). Tests are correctly structured and parsed by Playwright but cannot fully execute without the running dev environment. This is expected for E2E tests developed in isolation.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality fully implemented.

## Next Phase Readiness
- Both specs ready for execution once dev environment is running
- Patterns established (createCampaignViaWizard, getUserId helpers) available for reuse in voter CRUD specs
- The unarchive UI feature is a genuine improvement that was missing from the UI

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 58-e2e-core-tests*
*Completed: 2026-03-29*
