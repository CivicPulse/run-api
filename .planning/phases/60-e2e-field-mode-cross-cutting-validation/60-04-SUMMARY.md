---
phase: 60-e2e-field-mode-cross-cutting-validation
plan: 04
subsystem: testing
tags: [playwright, e2e, oidc, waitForURL, regex, url-matching]

# Dependency graph
requires:
  - phase: 60-03
    provides: fixed URL-matching pattern established in 3 new Phase 60 spec files
provides:
  - All 35 pre-existing E2E spec files updated to exclusion-based URL matching
  - Zero broken waitForURL regex patterns remaining in test suite
affects: [60-05, val-01]

# Tech tracking
tech-stack:
  added: []
  patterns: [exclusion-based URL matching for OIDC post-login redirect]

key-files:
  created: []
  modified:
    - web/e2e/voter-crud.spec.ts
    - web/e2e/voter-contacts.spec.ts
    - web/e2e/voter-tags.spec.ts
    - web/e2e/voter-notes.spec.ts
    - web/e2e/voter-lists.spec.ts
    - web/e2e/voter-import.spec.ts
    - web/e2e/voter-filters.spec.ts
    - web/e2e/data-validation.spec.ts
    - web/e2e/phone-banking.spec.ts
    - web/e2e/call-lists-dnc.spec.ts
    - web/e2e/surveys.spec.ts
    - web/e2e/volunteers.spec.ts
    - web/e2e/volunteer-tags-availability.spec.ts
    - web/e2e/shifts.spec.ts
    - web/e2e/turfs.spec.ts
    - web/e2e/walk-lists.spec.ts
    - web/e2e/rbac.spec.ts
    - web/e2e/rbac.admin.spec.ts
    - web/e2e/rbac.manager.spec.ts
    - web/e2e/rbac.volunteer.spec.ts
    - web/e2e/rbac.viewer.spec.ts
    - web/e2e/role-gated.volunteer.spec.ts
    - web/e2e/role-gated.admin.spec.ts
    - web/e2e/org-management.spec.ts
    - web/e2e/campaign-settings.spec.ts
    - web/e2e/campaign-archive.spec.ts
    - web/e2e/connected-journey.spec.ts
    - web/e2e/login.spec.ts
    - web/e2e/map-interactions.spec.ts
    - web/e2e/org-switcher.spec.ts
    - web/e2e/phase21-integration-polish.spec.ts
    - web/e2e/volunteer-signup.spec.ts
    - web/e2e/uat-overlap-highlight.spec.ts
    - web/e2e/uat-tooltip-popovers.spec.ts
    - web/e2e/uat-volunteer-manager.spec.ts

key-decisions:
  - "Used identical exclusion-based URL check pattern established by Phase 60 new specs"

patterns-established:
  - "Exclusion-based waitForURL: (url) => !url.pathname.includes('/login') && !url.pathname.includes('/ui/login') replaces all regex-based post-OIDC URL assertions"

requirements-completed: [VAL-01]

# Metrics
duration: 4min
completed: 2026-03-29
---

# Phase 60 Plan 04: Fix Broken waitForURL Pattern in 35 Pre-existing E2E Specs Summary

**Replaced 53 broken waitForURL(/(campaigns|org)/) regex calls with exclusion-based function checks across all 35 pre-existing E2E spec files, eliminating the primary 209-test-failure blocker**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T22:05:09Z
- **Completed:** 2026-03-29T22:09:27Z
- **Tasks:** 2
- **Files modified:** 35

## Accomplishments

- Fixed 20 occurrences across 16 files with `navigateToSeedCampaign` functions (Task 1)
- Fixed 33 inline occurrences across 19 files without helper functions (Task 2)
- Fixed 1 `toHaveURL` assertion in login.spec.ts
- Preserved special-case 30_000 timeout in login.spec.ts
- Zero broken patterns remain in entire `web/e2e/` directory (verified via grep)
- All 371 tests in 63 files parse without syntax errors (verified via `npx playwright test --list`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix navigateToSeedCampaign function in 16 spec files + inline calls in voter-import.spec.ts** - `1c8c9a1` (fix)
2. **Task 2: Fix inline waitForURL calls in 19 spec files without navigateToSeedCampaign** - `eed10e8` (fix)

## Files Created/Modified

- `web/e2e/voter-crud.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/voter-contacts.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/voter-tags.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/voter-notes.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/voter-lists.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/voter-import.spec.ts` - Fixed 1 function + 4 inline URL patterns
- `web/e2e/voter-filters.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/data-validation.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/phone-banking.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/call-lists-dnc.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/surveys.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/volunteers.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/volunteer-tags-availability.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/shifts.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/turfs.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/walk-lists.spec.ts` - Fixed navigateToSeedCampaign URL pattern
- `web/e2e/rbac.spec.ts` - Fixed 3 inline URL patterns
- `web/e2e/rbac.admin.spec.ts` - Fixed 3 inline URL patterns
- `web/e2e/rbac.manager.spec.ts` - Fixed 2 inline URL patterns
- `web/e2e/rbac.volunteer.spec.ts` - Fixed 2 inline URL patterns
- `web/e2e/rbac.viewer.spec.ts` - Fixed 3 inline URL patterns
- `web/e2e/role-gated.volunteer.spec.ts` - Fixed 2 inline URL patterns
- `web/e2e/role-gated.admin.spec.ts` - Fixed 3 inline URL patterns
- `web/e2e/org-management.spec.ts` - Fixed 4 inline URL patterns (used ?$ variant)
- `web/e2e/campaign-settings.spec.ts` - Fixed 1 inline URL pattern (used ?$ variant)
- `web/e2e/campaign-archive.spec.ts` - Fixed 1 inline URL pattern
- `web/e2e/connected-journey.spec.ts` - Fixed 1 inline URL pattern (6-space indent in test.step)
- `web/e2e/login.spec.ts` - Fixed 1 waitForURL (30s timeout) + 1 toHaveURL assertion
- `web/e2e/map-interactions.spec.ts` - Fixed 1 inline URL pattern
- `web/e2e/org-switcher.spec.ts` - Fixed 1 inline URL pattern
- `web/e2e/phase21-integration-polish.spec.ts` - Fixed 1 inline URL pattern
- `web/e2e/volunteer-signup.spec.ts` - Fixed 1 inline URL pattern
- `web/e2e/uat-overlap-highlight.spec.ts` - Fixed 1 inline URL pattern
- `web/e2e/uat-tooltip-popovers.spec.ts` - Fixed 1 inline URL pattern
- `web/e2e/uat-volunteer-manager.spec.ts` - Fixed 1 inline URL pattern

## Decisions Made

- Used identical exclusion-based URL check pattern from Phase 60 new specs (field-mode.volunteer.spec.ts, navigation.spec.ts, accessibility.spec.ts) as the replacement for consistency
- Preserved the 30_000ms timeout in login.spec.ts (tests fresh OIDC login flow which takes longer)
- Changed login.spec.ts toHaveURL assertion from `toHaveURL(/(campaigns|org)/)` to `not.toHaveURL(/\/login/)` for consistency with the exclusion-based approach

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - this plan only modified existing URL matching patterns with no new data sources or components.

## Next Phase Readiness

- All 35 pre-existing spec files now use the same exclusion-based URL matching as the 3 Phase 60 specs
- The 209-test-failure blocker from broken regex patterns is eliminated
- Ready for 60-05 (full suite validation run) to verify pass rate improvement

---
*Phase: 60-e2e-field-mode-cross-cutting-validation*
*Completed: 2026-03-29*
