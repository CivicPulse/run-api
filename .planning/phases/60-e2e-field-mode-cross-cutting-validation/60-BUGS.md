# Phase 60: Bug Tracking

**Created:** 2026-03-29
**Status:** Active -- 1 app bug found, multiple test infrastructure issues fixed

## Summary

### Application Bugs

| ID | Spec | Severity | Status | Description |
|------|------|----------|--------|-------------|
| BUG-01 | field-mode.volunteer.spec.ts | Medium | Open | Phone bank session's call list is completed/empty, no voters available for claiming. The active seed session (`d9dd525f`) links to call list `29146bc5` which has status=completed and 0 available entries. The calling session UI renders progress bar and buttons but no voter card, leaving tests FIELD-08/09/10 unable to verify phone banking flow. Root cause: seed data's phone bank sessions exhaust their call list entries through completed calls, leaving no claimable entries for E2E test volunteers. |

### Application Bugs Fixed During Plan 05

| ID | Category | Description | Fix |
|----|----------|-------------|-----|
| 1 | Campaign member role | `ensure_user_synced()` created CampaignMember records without role (defaulted to NULL/VIEWER), preventing volunteers from accessing volunteer-level endpoints | Set role from JWT claim, added backfill for existing NULL roles |
| 2 | Duplicate assignment 500 | Walk list canvasser and phone bank caller assignment endpoints returned 500 on IntegrityError for duplicate assignments | Added IntegrityError handling returning 409 Conflict |
| 3 | CORS in preview mode | E2E tests failed due to CORS blocking: VITE_API_BASE_URL baked `http://localhost:8000` into JS bundle, causing cross-origin requests from HTTPS preview server | Removed VITE_API_BASE_URL from .env, added preview proxy config to vite.config.ts |

### Infrastructure Issues Resolved (Continued from Plan 03)

| # | Category | Description | Fix |
|---|----------|-------------|-----|
| 1 | ZITADEL config | Preview server redirect URI (https://localhost:4173/callback) not registered | Added via ZITADEL Management API and bootstrap script |
| 2 | User provisioning | E2E test users not created in local ZITADEL | Ran create-e2e-users.py with corrected v2 API |
| 3 | User activation | Users created with management v1 API stayed in INITIAL state | Switched to v2beta API with password.changeRequired=false |
| 4 | MFA requirement | ZITADEL default login policy required MFA setup on first login | Created org-level login policy without MFA |
| 5 | ESM compatibility | data-validation.spec.ts used __dirname (not available in ESM) | Added fileURLToPath polyfill |
| 6 | Auth state capture | Auth setup scripts captured storageState before OIDC callback completed, resulting in empty localStorage (no access tokens) | Added exclusion of /callback and /login paths in waitForURL, plus waitForFunction for oidc.* localStorage keys |
| 7 | API auth in tests | Test helper functions (apiGet, apiPost) only sent cookies, not Bearer token, causing 403/401 on API calls | Added getAccessToken() helper that extracts token from OIDC localStorage entry |
| 8 | Tour blocking | driver.js onboarding tour auto-triggered on field pages, blocking test interactions with overlay | Added suppressTour() to mark tour segments complete in localStorage before tests, plus dismissTourIfVisible() helper |

### Test Bug Fixes Applied

| # | Spec File | Bug | Fix |
|---|-----------|-----|-----|
| 1 | auth-*.setup.ts (all 5) | waitForURL too strict: didn't wait for OIDC callback completion | Added /callback and /login exclusions, waitForFunction for oidc.* keys |
| 2 | auth-*.setup.ts (all 5) | No MFA skip handling | Added MFA heading detection with skip button click |
| 3 | field-mode.volunteer.spec.ts | navigateToSeedCampaign failed for volunteer (403 on org campaigns) | Rewrote to use /api/v1/me/campaigns endpoint for volunteer role |
| 4 | field-mode.volunteer.spec.ts | apiGet/apiPost missing Bearer token auth | Added getAccessToken() helper, included Authorization header |
| 5 | field-mode.volunteer.spec.ts | beforeAll used volunteer token for manager-level operations | Added owner context for canvasser/caller assignment |
| 6 | field-mode.volunteer.spec.ts | Tour popover blocked card clicks | Added suppressTour() and dismissTourIfVisible() helpers |
| 7 | field-mode.volunteer.spec.ts | FIELD-08/09/10 bare skip messages without BUG reference | Added BUG-01 references to all phone banking skip messages |
| 8 | 35 pre-existing specs | Broken waitForURL regex pattern | Fixed in Plan 04 (53 occurrences across 35 files) |
