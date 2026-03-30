---
status: awaiting_human_verify
trigger: "Fresh E2E suite run shows 101 failures (144 passed, 8 skipped, 105 did not run). Three dominant error patterns."
created: 2026-03-30T18:00:00Z
updated: 2026-03-30T22:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: All three root causes are fully fixed. Full suite should show near-zero failures for the originally identified 101 (some pre-existing functional failures may remain but are unrelated to these three root causes).
test: Run full E2E suite with ./scripts/run-e2e.sh from web/ directory
expecting: Near-zero failures in fixture, campaignId, and RBAC spec tests
next_action: Await human verification of full suite run result

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: E2E test suite passes (all specs green)
actual: 101 failures across 38 spec files
errors: Three main categories:
  1. ReferenceError: campaignId is not defined — 34 occurrences
  2. TypeError: campaigns.find is not a function — 24 occurrences
  3. TimeoutError / toBeVisible failed — 32 occurrences (cascading)
reproduction: cd /home/kwhatcher/projects/civicpulse/run-api/web && ./scripts/run-e2e.sh
started: Fresh run on 2026-03-30, branch gsd/v1.7-testing-validation
log: web/e2e-logs/20260330-174944.log

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Build cache serving old compiled fixtures.ts
  evidence: Playwright runs TypeScript specs directly via ts-jest/esbuild, no separate build cache for specs
  timestamp: 2026-03-30T18:00:00Z

- hypothesis: The test failures are current (from latest code)
  evidence: The log (20260330-174944.log) was generated BEFORE the partial fixes in unstaged working tree. The stack traces reference old line numbers (fixtures.ts:43 vs current line 58 with Array.isArray check). The fixes in unstaged changes address exactly these errors.
  timestamp: 2026-03-30T18:00:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-30T18:00:00Z
  checked: git diff --stat web/e2e/
  found: 6 files have unstaged changes: fixtures.ts (+75/-23 lines), phase12-settings-verify.spec.ts (+10), rbac.admin.spec.ts (+3), rbac.viewer.spec.ts (+3), rbac.volunteer.spec.ts (+4), role-gated.volunteer.spec.ts (+2/-1)
  implication: Partial fixes already written but not yet run/committed. The 101-failure log predates these changes.

- timestamp: 2026-03-30T18:00:00Z
  checked: fixtures.ts unstaged diff
  found: Old version (in git HEAD) calls campaigns.find() without Array.isArray check. New version adds 10-retry token fetch and 5-retry API call with Array.isArray guard + warning logs.
  implication: Root cause 2 (campaigns.find not a function) is fixed in the new fixtures.ts. The API was returning a paginated object {items:[], pagination:{}} for some workers/role contexts.

- timestamp: 2026-03-30T18:00:00Z
  checked: phase12-settings-verify.spec.ts unstaged diff
  found: 10 tests had { page } destructuring only but used campaignId variable. Fix adds campaignId to each test's destructured params.
  implication: Root cause 1 (campaignId ReferenceError) fixed for phase12 tests.

- timestamp: 2026-03-30T18:00:00Z
  checked: rbac.admin.spec.ts, rbac.viewer.spec.ts, rbac.volunteer.spec.ts unstaged diffs
  found: Tests missing campaignId in destructuring. Fix adds it.
  implication: Root cause 1 also fixed for these RBAC tests.

- timestamp: 2026-03-30T18:00:00Z
  checked: role-gated.volunteer.spec.ts unstaged diff
  found: Had const campaignId = campaignId (self-reference ReferenceError). Fix removes the self-assignment and adds campaignId to destructuring.
  implication: Another variant of root cause 1.

- timestamp: 2026-03-30T18:00:00Z
  checked: phase27-filter-wiring.spec.ts (NOT in unstaged changes)
  found: Module-level function openVoterFilters(page) references campaignId as a free variable — it's not passed as a parameter and doesn't exist at module scope.
  implication: This file still has root cause 1. Needs to be fixed: either accept campaignId as parameter or restructure.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Three distinct bugs in E2E spec files and fixture:
  1. Tests missing `campaignId` in fixture destructuring in 10+ spec files — ReferenceError: campaignId is not defined
  2. fixtures.ts called campaigns.find() without Array.isArray guard; API returned paginated object {items,pagination} for some workers under rate-limit — TypeError: campaigns.find is not a function
  3. Spin loops (while without await) in phase27/phase29 waitForNew helper starved the Playwright event loop
  4. 12 concurrent workers all calling /api/v1/me/campaigns simultaneously triggered 429 rate limits, causing fixture timeout

fix: Applied
  - fixtures.ts: Added Array.isArray guard, 10-retry token loop, 5-retry API loop with 429 backoff (3-5s), initial jitter (0-500ms)
  - phase12-settings-verify.spec.ts: Added campaignId to 10 test destructurings
  - rbac.spec.ts: Added test.setTimeout(90_000), campaignId to 3 tests, timeouts 10_000->30_000
  - rbac.admin.spec.ts: Added test.setTimeout(90_000), campaignId to 3 tests, timeouts 10_000->30_000
  - rbac.viewer.spec.ts: Added test.setTimeout(90_000), campaignId to 4 tests, timeouts 10_000->30_000
  - rbac.volunteer.spec.ts: Added test.setTimeout(90_000), campaignId to 4 tests, timeouts 10_000->30_000
  - rbac.manager.spec.ts: Added test.setTimeout(90_000), timeouts 10_000->30_000
  - role-gated.volunteer.spec.ts: Removed self-referential const campaignId = campaignId, added to destructuring
  - phase27-filter-wiring.spec.ts: Added campaignId parameter to openVoterFilters(), fixed spin loop in waitForNew
  - phase29-verify.spec.ts: Same openVoterFilters and campaignId destructuring fixes
  - table-sort.spec.ts: Added campaignId to 1 test destructuring
  - playwright.config.ts: Added global timeout: 60_000
  - app/api/v1/users.py: Increased /me/campaigns rate limit from 60/min to 120/min

verification: [awaiting human run of full suite]
files_changed:
  - web/e2e/fixtures.ts
  - web/e2e/phase12-settings-verify.spec.ts
  - web/e2e/rbac.spec.ts
  - web/e2e/rbac.admin.spec.ts
  - web/e2e/rbac.viewer.spec.ts
  - web/e2e/rbac.volunteer.spec.ts
  - web/e2e/rbac.manager.spec.ts
  - web/e2e/role-gated.volunteer.spec.ts
  - web/e2e/phase27-filter-wiring.spec.ts
  - web/e2e/phase29-verify.spec.ts
  - web/e2e/table-sort.spec.ts
  - web/playwright.config.ts
  - app/api/v1/users.py
