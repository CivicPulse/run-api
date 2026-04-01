---
phase: 62-ci-auth-policy-automation
plan: 02
subsystem: testing
tags: [github-actions, playwright, ci, auth, policy]
requires:
  - phase: 62-ci-auth-policy-automation
    provides: strict policy verify flags and ensure helpers in create-e2e-users.py
provides:
  - CI strict no-MFA policy verification gate before E2E sharded execution
  - CI deterministic auth setup smoke gate using setup role projects
  - Local run-e2e strict policy parity check with fail-fast behavior
affects: [e2e-ci, local-e2e-runner, playwright-project-topology]
tech-stack:
  added: []
  patterns:
    - Pre-shard CI gates: infrastructure policy verify + auth setup smoke
    - Local/CI parity for auth-policy prerequisites
key-files:
  created: []
  modified:
    - .github/workflows/pr.yml
    - web/scripts/run-e2e.sh
    - web/playwright.config.ts
key-decisions:
  - "Added explicit setup-owner/setup-admin/setup-manager/setup-volunteer/setup-viewer projects so CI smoke command matches plan contract and remains deterministic."
  - "Kept shard command unchanged and inserted pre-shard gates immediately before broad suite execution."
patterns-established:
  - "All E2E entrypoints should fail fast on policy drift before expensive test fan-out."
requirements-completed: [INFRA-03, VAL-01]
duration: 18min
completed: 2026-03-31
---

# Phase 62 Plan 02: CI Auth Policy Automation Summary

**CI and local E2E runners now enforce strict no-MFA policy verification and run deterministic auth-setup smoke checks before sharded Playwright execution.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-31T19:28:00Z
- **Completed:** 2026-03-31T19:45:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added CI step to run `create-e2e-users.py --verify-policy-only --strict-policy` immediately after E2E user provisioning with explicit no-MFA drift messaging.
- Added setup-only Playwright smoke gate for role auth projects before shard test execution.
- Updated local `run-e2e.sh` helper to run strict policy verification and exit non-zero with clear remediation if drift is detected.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add strict CI policy verification + auth-setup smoke gate** - `7f95205` (feat)
2. **Task 2: Mirror strict policy gate in local run-e2e helper** - `9811941` (fix)

## Files Created/Modified
- `.github/workflows/pr.yml` - Added strict policy verify step and setup-role smoke gate prior to existing shard command.
- `web/playwright.config.ts` - Added named setup role projects and wired dependencies for role suites when auth is stale.
- `web/scripts/run-e2e.sh` - Added strict policy verify invocation and fail-fast handling in `ensure_e2e_users()`.

## Decisions Made
- Created explicit setup-* projects to satisfy deterministic CI smoke command requirements and avoid referencing non-existent Playwright projects.
- Preserved existing shard command behavior exactly, inserting only prerequisite gates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing Playwright setup projects required by CI command**
- **Found during:** Task 1
- **Issue:** Planned CI smoke command referenced `setup-owner`...`setup-viewer` projects that did not exist in `web/playwright.config.ts`.
- **Fix:** Added the five setup projects and updated role-suite dependencies to reference them when auth cache is stale.
- **Files modified:** `web/playwright.config.ts`
- **Verification:** `npx playwright test --list --project=setup-owner` resolves and lists auth-owner setup test.
- **Committed in:** `7f95205`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential correction to make the requested CI smoke gate executable.

## Issues Encountered
- None beyond the blocking project-name mismatch, which was resolved inline.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness
- CI now fails early for policy drift and auth bootstrap regressions before shard fan-out.
- Local E2E helper enforces the same strict policy precondition, reducing CI/local divergence.

## Self-Check: PASSED

- FOUND: `.planning/phases/62-ci-auth-policy-automation/62-02-SUMMARY.md`
- FOUND: `7f95205`
- FOUND: `9811941`

---
*Phase: 62-ci-auth-policy-automation*
*Completed: 2026-03-31*
