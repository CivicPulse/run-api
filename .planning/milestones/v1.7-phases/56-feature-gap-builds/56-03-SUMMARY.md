---
phase: 56-feature-gap-builds
plan: 03
subsystem: testing
tags: [playwright, visual-verification, screenshots, e2e, docker]

# Dependency graph
requires:
  - phase: 56-01
    provides: PATCH/DELETE voter interaction endpoints and PATCH walk list rename endpoint
  - phase: 56-02
    provides: useUpdateInteraction, useDeleteInteraction, useRenameWalkList hooks and HistoryTab/canvassing UI
provides:
  - Visual verification of all 3 features via 15 Playwright screenshots
  - Reusable verify-56-03.mjs script for future regression testing
  - Dockerfile fix adding libpq-dev for psycopg v3 compatibility
affects: [testing, docker, deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playwright headless verification script with OIDC login flow"
    - "Screenshot-based visual verification for UI features"

key-files:
  created:
    - scripts/verify-56-03.mjs
  modified:
    - Dockerfile

key-decisions:
  - "Added libpq-dev to both dev and runtime Docker stages to support psycopg v3 (required by procrastinate)"
  - "Used standalone Playwright script (not test runner) for rapid visual verification with OIDC auth"

patterns-established:
  - "Visual verification script pattern: login via OIDC, navigate, interact, screenshot"

requirements-completed: [FEAT-01, FEAT-02, FEAT-03]

# Metrics
duration: 16min
completed: 2026-03-29
---

# Phase 56 Plan 03: Visual Verification of Note Edit/Delete and Walk List Rename Summary

**Playwright-automated visual verification of all 3 features (note edit, note delete, walk list rename) across 5 test scenarios with 15 screenshots confirming full-stack functionality**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-29T15:18:43Z
- **Completed:** 2026-03-29T15:35:27Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- All 5 visual tests passed confirming FEAT-01 (note edit), FEAT-02 (note delete), and FEAT-03 (walk list rename) work end-to-end
- 15 screenshots captured via headless Playwright with OIDC login against local ZITADEL
- Verified: Edit Note dialog opens with pre-filled text, saves successfully, updated text visible in History tab
- Verified: Delete Note confirmation dialog with destructive styling, note removed from list after confirmation
- Verified: Non-note interactions (Survey Response, Phone Call, Door Knock) show no 3-dot menu
- Verified: Walk list rename from canvassing index via dropdown menu with Rename/Delete options
- Verified: Walk list rename from detail page via pencil icon in header
- Verified: Renamed walk list name visible on both pages with success toasts

## Task Commits

Each task was committed atomically:

1. **Task 1: Visual verification of note edit/delete and walk list rename features** - `b07c5b0` (chore)

## Files Created/Modified
- `scripts/verify-56-03.mjs` - Standalone Playwright verification script with OIDC login, 5 test scenarios, 15 screenshots
- `Dockerfile` - Added libpq-dev to dev and runtime stages for psycopg v3 support

## Decisions Made
- Added libpq-dev to Dockerfile because procrastinate depends on psycopg v3 which requires libpq. Previously the container happened to work from a cached image but rebuilding exposed the missing dependency.
- Used standalone Playwright script (not the project's test runner) because the verification needs the dev server at localhost:5173, not the preview server at localhost:4173.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing libpq-dev in Dockerfile**
- **Found during:** Task 1 (environment setup for visual verification)
- **Issue:** Rebuilding the API Docker container exposed a missing `libpq-dev` system dependency. The `procrastinate` package depends on `psycopg` v3 which requires `libpq` at runtime. The Dockerfile only had `libgeos-dev`.
- **Fix:** Added `libpq-dev` to both the `dev` and `runtime` stages of the Dockerfile.
- **Files modified:** Dockerfile
- **Verification:** API container starts successfully, all services healthy
- **Committed in:** b07c5b0 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix to enable visual verification. The libpq-dev dependency was always needed but masked by a cached Docker image.

## Issues Encountered
- Initial login attempts failed because the script used remote ZITADEL credentials (`auth.civpulse.org`) but the dev environment actually uses local ZITADEL at `localhost:8080` (configured via the bootstrap script). Fixed by using `admin@localhost` / `Admin1234!` credentials.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - this is a verification-only plan with no application code changes.

## Screenshots Reference

| Screenshot | Test | What it shows |
|-----------|------|---------------|
| 56-03-00-logged-in.png | Setup | Authenticated org dashboard |
| 56-03-01-history-tab.png | Test 1 | Voter History tab initial state |
| 56-03-02-note-added.png | Test 1 | Note created in History tab |
| 56-03-03-note-dropdown.png | Test 1 | 3-dot menu with Edit/Delete options |
| 56-03-04-edit-dialog.png | Test 1 | Edit Note dialog with pre-filled text |
| 56-03-05-note-edited.png | Test 1 | Updated note text visible + success toast |
| 56-03-06-delete-confirm.png | Test 2 | Delete Note confirmation dialog |
| 56-03-07-note-deleted.png | Test 2 | Note removed + success toast |
| 56-03-08-non-note-no-menu.png | Test 3 | Non-note interactions without menu |
| 56-03-09-canvassing-index.png | Test 4 | Canvassing page with walk list table |
| 56-03-10-walklist-dropdown.png | Test 4 | Walk list dropdown (Rename/Delete) |
| 56-03-11-walklist-rename-dialog.png | Test 4 | Rename dialog from index |
| 56-03-12-walklist-renamed.png | Test 4 | New name in table + success toast |
| 56-03-13-walklist-detail.png | Test 5 | Walk list detail with pencil icon |
| 56-03-14-walklist-detail-rename.png | Test 5 | Rename dialog from detail page |
| 56-03-15-walklist-detail-saved.png | Test 5 | Restored name + success toast |

## Next Phase Readiness
- All Phase 56 features (note edit, note delete, walk list rename) are verified working end-to-end
- Phase 56 complete - ready to proceed to Phase 57 (test infrastructure)

## Self-Check: PASSED

- scripts/verify-56-03.mjs: FOUND
- Dockerfile: FOUND
- Commit b07c5b0: FOUND
- Screenshots (56-03-*.png): 17 files present

---
*Phase: 56-feature-gap-builds*
*Completed: 2026-03-29*
