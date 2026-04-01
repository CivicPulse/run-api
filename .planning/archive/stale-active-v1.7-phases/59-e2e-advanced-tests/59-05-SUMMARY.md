---
phase: 59-e2e-advanced-tests
plan: 05
subsystem: testing
tags: [playwright, e2e, surveys, volunteers, serial-tests]

requires:
  - phase: 57-test-infrastructure
    provides: "Playwright config with role-based auth projects and auth setup"
  - phase: 58-e2e-core-tests
    provides: "Voter CRUD spec pattern (navigateToSeedCampaign, API helper pattern, serial describe blocks)"
provides:
  - "surveys.spec.ts: Survey script lifecycle E2E (CRUD, questions, status, bulk creation)"
  - "volunteers.spec.ts: Volunteer registration, roster, detail, edit, deactivate lifecycle E2E"
affects: [59-e2e-advanced-tests, e2e-ci-pipeline]

tech-stack:
  added: []
  patterns: ["Cookie-forwarding API helpers for survey and volunteer bulk creation", "Status lifecycle testing (draft->active->archived) via UI buttons"]

key-files:
  created:
    - web/e2e/surveys.spec.ts
    - web/e2e/volunteers.spec.ts
  modified: []

key-decisions:
  - "VOL-08 uses Deactivate (status change to inactive) instead of Delete because the API has no DELETE /volunteers endpoint -- roster uses status-based soft-delete pattern"
  - "Question reorder tested via move-up buttons rather than drag-and-drop for headless reliability"

patterns-established:
  - "Survey API helper pattern: createSurveyViaApi, addQuestionViaApi, updateSurveyStatusViaApi for bulk survey+question creation"
  - "Volunteer API helper pattern: createVolunteerViaApi with cookie forwarding for bulk volunteer registration"

requirements-completed: [E2E-16, E2E-17]

duration: 3min
completed: 2026-03-29
---

# Phase 59 Plan 05: Surveys & Volunteers E2E Specs Summary

**Playwright E2E specs for survey script lifecycle (CRUD, question management, status transitions) and volunteer management (registration modes, roster, detail, edit, deactivate) with API bulk creation helpers**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T19:10:58Z
- **Completed:** 2026-03-29T19:14:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Surveys spec (SRV-01 to SRV-08): Full survey script lifecycle including UI creation, 5 question types, edit, reorder, delete, draft->active->archived status lifecycle, API bulk creation of 5 surveys, and survey deletion
- Volunteers spec (VOL-01 to VOL-08): Volunteer registration in record and invite modes, API bulk creation of 10 volunteers (5 non-user + 2 user-linked + 3 UI-created), roster search, detail page tabs, edit via sheet, and deactivate via kebab menu

## Task Commits

Each task was committed atomically:

1. **Task 1: Write surveys E2E spec (E2E-16: SRV-01 through SRV-08)** - `f0d5769` (feat)
2. **Task 2: Write volunteers E2E spec (E2E-17: VOL-01 through VOL-08)** - `980bdd7` (feat)

## Files Created/Modified
- `web/e2e/surveys.spec.ts` - 9 test cases covering survey script CRUD, question add/edit/delete/reorder, status lifecycle, bulk API creation, and deletion
- `web/e2e/volunteers.spec.ts` - 9 test cases covering user/non-user registration, invite mode, API bulk creation, roster view with search, detail page, edit, and deactivate

## Decisions Made
- **VOL-08 uses Deactivate instead of Delete:** The API has no DELETE /volunteers/{id} endpoint. The roster's kebab menu offers "Deactivate" which sets status to "inactive". This aligns with the actual codebase behavior where volunteer records are soft-deleted for audit trail preservation.
- **Question reorder via move-up buttons:** Used aria-labeled move-up/move-down buttons rather than drag-and-drop simulation for reliable headless browser testing.
- **Survey deletion requires draft status:** The ConfirmDialog states "Only draft scripts can be deleted", so SRV-08 creates a throwaway survey in draft status before deleting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] VOL-08 adapted from "Delete" to "Deactivate"**
- **Found during:** Task 2 (Volunteer spec implementation)
- **Issue:** Testing plan specifies VOL-08 as "Delete a volunteer" but the API has no DELETE endpoint for volunteers. The roster UI uses "Deactivate" (status change to inactive).
- **Fix:** Implemented VOL-08 as deactivation via the roster's kebab menu "Deactivate" action, which correctly tests the actual application behavior.
- **Files modified:** web/e2e/volunteers.spec.ts
- **Verification:** Spec confirms volunteer status changes to "Inactive" after deactivation.
- **Committed in:** 980bdd7

---

**Total deviations:** 1 auto-fixed (1 bug adaptation)
**Impact on plan:** Single adaptation necessary because the testing plan assumed a Delete endpoint that doesn't exist. The deactivate approach correctly validates the actual application behavior.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both spec files are self-contained with their own helpers and test data
- Surveys spec creates 5 surveys per D-09 with API bulk creation
- Volunteers spec creates 10 volunteers per D-09 (3 UI + 7 API)
- Both follow D-16 hybrid approach (UI for first few, API for rest)
- Ready for parallel execution with other Phase 59 specs

## Self-Check: PASSED

All artifacts verified:
- web/e2e/surveys.spec.ts: FOUND
- web/e2e/volunteers.spec.ts: FOUND
- Commit f0d5769 (Task 1): FOUND
- Commit 980bdd7 (Task 2): FOUND

---
*Phase: 59-e2e-advanced-tests*
*Completed: 2026-03-29*
