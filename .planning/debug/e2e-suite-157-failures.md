---
status: fixing
trigger: "E2E suite has ~157 failures across multiple categories"
created: 2026-03-29T22:50:00Z
updated: 2026-03-29T22:50:00Z
---

## Current Focus

hypothesis: Remaining 86 failures are a mix of: (1) ZITADEL flakiness under load causing "Loading..." hang, (2) campaign creation 500 from unique index (fixed in DB, not yet in migration), (3) a11y color-contrast violations on settings pages, (4) various spec-specific UI test issues
test: Fixed campaign unique index, reduced workers, fixed DB roles. Remaining failures need individual investigation.
expecting: Next batch of fixes should target campaign creation 500 (now fixed in DB), then individual spec issues
next_action: Return checkpoint - significant progress made (157 -> 86 failures, 45% reduction)

## Symptoms

expected: E2E test suite passes (all specs green)
actual: ~157 failures across multiple categories
errors: 403 Forbidden on campaign endpoints (no membership), stale OIDC key in a11y specs, campaign creation 500, tour dialog blocking, color contrast failures
reproduction: cd web && npx playwright test --reporter=line
started: After initial E2E infrastructure setup

## Eliminated

- hypothesis: Sidebar collapsed hiding nav elements
  evidence: Fixed with defaultOpen={true} in SidebarProvider and sidebar_state cookie in auth setup
  timestamp: 2026-03-29T20:00:00Z

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

- timestamp: 2026-03-30T03:30:00Z
  checked: RBAC voter link locator
  found: getByRole('link', { name: /voter|first|last/i }) matches "All Voters" tab, not voter name link
  implication: Fixed to table.getByRole('link').first(); committed 6dd79e9

- timestamp: 2026-03-30T04:00:00Z
  checked: Non-admin users on org dashboard
  found: list_org_campaigns requires org_admin; viewer/volunteer/manager JWTs have no role claims
  implication: Added useOrgCampaigns fallback to /api/v1/campaigns for non-admin users; committed 142ad65

- timestamp: 2026-03-30T04:15:00Z
  checked: Campaign member roles for E2E users
  found: manager1@localhost had role=viewer (JWT defaults to viewer, no ZITADEL role claims)
  implication: Fixed via direct DB update. Roles don't get overwritten by ensure_user_synced for existing members

- timestamp: 2026-03-30T04:30:00Z
  checked: Viewer voter detail tests
  found: Voter search requires volunteer+ role; viewer gets 403; table shows empty. Test expectation wrong.
  implication: These 2 tests have incorrect expectations for viewer role permissions

## Resolution

root_cause: Multiple cascading issues - (1) require_role missing ensure_user_synced causing 403 for first-time users, (2) stale OIDC storage key in a11y specs, (3) broken voter link locator in RBAC specs, (4) non-admin users blocked from org dashboard, (5) manager CampaignMember role was "viewer" instead of "manager", (6) campaign creation 500 from unique index on zitadel_org_id, (7) missing last_committed_row column in import_jobs, (8) too many parallel workers overwhelming ZITADEL
fix: (1) Added ensure_user_synced to require_role._check_role, (2) Created shared a11y-helpers.ts with consistent mock config, (3) Fixed voter link locator to table.getByRole('link').first(), (4) Added useOrgCampaigns fallback to /api/v1/campaigns, (5) Fixed manager role via DB update, (6) Recreated campaigns.zitadel_org_id index as non-unique, (7) Added last_committed_row column to import_jobs, (8) Reduced Playwright workers to 4
verification: Full suite: 157 failures -> 86 failures (45% reduction). RBAC suite: 35/37 passing in isolation.
files_changed:
  - app/core/security.py
  - web/e2e/a11y-helpers.ts
  - web/e2e/a11y-scan.spec.ts
  - web/e2e/a11y-campaign-settings.spec.ts
  - web/e2e/a11y-phone-bank.spec.ts
  - web/e2e/a11y-voter-import.spec.ts
  - web/e2e/a11y-voter-search.spec.ts
  - web/e2e/a11y-walk-list.spec.ts
  - web/e2e/l2-import-wizard.spec.ts
  - web/e2e/rbac.admin.spec.ts
  - web/e2e/rbac.manager.spec.ts
  - web/e2e/rbac.spec.ts
  - web/e2e/rbac.viewer.spec.ts
  - web/e2e/rbac.volunteer.spec.ts
  - web/src/hooks/useOrg.ts
  - web/playwright.config.ts
