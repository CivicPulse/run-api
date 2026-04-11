---
phase: 107
plan: 09
subsystem: phase-exit-gate
tags: [exit-gate, verification, ruff, pytest, vitest, playwright, regression-guard]
requires:
  - 107-01 (usePrefersReducedMotion hook)
  - 107-02 (HOUSE_LEVEL_OUTCOMES set)
  - 107-03 (door_knocks empty-notes contract)
  - 107-04 (CANV-01 hybrid auto-advance)
  - 107-05 (CANV-02 skip race fix)
  - 107-06 (CANV-03 InlineSurvey notesRequired decoupling)
  - 107-07 (FORMS-01 audit doc)
  - 107-08 (canvassing-wizard E2E spec)
  - 107-08.1 (pinning bug fix + render-path regression-guard)
provides:
  - "107-VERIFICATION-RESULTS.md: Phase 107 exit-gate document analogous to 106-EXIT-GATE.md"
  - "Two consecutive green Playwright runs via run-e2e.sh (D-12, D-13)"
  - "Locked baseline: pytest 1118/0/0, vitest 708/0/24 todo, Playwright 305/0/66"
affects:
  - 108 (next phase can start on a trustworthy baseline)
tech-stack:
  added: []
  patterns:
    - "Multi-line JSONL parser via uv run python for `web/e2e-runs.jsonl` (file is pretty-printed JSON objects, not strict NDJSON)"
    - "Auth state hygiene: clear `web/playwright/.auth/*.json` before any gate run that follows a long idle period (ZITADEL OIDC tokens expire ~12h)"
key-files:
  created:
    - .planning/phases/107-canvassing-wizard-fixes/107-VERIFICATION-RESULTS.md
    - .planning/phases/107-canvassing-wizard-fixes/107-09-SUMMARY.md
  modified:
    - web/src/routes/field/$campaignId/phone-banking.test.tsx
    - web/e2e/canvassing-wizard.spec.ts
key-decisions:
  - "Stale auth state is the root cause of the initial 17-fail Playwright run, not a phase 107 regression. Cleared `web/playwright/.auth/*.json` once and let the wrapper's auth setup tests re-mint tokens; the entire campaign-settings/RBAC/tooltip cluster vanished without code changes."
  - "phone-banking.test.tsx pre-existing test broke when Plan 107-06 renamed the InlineSurvey label from `Call Notes` to `Notes` + `(optional)` span. The dom whitespace inside the nested span made strict accessible-name matching brittle, so switched to `getByLabelText(/Notes/i)` regex matchers."
  - "CANV-02 E2E assertion shape was obsoleted by Plan 107-08.1's pinning fix — the displayed HouseholdCard now correctly advances to the next house, so the `Skipped` badge of the previously-active household is no longer in the rendered tree. Removed that assertion and kept the door-counter advance + `Skipped — Undo` toast assertions, both of which carry the D-05 / D-06 reversibility signal."
  - "Did NOT add Playwright `retries:` band-aid (D-04 from phase 106). Triage was 1 cycle: identify auth-state staleness as the cluster cause, clear it, re-run."
requirements-completed: [CANV-01, CANV-02, CANV-03, FORMS-01]
duration: ~50 min
completed: 2026-04-11
---

# Phase 107 Plan 09: Exit Gate Summary

**Ran the full phase 107 exit gate (ruff + pytest + vitest + 2× Playwright via run-e2e.sh) and produced `107-VERIFICATION-RESULTS.md` proving phase 107 is shippable. Two in-gate Rule 1 fixes (phone-banking test label rename + CANV-02 post-pinning assertion shape) and one auth-state hygiene action (clear `web/playwright/.auth/*.json`) closed an initial 17-fail surface to 0/0 across two consecutive Playwright greens.**

## Performance

- **Started:** 2026-04-11T04:25Z (approx)
- **Completed:** 2026-04-11T04:43Z
- **Duration:** ~50 min (1 triage cycle within the orchestrator's 2-cycle cap)
- **Tasks:** 1 (single auto exit-gate task)
- **Files created:** 2 (VERIFICATION-RESULTS.md + this SUMMARY)
- **Files modified:** 2 (phone-banking.test.tsx + canvassing-wizard.spec.ts in-gate fixes)
- **Commits:** 2 task commits + 1 metadata commit pending (this SUMMARY + state)

## Tasks Completed

| Task | Name                                                   | Commit    | Files                                                                                               |
| ---- | ------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------- |
| 1a   | In-gate test fixes (phone-banking + canvassing-wizard) | `975af8e` | `web/src/routes/field/$campaignId/phone-banking.test.tsx`, `web/e2e/canvassing-wizard.spec.ts`      |
| 1b   | Write `107-VERIFICATION-RESULTS.md`                    | `1093822` | `.planning/phases/107-canvassing-wizard-fixes/107-VERIFICATION-RESULTS.md`                          |

## What Was Built

### `107-VERIFICATION-RESULTS.md`

A 277-line exit-gate document analogous to phase 106's `106-EXIT-GATE.md`. Records:

- **Frontmatter:** `gate: passed`, per-suite counts, timestamps, durations, workers
- **Pre-flight check:** all 10 phase-107 must-exist conditions confirmed
- **Suite results table:** ruff (0), pytest (1118/0/0), vitest (708/0/24 todo), Playwright (305/0/66 ×2)
- **Phase 107 new test inventory:** 33 vitest + 4 pytest = 37 tests across 6 files
- **Two consecutive Playwright JSONL entries** (`04:39:52Z` and `04:42:43Z`, both `fail: 0`, `exit_code: 0`, 8 workers)
- **Triage section:** root-cause of the initial 17-fail run + the CANV-02 assertion-shape fix
- **Skip-marker audit rollup** (no new unjustified skips)
- **PHASE-106-DELETE audit count:** still 5 (unchanged)
- **CANV-01 visible-swap regression-guard verification:** documents the `HouseholdCard.test.tsx` revert-and-fail proof from 107-08.1
- **Must-have verification table** for plans 01..08.1
- **Roadmap success criteria:** 5/5 checked
- **Conclusion:** PASSED

## Verification

```bash
$ uv run ruff check . && uv run ruff format --check .
All checks passed!
353 files already formatted

$ uv run pytest
1118 passed, 16 warnings in 74.87s

$ cd web && npx vitest run
 Test Files  75 passed | 7 skipped (82)
      Tests  708 passed | 24 todo (732)
   Duration  8.61s

$ cd web && E2E_DEV_SERVER_URL=https://localhost:49372 ./scripts/run-e2e.sh   # run 1
  Passed: 305  Failed: 0  Skipped: 66  Duration: 163.7s  Exit: 0

$ cd web && E2E_DEV_SERVER_URL=https://localhost:49372 ./scripts/run-e2e.sh   # run 2
  Passed: 305  Failed: 0  Skipped: 66  Duration: 160.0s  Exit: 0
```

All four suites green. Two consecutive Playwright runs both green per phase 106 D-12.

### Acceptance Criteria

- `test -f .planning/phases/107-canvassing-wizard-fixes/107-VERIFICATION-RESULTS.md` → exists
- `grep -q "Phase 107 — Verification Results" 107-VERIFICATION-RESULTS.md` → match
- `grep -q "PASSED" 107-VERIFICATION-RESULTS.md` → multiple matches
- `grep -c "exit 0\| 0 \|Exit code:   0" 107-VERIFICATION-RESULTS.md` → ≥4 (one per suite)
- `grep -n "107-FORMS-AUDIT.md" 107-VERIFICATION-RESULTS.md` → match
- `grep -n "Phase 107 exit gate: PASSED" 107-VERIFICATION-RESULTS.md` → match
- New entry exists in `web/e2e-runs.jsonl` after each Playwright run → 2 new entries (`04:39:52Z`, `04:42:43Z`)

## Decisions Made

See frontmatter `key-decisions`. Load-bearing ones:

1. **Stale auth state is not a phase 107 regression.** The initial 17-fail run looked alarming, but the cluster shape (every failure tied to authenticated routes — settings, RBAC, tooltips, members) and the `0/3` D-04 isolation result on `CAMP-01` pointed at a single root cause. The fix was a 1-second `rm` of `playwright/.auth/*.json`. No code or test changes for that cluster.
2. **Triage in 1 cycle, not 2.** The orchestrator authorized up to 2 triage cycles. Cycle 1 (this gate) was sufficient: identify auth staleness + the CANV-02 post-pinning assertion shape, fix both, re-run twice. No `retries:` band-aid added (D-04 honored).
3. **Multi-line JSONL parser.** `web/e2e-runs.jsonl` is not strict NDJSON — each entry is a pretty-printed JSON object spanning ~13 lines. The phase 106 EXIT-GATE check assumed line-oriented format, which `jq -s` chokes on. Wrote a brace-depth parser via `uv run python` to extract the last 2 entries reliably. Worth flagging for any future gate runner.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] phone-banking.test.tsx still references the pre-rename "Call Notes" label**

- **Found during:** Task 1, first vitest run as part of the gate
- **Issue:** 4 instances of `screen.getByLabelText("Call Notes")` in `web/src/routes/field/$campaignId/phone-banking.test.tsx` (lines 255, 295, 306, 320). Plan 107-06 renamed the InlineSurvey label from `Call Notes` to `Notes` followed by a separate `(optional)` span, breaking accessible-name strict-match. The new InlineSurvey unit suite (`InlineSurvey.test.tsx`) covers the canvassing path; phone-banking has its own component test that wasn't updated alongside the rename.
- **Fix:** Replaced all 4 lookups with `getByLabelText(/Notes/i)` regex matchers. Regex chosen over the literal `"Notes (optional)"` string because the inner span's whitespace handling makes strict accessible-name matching brittle.
- **Files modified:** `web/src/routes/field/$campaignId/phone-banking.test.tsx`
- **Verification:** `npx vitest run src/routes/field/\$campaignId/phone-banking.test.tsx` → 7/7 passed
- **Commit:** `975af8e`

**2. [Rule 1 - Bug] canvassing-wizard.spec.ts CANV-02 asserted on the obsolete pinning behavior**

- **Found during:** Task 1, first full Playwright run (one of the 17 initial failures)
- **Issue:** CANV-02 asserted on the household-status `Skipped` badge of the previously-active House A *after* tapping Skip. Pre-Plan-107-08.1 the displayed HouseholdCard stayed pinned to House A (the bug), so the badge was visible. Post-fix the card correctly advances to House B and House A's badge is no longer in the rendered tree. The test assertion was written under the buggy behavior and was rendered obsolete by 107-08.1's pinning fix.
- **Fix:** Removed the dead `household-status-copy` Skipped-badge `expect`. Kept the door-counter advance assertion (`Door 2 of 2`) and the `Skipped — Undo` sonner toast assertion, both of which carry the D-05 / D-06 reversibility signal at this layer. Per-entry skip state is exhaustively covered at the unit layer by `HouseholdCard.test.tsx` (107-08.1) and `useCanvassingWizard.test.ts` (107-05). Added a comment in the test body explaining the post-pinning shape so future readers don't re-introduce the dead assertion.
- **Files modified:** `web/e2e/canvassing-wizard.spec.ts`
- **Verification:** `cd web && E2E_DEV_SERVER_URL=https://localhost:49372 ./scripts/run-e2e.sh canvassing-wizard.spec.ts` → 5/5 passed
- **Commit:** `975af8e`

**3. [Rule 3 - Blocking] Stale auth state files caused 16 of the 17 initial failures**

- **Found during:** Task 1, first full Playwright run; 16 failures in `phase12-settings-verify.spec.ts`, `cross-cutting.spec.ts`, `rbac.spec.ts`, `rbac.admin.spec.ts`, `rbac.manager.spec.ts`, `uat-tooltip-popovers.spec.ts`, `table-sort.spec.ts`, `turfs.spec.ts` — all clustered around authenticated campaign-settings / RBAC routes.
- **Issue:** `web/playwright/.auth/*.json` files were ~7 hours old (from `2026-04-10 21:52` local), older than the ZITADEL OIDC access-token lifetime. Tests loaded the page with stale tokens, the API returned 401, and TanStack Router's not-authorized handler redirected every test to `/` (campaigns list). 3x rerun of CAMP-01 in isolation went 0/3 — confirmed real, not flake. The page snapshot in `error-context.md` showed the user landing on the campaigns list dashboard at `/`, never reaching the settings route.
- **Fix:** `rm -f web/playwright/.auth/{admin,manager,owner,viewer,volunteer}.json`. The wrapper's `auth-{role}.setup.ts` setup tests re-ran on the next invocation and re-minted fresh tokens. Both gate runs use the fresh state.
- **Files modified:** None (filesystem-only fix)
- **Verification:** Both gate runs (`04:39:52Z` and `04:42:43Z`) green at 305/0/66.
- **Commit:** None — auth state files are gitignored

**Total deviations:** 3 auto-fixed (2 Rule 1 test-shape regressions, 1 Rule 3 environment hygiene). Zero product code touched.

## Authentication Gates

None — auth was pre-existing storage state, not an interactive gate. The stale-state issue (deviation #3) was a Rule 3 environment fix, not a gate.

## Issues Encountered

1. **`jq -s` on the multi-line JSONL.** The phase 106 EXIT-GATE assertion `tail -2 web/e2e-runs.jsonl | jq -s '...'` errored with `Expected string key before ':'` because `web/e2e-runs.jsonl` is pretty-printed JSON objects (each spanning ~13 lines), not line-oriented NDJSON. `tail -2` cuts mid-object. Worked around with a brace-depth parser via `uv run python` that processes the whole file and extracts the last 2 valid objects. This is worth fixing in a follow-up: either rewrite `run-e2e.sh` to emit single-line JSON or update the gate scripts to handle the pretty-printed format. Filing as a deferred polish item, not a phase blocker.

2. **The 5-hour-old docker web container.** The container started long before the phase 107 plans landed, but vite HMR + bind mounts kept it serving current code (verified by the canvassing-wizard E2E tests that depend on Plan 107-06 changes passing on the first attempt). No restart needed.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `.planning/phases/107-canvassing-wizard-fixes/107-VERIFICATION-RESULTS.md` (created, 277 lines)
- FOUND: `.planning/phases/107-canvassing-wizard-fixes/107-09-SUMMARY.md` (this file)
- FOUND: commit `975af8e` (`test(107-09): in-gate fixes`) in git log
- FOUND: commit `1093822` (`docs(107-09): exit gate verification results`) in git log
- FOUND: 2 new entries in `web/e2e-runs.jsonl` for the gate runs (`04:39:52Z`, `04:42:43Z`), both `fail: 0`, both `exit_code: 0`
- FOUND: ruff exit 0, pytest 1118/0/0 exit 0, vitest 708/0/24 exit 0, Playwright 305/0/66 ×2 exit 0
- FOUND: `Phase 107 exit gate: PASSED` heading in 107-VERIFICATION-RESULTS.md
- FOUND: CANV-01, CANV-02, CANV-03, FORMS-01 all checked in `.planning/REQUIREMENTS.md` lines 24-26 + 42

## Next Phase Readiness

- Phase 107 is shippable. Trustworthy baseline from phase 106 is intact.
- 37 new tests added across 6 files; the canvassing wizard now has unit + integration + render-path + E2E coverage at every layer the bugs lived.
- Pinning bug class is locked at the render-path layer via `HouseholdCard.test.tsx`.
- Phase 108 (house selection) can begin on a fully green baseline.
- One deferred polish item: rewrite `run-e2e.sh` JSONL output to be strict NDJSON (or update the gate scripts to handle pretty-printed objects). Non-blocking — the multi-line parser works.

---
*Phase: 107-canvassing-wizard-fixes*
*Completed: 2026-04-11*
