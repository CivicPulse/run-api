---
phase: 46-e2e-testing-integration
plan: 01
subsystem: testing
tags: [e2e, playwright, authentication, voter-search, voter-import]
dependency_graph:
  requires: [playwright, zitadel]
  provides: [auth-setup-project, e2e-login-spec, e2e-voter-search-spec, e2e-voter-import-spec]
  affects: [web/e2e/, web/playwright.config.ts]
tech_stack:
  added: []
  patterns: [playwright-setup-project, storageState-persistence, fresh-context-auth-tests]
key_files:
  created:
    - web/e2e/auth.setup.ts
    - web/e2e/login.spec.ts
    - web/e2e/voter-search.spec.ts
    - web/e2e/voter-import.spec.ts
    - web/playwright/.auth/.gitkeep
  modified:
    - web/playwright.config.ts
    - web/.gitignore
decisions:
  - "Setup project pattern with storageState for ZITADEL OIDC auth reuse across specs"
  - "Login spec uses browser.newContext() for fresh auth state testing"
  - "No page.route mocks — all specs hit real Docker Compose backend"
metrics:
  duration: 3min
  completed: "2026-03-25T01:33:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 7
---

# Phase 46 Plan 01: Playwright Auth Setup and Core E2E Specs Summary

Playwright setup project authenticates against ZITADEL OIDC and persists storageState; 3 E2E spec files cover login (fresh context, 3 tests), voter search (search/filter/detail, 3 tests), and voter import (CSV upload with column mapping verification).

## What Was Done

### Task 1: Playwright auth setup project and config update (f960b58)

- Created `web/e2e/auth.setup.ts` — authenticates against ZITADEL via OIDC redirect flow, fills login name and password using `getByLabel`/`getByRole` selectors, waits for app redirect, persists `storageState` to `playwright/.auth/user.json`
- Updated `web/playwright.config.ts` — added `setup` project with `testMatch: /.*\.setup\.ts/`, chromium project depends on setup and loads stored auth state, added `actionTimeout: 30_000` for reliable OIDC flow waits
- Created `web/playwright/.auth/.gitkeep` directory structure
- Added `playwright/.auth/user.json` to `web/.gitignore`

### Task 2: Login, voter search, and voter import E2E specs (583a699)

- Created `web/e2e/login.spec.ts` — 3 tests: successful login via OIDC, invalid credentials error display, unauthenticated redirect. All use `browser.newContext()` for fresh auth state.
- Created `web/e2e/voter-search.spec.ts` — 3 tests: search by name (expects "James" from seed data), filter by party, view voter detail with navigation. Uses stored auth state.
- Created `web/e2e/voter-import.spec.ts` — 1 comprehensive test: CSV upload via `setInputFiles` with Buffer, column mapping wizard, import confirmation, and verification that imported voter ("TestImport1") appears in list.

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Setup project pattern**: Used Playwright's official setup project pattern with `storageState` persistence for OIDC auth reuse across all chromium project specs
2. **Fresh context for login tests**: Login spec creates `browser.newContext()` without stored state to properly test the OIDC flow itself
3. **No API mocks**: All specs use `page.waitForResponse()` for API call synchronization instead of `page.route()` mocks (per D-03)

## Verification Results

- All 4 E2E files exist: auth.setup.ts, login.spec.ts, voter-search.spec.ts, voter-import.spec.ts
- Zero `page.route` calls across all 3 spec files (no API mocking)
- Setup project configured in playwright.config.ts with dependency chain
- StorageState wired to chromium project

## Known Stubs

None -- all specs contain complete test implementations.

## Self-Check: PASSED
