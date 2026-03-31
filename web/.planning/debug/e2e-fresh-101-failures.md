---
status: investigating
trigger: "Fresh E2E suite run shows 101 failures (144 passed, 8 skipped, 105 did not run)"
created: 2026-03-30T00:00:00Z
updated: 2026-03-30T00:00:00Z
---

## Current Focus

hypothesis: Two distinct root causes identified from code reading:
  1. phase12-settings-verify.spec.ts uses bare `campaignId` variable (not from fixture) — it's undefined at module scope
  2. RBAC specs (admin/manager/etc) — fixtures.ts worker fixture resolves campaignId using owner.json auth, but role-specific projects (admin, manager, volunteer, viewer) use different storageState. The campaigns.find error suggests /api/v1/me/campaigns returns a non-array (likely an object with items property due to wrong API shape for these roles).
test: Read fixtures.ts and compare to how RBAC specs call campaignId. Check API response shape for /me/campaigns.
expecting: Fix #1 = pass `campaignId` fixture to all tests in phase12. Fix #2 = fixtures.ts campaign resolution uses wrong auth context (always owner.json) — RBAC specs work but other test types use wrong user.
next_action: Fix phase12-settings-verify.spec.ts to use fixture campaignId, then investigate campaigns.find error

## Symptoms

expected: E2E test suite passes (all specs green)
actual: 101 failures across 38 spec files
errors: |
  1. ReferenceError: campaignId is not defined — 34 occurrences, phase12-settings-verify.spec.ts and RBAC specs
  2. TypeError: campaigns.find is not a function — 24 occurrences, RBAC role-specific specs
  3. TimeoutError / toBeVisible failed — 32 occurrences, cascading from 1 & 2
reproduction: cd web && ./scripts/run-e2e.sh
started: Fresh run on 2026-03-30, branch gsd/v1.7-testing-validation

## Eliminated

- (none yet)

## Evidence

- timestamp: 2026-03-30T00:01:00Z
  checked: phase12-settings-verify.spec.ts
  found: |
    All 10 tests use bare `campaignId` (not `{ campaignId }` from fixture destructuring).
    The tests do `CAMPAIGN_ID = campaignId` but campaignId is never in scope — it's not
    a parameter of the test callback. The module-level `let CAMPAIGN_ID: string` is declared
    but `campaignId` (the fixture variable) is never destructured from the test args.
    Example: `test("...", async ({ page }) => { CAMPAIGN_ID = campaignId ... })`
    Should be: `test("...", async ({ page, campaignId }) => { CAMPAIGN_ID = campaignId ... })`
  implication: All 10 tests in phase12 will throw ReferenceError on first line.

- timestamp: 2026-03-30T00:02:00Z
  checked: rbac.admin.spec.ts lines 64-78 (settings test)
  found: |
    The test callback uses `async ({ page }) =>` without `campaignId` in destructuring,
    then calls `await enterCampaign(page, campaignId)` — campaignId is not in scope.
    Same pattern: fixture not destructured. 4 of 9 admin tests have this issue.
  implication: ReferenceError in those specific tests.

- timestamp: 2026-03-30T00:03:00Z
  checked: fixtures.ts worker-scoped campaignId fixture
  found: |
    The fixture always uses `storageState: "playwright/.auth/owner.json"` to resolve
    the campaign ID. This is correct behavior — owner always has access to the seed campaign.
    BUT: The `campaigns.find is not a function` error (24 occurrences) suggests the
    /api/v1/me/campaigns response is not a plain array for some users.
    Need to check: Does the API return a paginated shape `{ items: [], pagination: {} }`
    or a plain array `[]`?
  implication: If API returns paginated object, `campaigns.find()` fails with TypeError.

## Resolution

root_cause: |
  TWO bugs:
  1. phase12-settings-verify.spec.ts: All test callbacks use `async ({ page })` without
     destructuring `campaignId` from the fixture. The bare `campaignId` reference is
     undefined → ReferenceError.
  2. RBAC specs (admin/manager/volunteer/viewer): Some test callbacks similarly miss
     `campaignId` in destructuring. Additionally, fixtures.ts line 42 calls
     `campaigns.find()` but /api/v1/me/campaigns may return a paginated object
     `{ items: [], pagination: {} }` instead of a plain array.

fix: |
  1. Fix phase12-settings-verify.spec.ts: Add `campaignId` to all test callback destructuring.
  2. Fix RBAC specs: Add `campaignId` to test callbacks missing it.
  3. Fix fixtures.ts: Handle paginated response shape — extract `.items` if response
     is an object with an items array, fallback to treating as plain array.

verification: empty
files_changed: []
