---
phase: 57-test-infrastructure
plan: 02
subsystem: testing
tags: [playwright, e2e, ci, github-actions, sharding, auth]

# Dependency graph
requires:
  - phase: 57-01
    provides: "Playwright config with 5 role-based projects and storageState paths"
provides:
  - "5 role-based auth setup files (owner, admin, manager, volunteer, viewer)"
  - "Sharded CI workflow with 4 parallel E2E test runners"
  - "Merged HTML report from blob reports across shards"
affects: [58-e2e-tests, 59-e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: ["CI sharding with blob reporter and merge-reports", "Role-based env vars for E2E auth"]

key-files:
  created:
    - web/e2e/auth-owner.setup.ts
    - web/e2e/auth-admin.setup.ts
    - web/e2e/auth-manager.setup.ts
    - web/e2e/auth-viewer.setup.ts
  modified:
    - web/e2e/auth-volunteer.setup.ts
    - .github/workflows/pr.yml
    - web/e2e/role-gated.admin.spec.ts (renamed from role-gated.orgadmin.spec.ts)

key-decisions:
  - "Followed auth-orgadmin.setup.ts pattern (no password change handling) for all 5 role auth files"
  - "Split monolithic integration-e2e job into 3 independent jobs for parallel execution"

patterns-established:
  - "Auth setup pattern: import.meta.dirname + storageState save + env var fallback with @localhost defaults"
  - "CI sharding: blob reporter per shard, download + merge-reports in separate job"

requirements-completed: [INFRA-02, INFRA-03]

# Metrics
duration: 2min
completed: 2026-03-29
---

# Phase 57 Plan 02: Auth Setup Files & CI Sharding Summary

**5 role-based Playwright auth setup files with 4-shard CI parallelism and merged HTML reports**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-29T16:31:34Z
- **Completed:** 2026-03-29T16:34:01Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created 5 role-based auth setup files (owner, admin, manager, volunteer, viewer) with correct credentials and storageState paths matching the Playwright config from Plan 01
- Migrated org admin spec to new naming convention (role-gated.orgadmin.spec.ts -> role-gated.admin.spec.ts)
- Replaced monolithic integration-e2e CI job with 3 independent jobs: integration tests, 4-shard E2E matrix, and report merger
- Cleaned up legacy auth files (auth.setup.ts, auth-orgadmin.setup.ts) and old env var naming

## Task Commits

Each task was committed atomically:

1. **Task 1: Create 5 role-based auth setup files and migrate spec** - `0558a64` (feat)
2. **Task 2: Configure CI workflow for sharded E2E tests with merged reports** - `c1e0d52` (feat)

## Files Created/Modified
- `web/e2e/auth-owner.setup.ts` - Owner auth setup (owner1@localhost -> owner.json)
- `web/e2e/auth-admin.setup.ts` - Admin auth setup (admin1@localhost -> admin.json)
- `web/e2e/auth-manager.setup.ts` - Manager auth setup (manager1@localhost -> manager.json)
- `web/e2e/auth-volunteer.setup.ts` - Volunteer auth setup (volunteer1@localhost -> volunteer.json, updated credentials)
- `web/e2e/auth-viewer.setup.ts` - Viewer auth setup (viewer1@localhost -> viewer.json)
- `web/e2e/role-gated.admin.spec.ts` - Renamed from role-gated.orgadmin.spec.ts to match admin project testMatch
- `.github/workflows/pr.yml` - Sharded E2E CI with integration, e2e-tests (4 shards), merge-e2e-reports jobs

## Decisions Made
- Followed auth-orgadmin.setup.ts pattern (no password change handling) for all 5 role auth files, since E2E users are created with `passwordChangeRequired: false`
- Split monolithic integration-e2e job into 3 independent jobs: Python integration tests run separately from E2E shards, avoiding unnecessary Docker Compose overhead on the integration job for Node.js tooling

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 5 auth setup files ready for E2E test execution
- CI workflow ready for sharded test runs on PR
- Phase 57 test infrastructure complete, ready for Phase 58+ E2E test authoring

## Self-Check: PASSED

All 8 files verified present. Both task commits (0558a64, c1e0d52) verified in git log.

---
*Phase: 57-test-infrastructure*
*Completed: 2026-03-29*
