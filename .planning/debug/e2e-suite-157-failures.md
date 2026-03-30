---
status: awaiting_human_verify
trigger: "E2E suite has ~157 failures across multiple categories"
created: 2026-03-29T22:50:00Z
updated: 2026-03-30T06:30:00Z
---

## Current Focus

hypothesis: Remaining 87 failures are primarily: (1) UI element mismatches where test expectations don't match actual UI (52 tests), (2) timing/loading issues under parallel load (9 tests), (3) real a11y violations (7 tests), (4) strict mode violations (3 tests)
test: Final full suite run after all fixes
expecting: Baseline established at 87 failures for reporting
next_action: Report progress and remaining failure categories to user

## Symptoms

expected: E2E test suite passes (all specs green)
actual: ~157 failures across multiple categories (started at 222 in this session)
errors: 403 Forbidden on campaign endpoints (no membership), stale OIDC key in a11y specs, campaign creation 500, tour dialog blocking, color contrast failures
reproduction: cd web && npx playwright test --reporter=line
started: After initial E2E infrastructure setup

## Eliminated

- hypothesis: Sidebar collapsed hiding nav elements
  evidence: Fixed with defaultOpen={true} in SidebarProvider and sidebar_state cookie in auth setup
  timestamp: 2026-03-29T20:00:00Z

- hypothesis: HTTPS dev server baseURL causing SSL errors
  evidence: Docker dev server runs HTTP on :5173, not HTTPS. Fixed playwright.config.ts baseURL to http://localhost:5173
  timestamp: 2026-03-30T05:00:00Z

- hypothesis: Auth state cached with wrong origin
  evidence: Auth files stored with https://localhost:4173 origin but dev server is http://localhost:5173. Cleared auth cache, re-authenticated
  timestamp: 2026-03-30T05:15:00Z

- hypothesis: /me/campaigns mocked as /me in a11y specs
  evidence: url.includes("/me") matched /me/campaigns, returning {role:"owner"} instead of array, causing campaigns?.find crash
  timestamp: 2026-03-30T05:30:00Z

## Evidence

- timestamp: 2026-03-29T20:00:00Z
  checked: Initial test run
  found: ~157 failures across 5 categories
  implication: Multiple root causes, need systematic fix approach

- timestamp: 2026-03-29T21:00:00Z
  checked: Sidebar visibility
  found: Sidebar was collapsed by default, causing elements to be outside viewport
  implication: Fixed with defaultOpen and cookie; committed as a4265a5

- timestamp: 2026-03-30T03:00:00Z
  checked: require_role._check_role user sync
  found: require_role does not call ensure_user_synced before resolve_campaign_role; first-time users get 403
  implication: Fixed by adding ensure_user_synced call matching require_org_role pattern; committed 6dd79e9

- timestamp: 2026-03-30T03:30:00Z
  checked: OIDC storage key in a11y specs
  found: All a11y specs hardcode stale key oidc.user:https://auth.civpulse.org:363437283614916644
  implication: Created shared a11y-helpers.ts with consistent mock config/OIDC setup; committed 6dd79e9

- timestamp: 2026-03-30T05:00:00Z
  checked: Dev server protocol
  found: Docker dev server runs HTTP on :5173 but playwright config had baseURL as https://localhost:5173
  implication: ALL tests got ERR_SSL_PROTOCOL_ERROR. Fixed baseURL to http://localhost:5173. Resolved ~130 test failures.

- timestamp: 2026-03-30T05:30:00Z
  checked: a11y mock route ordering
  found: url.includes("/me") matches /me/campaigns before the campaigns-specific handler
  implication: All 6 a11y specs crashed with "campaigns?.find is not a function". Fixed by adding /me/campaigns handler before /me catch-all.

- timestamp: 2026-03-30T06:00:00Z
  checked: Campaign card visibility
  found: 34 E2E test campaigns pushed Macon-Bibb Demo Campaign off-screen on org dashboard
  implication: All specs using enterCampaign/getSeedCampaignId failed because campaign link wasn't visible. Fixed getSeedCampaignId to use API-first approach.

- timestamp: 2026-03-30T06:00:00Z
  checked: Multiple spec-specific issues
  found: (1) Shift API rejects timezone-aware datetimes, (2) survey card has overlay <a> intercepting clicks, (3) campaign wizard is 3 steps not 1, (4) walk list turf dropdown has duplicate options, (5) email validation rejects @localhost, (6) root layout missing <main> for unauthenticated routes
  implication: Fixed all individually across 15+ files

## Resolution

root_cause: Multiple cascading infrastructure + test issues. Primary: (1) HTTPS baseURL for HTTP dev server caused ALL tests to fail with SSL errors, (2) auth state origin mismatch, (3) a11y mock route ordering caused JS crashes, (4) test campaign accumulation pushed seed campaign off-screen, (5) various spec-specific locator/API/wizard issues
fix: See files_changed list. Key fixes: HTTP baseURL, /me/campaigns mock handlers, API-first campaign ID lookup, naive datetime for shifts, campaign wizard navigation, overlay link handling, email validation, root layout <main> element
verification: Full suite: 222 -> 87 failures. 177 passed. 93 did not run (serial cascading). 6 skipped.
files_changed:
  - web/playwright.config.ts
  - web/e2e/helpers.ts
  - web/e2e/a11y-campaign-settings.spec.ts
  - web/e2e/a11y-phone-bank.spec.ts
  - web/e2e/a11y-scan.spec.ts
  - web/e2e/a11y-voter-import.spec.ts
  - web/e2e/a11y-voter-search.spec.ts
  - web/e2e/a11y-walk-list.spec.ts
  - web/e2e/call-lists-dnc.spec.ts
  - web/e2e/campaign-settings.spec.ts
  - web/e2e/connected-journey.spec.ts
  - web/e2e/cross-cutting.spec.ts
  - web/e2e/field-mode.volunteer.spec.ts
  - web/e2e/phase12-settings-verify.spec.ts
  - web/e2e/rbac.admin.spec.ts
  - web/e2e/rbac.manager.spec.ts
  - web/e2e/rbac.spec.ts
  - web/e2e/rbac.viewer.spec.ts
  - web/e2e/rbac.volunteer.spec.ts
  - web/e2e/shifts.spec.ts
  - web/e2e/surveys.spec.ts
  - web/e2e/uat-tooltip-popovers.spec.ts
  - web/e2e/voter-crud.spec.ts
  - web/e2e/walk-lists.spec.ts
  - web/src/routes/__root.tsx
