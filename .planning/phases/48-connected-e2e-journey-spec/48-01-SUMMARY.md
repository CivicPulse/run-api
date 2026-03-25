---
phase: 48-connected-e2e-journey-spec
plan: 01
subsystem: testing
tags: [playwright, e2e, serial-test, campaign-creation, turf, voter, phone-banking]

requires:
  - phase: 42-map-turf-editor
    provides: TurfForm component with GeoJSON boundary input
  - phase: 43-org-dashboard
    provides: Campaign list page and campaign creation form
provides:
  - Connected E2E journey spec verifying cross-phase feature composition
affects: [e2e-testing, ci-pipeline]

tech-stack:
  added: []
  patterns: [serial-test-step-journey, login-helper-reuse, response-interception]

key-files:
  created:
    - web/e2e/connected-journey.spec.ts
  modified: []

key-decisions:
  - "Adapted from plan wizard flow to actual single-form campaign creation (no multi-step wizard exists)"
  - "TurfForm uses simple textarea for boundary, not GeoJSON toggle panel described in plan interfaces"
  - "Login helper follows established project pattern (ZITADEL OIDC redirect with username/password)"
  - "Phone banking index redirects to call-lists, so assertion checks for call list or phone bank text"

patterns-established:
  - "Connected journey pattern: serial test.step blocks sharing page state across features"
  - "Response interception: waitForResponse before click for API verification"

requirements-completed: [TEST-01]

duration: 2min
completed: 2026-03-25
---

# Phase 48 Plan 01: Connected E2E Journey Spec Summary

**Single Playwright spec verifying full user journey: campaign list, campaign creation with POST verification, turf creation with GeoJSON, voter section, and phone bank section across 5 serial test.step blocks**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T17:28:54Z
- **Completed:** 2026-03-25T17:31:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Connected E2E spec at `web/e2e/connected-journey.spec.ts` (159 lines) covering 5 journey stages
- Campaign creation with POST /api/v1/campaigns response interception and status verification
- Turf creation with GeoJSON polygon on freshly created campaign
- Voter and phone bank sections verified accessible on new campaign
- Auto-discovered by existing Playwright config (*.spec.ts pattern match)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create connected journey E2E spec** - `2b61777` (feat)

## Files Created/Modified
- `web/e2e/connected-journey.spec.ts` - Connected E2E journey spec with 5 serial test.step blocks

## Decisions Made
- Adapted campaign creation flow from planned wizard (3 steps with invite skip) to actual single-form submission, since the codebase has a simple form at campaigns/new.tsx, not a multi-step wizard
- Used simple textarea fill for turf boundary GeoJSON instead of toggle panel, matching actual TurfForm component
- Followed existing login helper pattern from other specs (ZITADEL OIDC redirect)
- Phone banking assertion checks for either "call list" or "phone bank" text since index redirects to call-lists

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted campaign creation to actual UI (not wizard)**
- **Found during:** Task 1 (reading web/src/routes/campaigns/new.tsx)
- **Issue:** Plan interfaces described a multi-step wizard with "Continue to Review", "Continue to Invite", and "Skip" steps. The actual codebase has a single-page form with Name, Type, and Create Campaign button.
- **Fix:** Wrote spec to match actual UI: fill name, select type via combobox, click Create Campaign
- **Files modified:** web/e2e/connected-journey.spec.ts
- **Verification:** Spec structure matches actual component markup

**2. [Rule 3 - Blocking] Adapted turf form to actual component (no GeoJSON toggle)**
- **Found during:** Task 1 (reading TurfForm.tsx)
- **Issue:** Plan referenced GeoJSON toggle button, #geojson-panel, and #boundary selectors. Actual TurfForm has simple Label/Input/Textarea fields.
- **Fix:** Used getByLabel(/^name$/i) and getByLabel(/boundary/i) matching actual form labels
- **Files modified:** web/e2e/connected-journey.spec.ts
- **Verification:** Selectors match TurfForm.tsx markup

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations necessary to match actual codebase. Plan interfaces were based on research that described a different UI version. Spec correctly targets current components.

## Known Stubs
None - all journey steps interact with real UI components and API endpoints.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Connected journey spec ready for CI integration
- Spec requires Docker Compose stack running with ZITADEL for authentication

---
*Phase: 48-connected-e2e-journey-spec*
*Completed: 2026-03-25*
