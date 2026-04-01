# Research Summary: v1.7 Testing & Validation

**Domain:** Comprehensive E2E testing pipeline, test user provisioning, small feature gap fixes
**Researched:** 2026-03-29
**Overall confidence:** HIGH

## Executive Summary

The v1.7 milestone is primarily a testing and validation effort, not a feature development effort. The testing plan (`docs/testing-plan.md`) defines ~130 test cases across 34 sections covering every UI route, form, button, and user-facing action in the application. Two small features must be built before testing can begin (voter note edit/delete and walk list rename UI), and 15 test users must be provisioned in ZITADEL across 5 campaign roles and 2 org roles. The milestone's success criterion is a 100% pass rate on the testing plan.

The most significant finding of this research is that **zero new packages are needed**. The existing stack (Playwright ^1.58.2, @axe-core/playwright, pytest, ZITADEL v2.71.6 Management API v1) provides every capability required. The work is configuration expansion (playwright.config.ts projects, create-e2e-users.py user list, CI environment variables), feature implementation (2 API endpoints + 2 UI components), and test authoring (~30 new spec files).

The ZITADEL test user provisioning is the single gating dependency for all test work. The existing `scripts/create-e2e-users.py` already implements the exact pattern needed -- ZITADEL Management API v1 user creation with `isEmailVerified: true` and `passwordChangeRequired: false` for immediately-loginable users, plus direct DB insertion for org membership. Expanding from 2 users to 15 users is a data-only change.

The highest-risk area is the RBAC test suite (RBAC-01 through RBAC-09), which requires 5 distinct Playwright auth contexts and verifies the security permission matrix. A regression here means data leaks between campaigns or unauthorized mutations. The highest-effort area is the entity CRUD lifecycle tests (~80 test cases across 15+ spec files), which exercise every form, dialog, and action menu in the application.

## Key Findings

**Stack:** No new packages. Extend existing Playwright + ZITADEL Management API v1 + pytest infrastructure.

**Architecture:** Expand Playwright config from 3 auth projects to 5+, expand E2E user provisioning from 2 to 15 users, add 2 API endpoints and 2 UI components.

**Critical pitfall:** ZITADEL user provisioning must create users with `isEmailVerified: true` AND `passwordChangeRequired: false` AND project role grants. Missing any of these produces users that cannot log in or lack the correct role for testing. The existing script handles all three correctly.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Feature Builds** - Build voter note edit/delete API + UI and walk list rename UI
   - Addresses: NOTE-02, NOTE-03, WL-05 test prerequisites
   - Avoids: Blocking test authoring on missing features

2. **Test Infrastructure** - Expand user provisioning to 15 users, expand Playwright auth projects to 5 roles, update CI workflow
   - Addresses: AUTH-01 through AUTH-04, RBAC-01 through RBAC-09 prerequisites
   - Avoids: Test specs written but unable to run due to missing auth contexts

3. **E2E Test Authoring (Core)** - Write spec files for RBAC, campaign settings, org management, voter CRUD, contacts, tags, notes, lists
   - Addresses: Sections 3-14 of the testing plan (~70 test cases)
   - Avoids: Over-engineering by following existing inline locator patterns (no POM refactor)

4. **E2E Test Authoring (Advanced)** - Write specs for canvassing, phone banking, field mode, imports, data validation, surveys, volunteers, shifts
   - Addresses: Sections 15-28 of the testing plan (~50 test cases)
   - Avoids: Polygon drawing and map interaction tests are the hardest to automate -- save for last

5. **Cross-Cutting and Validation** - Write specs for navigation, empty states, accessibility, form guards; run full suite and fix failures
   - Addresses: Sections 29-34, test-fix-retest cycle to 100% pass rate
   - Avoids: Writing AI prod instructions before local tests pass (instructions should reflect reality)

6. **AI Production Testing Instructions** - Transform testing plan into production-specific step-by-step instructions
   - Addresses: Documentation deliverable for AI-driven production testing
   - Avoids: Duplicating the testing plan -- focus on production-specific differences (URLs, auth, data)

**Phase ordering rationale:**
- Feature builds must come first because they unblock specific test cases
- Infrastructure must precede test authoring because specs need auth contexts to run
- Core CRUD tests before advanced tests because they validate the basic Playwright patterns
- Cross-cutting last because it depends on all features being tested individually
- AI prod instructions last because they should reflect a validated local test suite

**Research flags for phases:**
- Phase 1: Standard patterns, no research needed (existing CRUD patterns)
- Phase 2: Standard patterns, no research needed (extending existing scripts/configs)
- Phase 3-4: No research needed (Playwright test authoring is well-documented)
- Phase 5: May need research if test failures reveal unexpected UI behavior
- Phase 6: No research needed (documentation task)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages. Every tool verified as already installed in the codebase. |
| Features | HIGH | Testing plan is exhaustively detailed. Feature builds are minimal scope. |
| Architecture | HIGH | Extending existing patterns (playwright.config.ts, create-e2e-users.py) |
| Pitfalls | HIGH | Critical pitfalls identified from ZITADEL API behavior and Playwright auth patterns |

## Gaps to Address

- **Email domain for test users:** The testing plan uses `@test.civicpulse.local` but existing users use `@localhost`. Need to decide which domain to use. Using `@localhost` is simpler (matches existing ZITADEL config) but less distinguishable from non-test users.
- **Campaign membership assignment:** The existing create-e2e-users.py handles ZITADEL project roles and org membership but does NOT create campaign membership records. The testing plan expects users to be campaign members. Either the test suite assigns members as part of RBAC-01, or the provisioning script is extended to create campaign memberships. RBAC-01 explicitly tests member assignment as a test case, so the provisioning script should NOT pre-assign campaign roles -- let the test exercise the invite flow.
- **Test data isolation between runs:** The testing plan assumes a clean state from seed data. Running tests multiple times may leave residual data. Consider a test-start cleanup phase or accepting that seed re-run is the reset mechanism.
- **Turf polygon automation:** TURF-01 and TURF-02 require drawing polygons on a Leaflet map via Playwright. This is technically complex (dispatching mouse events on a canvas-like element). May need to use the GeoJSON import path as an alternative to polygon drawing for test automation.
