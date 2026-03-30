---
status: investigating
trigger: "E2E suite has ~157 failures across multiple categories"
created: 2026-03-29T22:50:00Z
updated: 2026-03-29T22:50:00Z
---

## Current Focus

hypothesis: Multiple remaining test categories still failing: a11y settings (7), campaign creation/settings (10+), cross-cutting (6), viewer voter detail (2), and test state pollution from campaign name mutations
test: Categorize remaining failures and fix each category
expecting: Further failure reduction
next_action: Fix campaign name pollution (tests edit seed campaign name), then address remaining categories

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

root_cause: Multiple issues - (1) e2e users not members of seed campaign, (2) stale OIDC key in a11y specs, (3) campaign creation 500, (4) tour dialog blocking, (5) color contrast
fix: Fixing in priority order
verification:
files_changed: []
