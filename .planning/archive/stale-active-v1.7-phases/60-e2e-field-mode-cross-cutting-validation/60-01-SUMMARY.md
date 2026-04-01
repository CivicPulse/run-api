---
phase: 60-e2e-field-mode-cross-cutting-validation
plan: 01
subsystem: e2e-testing
tags: [e2e, playwright, field-mode, mobile, offline, tour, volunteer]
dependency_graph:
  requires: [web/playwright.config.ts, web/e2e/auth-volunteer.setup.ts]
  provides: [web/e2e/field-mode.volunteer.spec.ts]
  affects: [web/e2e/]
tech_stack:
  added: []
  patterns: [mobile-viewport-emulation, context-setOffline, serial-describe, cookie-forwarding-api-helpers]
key_files:
  created:
    - web/e2e/field-mode.volunteer.spec.ts
  modified: []
decisions:
  - Used manual viewport/touch settings (390x844, hasTouch, isMobile) instead of devices['iPhone 14'] which defaults to webkit
  - Tour localStorage key is 'tour-state' matching the Zustand persist name in tourStore.ts
  - API-based volunteer assignment setup in beforeAll using canvasser/caller endpoints
  - Offline tests use context.setOffline() for network simulation per D-01
  - Sync verification uses waitForResponse for door-knocks endpoint per D-03
metrics:
  duration: 4m
  completed: "2026-03-29T21:03:00Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 60 Plan 01: Field Mode E2E Spec Summary

Field mode Playwright E2E spec with 16 test cases covering volunteer hub, canvassing wizard, phone banking, offline queue, and onboarding tour -- all under volunteer auth at iPhone 14 mobile viewport.

## What Was Built

### web/e2e/field-mode.volunteer.spec.ts (1155 lines)

Complete field mode E2E test suite organized into 5 serial describe blocks:

1. **Volunteer Hub (FIELD-01, FIELD-02):** Validates assignment card rendering with door/call counts, pull-to-refresh via touch gesture simulation.

2. **Canvassing Wizard (FIELD-03 through FIELD-07):** Tests hub-to-canvassing navigation, household card with Google Maps link, door knock outcome recording with bulk toast handling, progress bar tracking, session persistence via reload with resume prompt, and inline survey (or survey-absent negative test).

3. **Phone Banking (FIELD-08 through FIELD-10):** Tests hub-to-phone-banking navigation, voter card with phone list, tap-to-call via `tel:` href verification, E.164 phone number formatting, and outcome recording with auto-advance.

4. **Offline Support (OFFLINE-01 through OFFLINE-03):** Tests offline banner appearance via `context.setOffline(true)`, outcome queueing while offline with UI count assertion ("N outcomes saved"), and auto-sync on reconnection verified via `waitForResponse()` on `/door-knocks` endpoint.

5. **Onboarding Tour (TOUR-01 through TOUR-03):** Tests first-time tour auto-start after clearing `tour-state` localStorage, tour replay via `[data-tour='help-button']`, and tour completion persistence across page reload.

### API Helper Functions

- `navigateToSeedCampaign()` -- Navigates to seed campaign, handles various landing pages
- `getMyUserId()` -- Fetches volunteer user ID via `/users/me` with storage state fallback
- `assignCanvasser()` -- POSTs to walk list canvassers endpoint (accepts 201/409)
- `assignCaller()` -- POSTs to phone bank session callers endpoint (accepts 201/409)
- `getWalkLists()` / `getPhoneBankSessions()` -- Fetches seed data entities for assignment setup

### Key Design Choices

- Manual `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })` instead of `devices['iPhone 14']` to stay in Chromium (webkit incompatible with volunteer project)
- `beforeAll` setup assigns test volunteer to walk list and phone bank session via API before any tests run
- Tour tests manipulate `tour-state` localStorage key (matching Zustand persist config)
- Offline tests use `context.setOffline()` (triggers `navigator.onLine` events that OfflineBanner watches)
- All locators use data-tour attributes, getByRole, getByText -- no CSS class selectors

## Task Log

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write field-mode.volunteer.spec.ts with 16 test cases | d083530 | web/e2e/field-mode.volunteer.spec.ts |

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all 16 test cases are fully implemented with real assertions and no placeholder logic.

## Self-Check: PASSED

- [x] web/e2e/field-mode.volunteer.spec.ts exists
- [x] Commit d083530 exists in git log
- [x] Playwright --list shows 16 tests + 1 auth setup (17 total) with no syntax errors
- [x] All test IDs (FIELD-01..10, OFFLINE-01..03, TOUR-01..03) present in spec
