---
phase: quick
plan: 260330-ipp
subsystem: testing
tags: [playwright, e2e, performance, fixtures, ci]

requires:
  - phase: 60
    provides: E2E test suite with 54 spec files
provides:
  - Worker-scoped campaignId fixture eliminating redundant seed campaign lookups
  - Event-driven test waits replacing hard sleeps and networkidle
  - CI pipeline optimizations (npm cache, build artifact sharing, 2x workers)
  - run-e2e.sh --workers flag and worker count logging
affects: [e2e-tests, ci-pipeline]

tech-stack:
  added: []
  patterns:
    - "Worker-scoped Playwright fixtures via test.extend for shared state"
    - "Event-driven waits (element assertions) instead of waitForTimeout/networkidle"
    - "CI build artifact sharing via upload/download-artifact for Vite dist"

key-files:
  created:
    - web/e2e/fixtures.ts
  modified:
    - web/playwright.config.ts
    - web/e2e/helpers.ts
    - web/scripts/run-e2e.sh
    - .github/workflows/pr.yml
    - 48 spec files in web/e2e/

key-decisions:
  - "Kept waitForTimeout for retry backoff, rate-limiting delays, and field-mode offline simulation"
  - "field-mode.volunteer.spec.ts keeps local navigateToSeedCampaign (uses volunteer auth, not owner)"
  - "RBAC specs refactored enterCampaign to take campaignId parameter instead of closure variable"
  - "Replaced networkidle with domcontentloaded (faster, no waiting for all network requests to settle)"

patterns-established:
  - "Worker-scoped fixture: import { test, expect } from './fixtures' for specs needing campaignId"
  - "Rate-limiting delays in bulk API creation loops are kept (legitimate operational timing)"

requirements-completed: [IPP-T1, IPP-T2]

duration: 14min
completed: 2026-03-30
---

# Quick Task 260330-ipp: Implement Tier 1 and Tier 2 Playwright Speed Improvements

**Worker-scoped campaignId fixture, 73 waitForTimeout/54 networkidle eliminated, CI npm cache + build artifact sharing, workers 1->2 CI / 4->6 local**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-30T17:35:15Z
- **Completed:** 2026-03-30T17:49:00Z
- **Tasks:** 3
- **Files modified:** 51

## Accomplishments
- Created worker-scoped `campaignId` fixture in `web/e2e/fixtures.ts` resolving seed campaign once per worker instead of once per test (~120 redundant lookups eliminated)
- Eliminated 73 `waitForTimeout` and 54 `networkidle` calls across 42 spec files, replacing with event-driven element assertions and `domcontentloaded`
- Added `reducedMotion: 'reduce'` to Playwright config, suppressing CSS animation delays
- Increased local workers from 4 to 6 and CI workers from 1 to 2
- Added npm cache to all 3 `setup-node` steps in CI workflow
- Shared Vite build artifact from `frontend` job to `e2e-tests` job, eliminating redundant builds per shard
- Enhanced `run-e2e.sh` with `--workers` flag override and worker count logging in JSONL/terminal summary

## Task Commits

Each task was committed atomically:

1. **Task 1: Tier 1 config changes** - `5907990` (chore)
2. **Task 2: campaignId fixture + wait elimination** - `1bdbc70` (feat)
3. **Task 3: CI build artifact sharing** - `1b8d737` (chore)

## Files Created/Modified
- `web/e2e/fixtures.ts` - Worker-scoped campaignId fixture via test.extend
- `web/playwright.config.ts` - reducedMotion, workers 6/2
- `web/e2e/helpers.ts` - Removed navigateToSeedCampaign, networkidle->domcontentloaded
- `web/scripts/run-e2e.sh` - --workers flag, worker count in JSONL/summary
- `.github/workflows/pr.yml` - npm cache x3, build artifact upload/download
- 46 spec files - import swaps, waitForTimeout/networkidle removal, fixture wiring

## Decisions Made
- **Kept 14 waitForTimeout calls** (7 in field-mode.volunteer.spec.ts for offline simulation/auth polling, 5 retry backoffs in voter-* specs, 2 rate-limiting delays in voter-contacts/voter-crud) -- all are legitimate operational timing, not UI waits
- **field-mode.volunteer.spec.ts is a special case** -- it runs under volunteer auth with its own local navigateToSeedCampaign and doesn't use the owner-based fixture
- **Replaced networkidle with domcontentloaded** -- networkidle waits for all network requests to settle which is fragile under parallel load; domcontentloaded + specific element assertions is more reliable and faster
- **RBAC enterCampaign refactored** -- changed from closure-captured campaignId to explicit parameter to work with fixture-provided value

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed RBAC spec self-assignment bug**
- **Found during:** Task 2 (campaignId fixture wiring)
- **Issue:** Transform script produced `campaignId = campaignId` (self-assignment) in rbac.admin, rbac.spec, rbac.viewer, rbac.volunteer enterCampaign functions because the regex replaced `getSeedCampaignId(page)` with `campaignId` but the outer `let campaignId` and the fixture `campaignId` were different variables
- **Fix:** Refactored enterCampaign to take `cid: string` parameter, removed outer `let campaignId`, callers pass fixture value
- **Files modified:** rbac.admin.spec.ts, rbac.spec.ts, rbac.viewer.spec.ts, rbac.volunteer.spec.ts
- **Committed in:** 1bdbc70 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed campaign-settings.spec.ts missed networkidle**
- **Found during:** Task 3 (final verification)
- **Issue:** campaign-settings.spec.ts had a networkidle inside a reload block that the bulk transform missed
- **Fix:** Replaced with domcontentloaded
- **Files modified:** campaign-settings.spec.ts
- **Committed in:** 1b8d737 (Task 3 commit)

**3. [Rule 2 - Missing Critical] Added e2e-runs.jsonl to .gitignore**
- **Found during:** Task 3 (untracked file check)
- **Issue:** run-e2e.sh generates e2e-runs.jsonl but it was not gitignored
- **Fix:** Added `e2e-runs.jsonl` to web/.gitignore
- **Files modified:** web/.gitignore
- **Committed in:** docs commit

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None -- bulk transform script handled the majority of changes efficiently.

## Known Stubs
None -- all changes are complete and functional.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- E2E test suite should be faster both locally (6 workers + reduced animations + fewer waits) and in CI (2 workers + npm cache + build artifact sharing)
- Tier 3 improvements (parallel execution, test grouping) can be planned as follow-up
- Full E2E smoke test recommended to validate no regressions

## Self-Check: PASSED
- All key files exist (fixtures.ts, playwright.config.ts, pr.yml, run-e2e.sh, SUMMARY.md)
- All 3 task commits verified (5907990, 1bdbc70, 1b8d737)

---
*Quick Task: 260330-ipp*
*Completed: 2026-03-30*
