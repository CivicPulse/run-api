# Phase 60: Bug Tracking

**Created:** 2026-03-29
**Status:** Complete -- no app bugs found

## Summary

No application bugs discovered during Phase 60 E2E test-fix-retest cycle. All test failures were caused by test infrastructure issues (ZITADEL configuration, user provisioning, ESM compatibility) and test-logic bugs (URL pattern matching), all of which were fixed inline.

### Infrastructure Issues Resolved

| # | Category | Description | Fix |
|---|----------|-------------|-----|
| 1 | ZITADEL config | Preview server redirect URI (https://localhost:4173/callback) not registered | Added via ZITADEL Management API and bootstrap script |
| 2 | User provisioning | E2E test users not created in local ZITADEL | Ran create-e2e-users.py with corrected v2 API |
| 3 | User activation | Users created with management v1 API stayed in INITIAL state | Switched to v2beta API with password.changeRequired=false |
| 4 | MFA requirement | ZITADEL default login policy required MFA setup on first login | Created org-level login policy without MFA |
| 5 | ESM compatibility | data-validation.spec.ts used __dirname (not available in ESM) | Added fileURLToPath polyfill |

### Test Bug Fixes Applied

| # | Spec File | Bug | Fix |
|---|-----------|-----|-----|
| 1 | auth-*.setup.ts (all 5) | waitForURL too strict: /\/(campaigns\|org)/ didn't match root / | Changed to function check excluding /login paths |
| 2 | auth-*.setup.ts (all 5) | No MFA skip handling | Added MFA heading detection with skip button click |
| 3 | cross-cutting.spec.ts | navigateToSeedCampaign waitForURL didn't match root / | Fixed URL pattern |
| 4 | navigation.spec.ts | navigateToSeedCampaign waitForURL didn't match root / | Fixed URL pattern |
| 5 | field-mode.volunteer.spec.ts | navigateToSeedCampaign waitForURL didn't match root / | Fixed URL pattern |
| 6 | cross-cutting.spec.ts | Empty state test waitForURL too strict | Fixed URL pattern |
| 7 | navigation.spec.ts | NAV-02 org navigation waitForURL too strict | Fixed URL pattern |
