---
gate: passed
date: 2026-04-11
phase: 107-canvassing-wizard-fixes
plan: 09
commit_at_gate: 1e7ca537d91ac08f229d78d14ee1ec8d9d2faf8b
requirements: [CANV-01, CANV-02, CANV-03, FORMS-01]
suites:
  ruff:
    check_exit: 0
    format_exit: 0
    files: 353
  pytest:
    pass: 1118
    fail: 0
    skip: 0
    duration_s: 74.87
    delta_vs_phase_106: "+4 (door_knocks integration tests)"
  vitest:
    pass: 708
    fail: 0
    todo: 24
    file_skipped: 7
    duration_s: 8.61
    delta_vs_phase_106: "+33 (5 usePrefersReducedMotion + 5 HOUSE_LEVEL_OUTCOMES + 14 useCanvassingWizard + 7 InlineSurvey + 2 HouseholdCard)"
  playwright:
    runs: 2
    run_1:
      timestamp: "2026-04-11T04:39:52Z"
      pass: 305
      fail: 0
      skip: 66
      duration_s: 163.7
      workers: 8
      exit: 0
    run_2:
      timestamp: "2026-04-11T04:42:43Z"
      pass: 305
      fail: 0
      skip: 66
      duration_s: 160.0
      workers: 8
      exit: 0
---

# Phase 107 — Verification Results

**Phase:** 107-canvassing-wizard-fixes
**Requirements:** CANV-01, CANV-02, CANV-03, FORMS-01
**Run date:** 2026-04-11T04:42Z
**Run host:** kudzu
**Git SHA at verification:** `1e7ca537d91ac08f229d78d14ee1ec8d9d2faf8b`
**Branch:** `gsd/v1.18-field-ux-polish`

This is the phase 107 analog of phase 106's `106-EXIT-GATE.md`. Same shape, same D-12 + D-13 wrapper rule, same two-consecutive-Playwright-greens requirement.

## Pre-flight (verified clean)

All Plans 107-01 through 107-08.1 landed and are in their expected state:

```
test -f web/src/hooks/usePrefersReducedMotion.ts                  → OK
test -f web/src/types/canvassing.test.ts                          → OK
test -f tests/integration/test_door_knocks.py                     → OK
test -f web/src/components/field/InlineSurvey.test.tsx            → OK
test -f web/e2e/canvassing-wizard.spec.ts                         → OK
test -f .planning/phases/107-canvassing-wizard-fixes/107-FORMS-AUDIT.md  → OK
test -f web/src/components/field/HouseholdCard.test.tsx           → OK (107-08.1 regression-guard)
grep -q "HOUSE_LEVEL_OUTCOMES" web/src/hooks/useCanvassingWizard.ts → OK
grep -q "notesRequired" web/src/components/field/InlineSurvey.tsx → OK
grep -q "Skipped — Undo" web/src/hooks/useCanvassingWizard.ts     → OK
```

Docker compose: api, web, postgres, minio, zitadel, zitadel-db, worker all Up.

## Suite Results

| Suite      | Command                                | Exit | Summary                          | Duration |
| ---------- | -------------------------------------- | ---- | -------------------------------- | -------- |
| Ruff       | `uv run ruff check .`                  | 0    | All checks passed                | 0.03s    |
| Ruff fmt   | `uv run ruff format --check .`         | 0    | 353 files already formatted      | 0.03s    |
| Pytest     | `uv run pytest`                        | 0    | 1118 passed, 16 warnings         | 74.87s   |
| Vitest     | `cd web && npx vitest run`             | 0    | 708 passed, 24 todo, 7 skipped   | 8.61s    |
| Playwright | `cd web && ./scripts/run-e2e.sh` (×2)  | 0    | 305 passed, 66 skipped (each)    | 163.7s + 160.0s |

## Ruff

```
$ uv run ruff check .
All checks passed!                                          (exit 0)

$ uv run ruff format --check .
353 files already formatted                                 (exit 0)
```

## Pytest

```
$ uv run pytest
1118 passed, 16 warnings in 74.87s (0:01:14)                (exit 0)
```

- **Pass / Fail / Skip:** 1118 / 0 / 0
- **Delta vs phase 106 baseline:** +4 (the four `tests/integration/test_door_knocks.py` empty-notes contract tests added by Plan 107-03)
- **Skip-marker audit:** 1 surviving file with a justified `pytest.mark.skipif` (`tests/integration/test_l2_import.py:24` — gated on optional L2 sample CSV; D-10 compliant via `reason=` argument). Same as the phase 106 baseline; no new skips introduced by phase 107.

## Vitest

```
$ cd web && npx vitest run
 Test Files  75 passed | 7 skipped (82)
      Tests  708 passed | 24 todo (732)
   Duration  8.61s                                          (exit 0)
```

- **Pass / Fail / Todo:** 708 / 0 / 24
- **Delta vs phase 106 baseline:** +33 (675 → 708)
- **`.only` markers:** 0 (zero tolerance honored)
- **`.skip` / `.fixme` markers in `web/src` test files:** 0 (the 7 file-level "skipped" reports are all `.todo()`-only files in `components/canvassing/map/*.test.tsx`, identical to phase 106)
- **D-10 audit verdict:** CLEAN

### Phase 107 new vitest test inventory (33 tests added)

| File                                              | New tests | Plan         |
| ------------------------------------------------- | --------- | ------------ |
| `web/src/hooks/usePrefersReducedMotion.test.ts`   | 5         | 107-01       |
| `web/src/types/canvassing.test.ts` (new HOUSE_LEVEL_OUTCOMES cases) | 5 | 107-02       |
| `web/src/hooks/useCanvassingWizard.test.ts`       | 14        | 107-04, 05   |
| `web/src/components/field/InlineSurvey.test.tsx`  | 7         | 107-06       |
| `web/src/components/field/HouseholdCard.test.tsx` | 2         | 107-08.1 (regression-guard) |
| **Total new vitest**                              | **33**    |              |

### Phase 107 new pytest test inventory (4 tests added)

| File                                       | New tests | Plan   |
| ------------------------------------------ | --------- | ------ |
| `tests/integration/test_door_knocks.py`    | 4         | 107-03 |

**Combined phase 107 new test count:** 37 (33 vitest + 4 pytest), satisfying the TEST-01/02/03 obligation at the canvassing surface for v1.18.

## Playwright — TWO consecutive runs (D-12, D-13 from phase 106)

Both runs invoked via `web/scripts/run-e2e.sh` (D-13 wrapper compliance), with `E2E_DEV_SERVER_URL=https://localhost:49372` set so the wrapper points at the docker compose web container instead of trying to spawn its own preview.

| Run | Command                          | Exit | Pass | Fail | Skip | Duration | Workers | JSONL timestamp        |
| --- | -------------------------------- | ---- | ---- | ---- | ---- | -------- | ------- | ---------------------- |
| 1   | `web/scripts/run-e2e.sh`         | 0    | 305  | 0    | 66   | 163.7s   | 8       | `2026-04-11T04:39:52Z` |
| 2   | `web/scripts/run-e2e.sh`         | 0    | 305  | 0    | 66   | 160.0s   | 8       | `2026-04-11T04:42:43Z` |

JSONL hard assertion (parsed via the multi-line aware parser since `e2e-runs.jsonl` is pretty-printed JSON objects):

```
$ uv run python -c "..."   # multi-line JSONL parser
total: 773
last_2_green: 2
2026-04-11T04:39:52Z fail= 0 exit= 0 pass= 305 skip= 66 workers= 8
2026-04-11T04:42:43Z fail= 0 exit= 0 pass= 305 skip= 66 workers= 8
```

### run-e2e.sh log entry (run #2, last line of `web/e2e-runs.jsonl`)

```json
{
  "timestamp": "2026-04-11T04:42:43Z",
  "pass": 305,
  "fail": 0,
  "skip": 66,
  "did_not_run": 0,
  "total": 371,
  "duration_s": "160.0",
  "command": "npx playwright test --reporter=list --workers 8",
  "exit_code": 0,
  "log_file": "e2e-logs/20260411-004243.log",
  "mode": "preview",
  "workers": "8"
}
```

## Triage performed during this gate (in-loop, within 1 cycle of the orchestrator's 2-cycle cap)

The first full Playwright invocation at `2026-04-11T04:32:04Z` surfaced **17 hard failures** clustered around `phase12-settings-verify.spec.ts`, `cross-cutting.spec.ts`, `rbac.spec.ts`, `rbac.admin.spec.ts`, `rbac.manager.spec.ts`, `tooltip-popovers`, plus 1 in `canvassing-wizard.spec.ts` (CANV-02) and a handful in `table-sort` / `turfs`. Per phase 106 D-04 the failing CAMP-01 spec was re-run 3x in isolation and went **0/3** — definite real failure, not flake.

Root-cause investigation: the Playwright page snapshot from the failing CAMP-01 test showed the user landed at `/` (campaigns list) instead of `/campaigns/{id}/settings/general`. The auth state files in `web/playwright/.auth/*.json` were ~7 hours old (from `2026-04-10 21:52` local time), older than the ZITADEL OIDC access-token lifetime. The settings page load issued an API request, the API returned 401, and TanStack Router's not-authorized handler redirected to the campaigns list. Every clustered failure shared the same symptom because they all sit behind the same auth state.

**Triage action:** Cleared `web/playwright/.auth/*.json` once. The wrapper's auth setup tests (`auth-{owner,admin,manager,viewer,volunteer}.setup.ts`) re-ran on the next full invocation and re-minted fresh tokens. Both gate runs that follow use this fresh state. No code or test changes were required for the auth-cluster.

The CANV-02 failure was a separate, real test-shape regression caused by Plan 107-08.1's pinning fix correctly making the displayed HouseholdCard advance to the next household after Skip. The previous test asserted on the "Skipped" badge of the *previously-active* household, which is no longer the displayed card. Fixed in `web/e2e/canvassing-wizard.spec.ts` by removing the dead Skipped-badge assertion and keeping the door-counter advance and the `Skipped — Undo` toast assertions, both of which carry the D-05 / D-06 reversibility signal at this layer. Per-entry skip state is exhaustively covered at the unit layer by `HouseholdCard.test.tsx` (107-08.1) and `useCanvassingWizard.test.ts` (107-05). Rule 1 deviation, documented in the Plan 107-09 SUMMARY.

Triage cycles total: **1** (within the orchestrator's 2-cycle cap). After triage, two consecutive full-suite Playwright runs both exited 0. No `retries:` band-aid added (D-04 still honored).

### Vitest in-loop fix

The first vitest run after starting the gate also surfaced **3 failures** in `web/src/routes/field/$campaignId/phone-banking.test.tsx` — the test hard-coded `getByLabelText("Call Notes")` against the InlineSurvey label, but Plan 107-06 renamed the label to "Notes" with a separate `(optional)` span. Fixed by replacing the 4 hard-coded "Call Notes" lookups with `/Notes/i` regex matchers (Rule 1 — pre-existing test wasn't updated when the label was renamed). Re-run: 7/7 passing. Documented in the SUMMARY.

## Skip-Marker Audit Rollup

| Suite       | File-level surviving markers                                | All justified |
| ----------- | ----------------------------------------------------------- | ------------- |
| pytest      | 1 (`tests/integration/test_l2_import.py:24` skipif/reason)  | YES           |
| vitest      | 0 in `web/src/**/*.{test,spec}.*`                           | YES (vacuous) |
| Playwright  | 41 markers across 24 files (unchanged from phase 106 baseline) + 1 deferred skip in `canvassing-wizard.spec.ts` for FORMS-01 D-17 phone-banking (cross-references `.planning/todos/pending/107-e2e-fixture-needs.md`) | YES |

`.only` markers across all suites: **0**.

## PHASE-106-DELETE Audit (legacy from phase 106)

```
$ git log --grep='PHASE-106-DELETE:' --all --oneline | wc -l
5
```

Unchanged from phase 106 (5 delete commits across pytest 1 + vitest 1 + Playwright 3). Phase 107 introduced **zero** new deletes.

## CANV-01 Visible-Swap Regression-Guard Verification

The pinning bug surfaced in Plan 107-08 (deferred via `.planning/todos/pending/107-canvassing-pinning-uxgap.md`) and was closed in Plan 107-08.1. The regression-guard mechanism is:

1. **`web/src/components/field/HouseholdCard.test.tsx`** — 2 render-path tests that mount a tiny `WizardHarness` component, drive `useCanvassingWizard` through a HOUSE_LEVEL_OUTCOMES outcome and through Skip, and assert on `screen.getByTestId(...).textContent` — the actual DOM text the volunteer would see. Both tests passed in this gate as part of the 708-test vitest suite.
2. **Verification of the regression-guard during 107-08.1:** the executor reverted the fix (commented out the two `setPinnedHouseholdKey(null)` calls inside the wrapped `advanceAddress` and `skipEntry`) and re-ran the test → both tests went **red** with `AssertionError: expected 'house-multi' to be 'house-next'` and the rendered DOM stuck on House A's address. Re-applied the fix → both tests went **green** again. Documented in `.planning/phases/107-canvassing-wizard-fixes/107-08.1-SUMMARY.md` §Regression-Guard Verification.
3. **E2E layer:** `canvassing-wizard.spec.ts` CANV-01 happy path asserts on the door counter advance + sonner toast (the user-visible signals that fire correctly post-fix). The previous deferred-bug stale-card symptom from 107-08 is closed and the test no longer carries the workaround — the post-CANV-02-fix in this gate replaced the obsolete Skipped-badge assertion with the same toast-anchored shape.

The pinning bug class is locked at the render-path layer. Any future regression that re-introduces the pin-stuck behavior would fail `HouseholdCard.test.tsx` immediately.

## Must-Have Verification (from Plans 01-08)

| #   | Must-have                                                                       | Plan       | Evidence                                                                                                                                      |
| --- | ------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `usePrefersReducedMotion` hook exists and tests pass                            | 107-01     | 5 vitest tests in `usePrefersReducedMotion.test.ts` green                                                                                     |
| 2   | `HOUSE_LEVEL_OUTCOMES` set exists                                               | 107-02     | 5 new vitest tests in `canvassing.test.ts` green (13 total)                                                                                   |
| 3   | Door-knock POST accepts empty/null notes                                        | 107-03     | 4 pytest integration tests in `test_door_knocks.py` green                                                                                     |
| 4   | CANV-01: multi-voter household advances on house-level outcome                  | 107-04     | "house-level outcome on multi-voter household advances immediately" unit test + `canvassing-wizard.spec.ts` CANV-01 happy path E2E green       |
| 5   | Triple-channel feedback wired with reduced-motion honor                         | 107-04     | Toast + vibrate + focus-ref unit tests green; aria-live region present                                                                        |
| 6   | CANV-02: Skip advances synchronously with isPending guard                       | 107-05     | "double-tap Skip" unit test + `canvassing-wizard.spec.ts` CANV-02 E2E green; `setTimeout(..., 300)` removed                                    |
| 7   | CANV-03: `notesRequired` prop decoupled from `isControlled`                     | 107-06     | `InlineSurvey.test.tsx` 7 tests green; both call sites pass `notesRequired={false}`; `phone-banking.test.tsx` regex-matcher fix in this gate  |
| 8   | FORMS-01 audit document exists                                                  | 107-07     | `107-FORMS-AUDIT.md` with 2 REMOVED + 2 KEPT rows                                                                                             |
| 9   | Phase 107 E2E spec covers CANV-01/02/03 + FORMS-01 D-17                         | 107-08     | `canvassing-wizard.spec.ts` 5/5 + 1 D-17 deferred skip — passes via run-e2e.sh in both gate runs                                              |
| 9.1 | CANV-01 visible-swap regression-guard + pinning bug closed                      | 107-08.1   | `HouseholdCard.test.tsx` 2 tests green + revert-and-fail verification on record                                                               |
| 10  | Full 3-suite green (this gate)                                                  | 107-09     | This document                                                                                                                                 |

## Roadmap Success Criteria (from ROADMAP.md §Phase 107)

- [x] **(1)** Submitting an outcome on the active house automatically transitions the wizard to the next house — verified by the "house-level outcome on multi-voter household advances immediately" unit test, the `canvassing-wizard.spec.ts` CANV-01 happy path E2E, and the `HouseholdCard.test.tsx` render-path regression-guard.
- [x] **(2)** Tapping "Skip house" advances past the current house in one tap — verified by the "double-tap Skip" guard test and the `canvassing-wizard.spec.ts` CANV-02 E2E (post-pinning-fix shape).
- [x] **(3)** Any outcome saves with empty notes — verified by `test_door_knocks.py` integration tests, `InlineSurvey.test.tsx` `notesRequired=false` tests, and `canvassing-wizard.spec.ts` CANV-03.
- [x] **(4)** FORMS-01 audit doc exists — `107-FORMS-AUDIT.md`.
- [x] **(5)** Unit + integration + E2E cover all changes — 37 new tests across 6 test files (see inventory above).

## Regression Check vs Phase 106

- **Pytest:** phase 106 was 1114 / 0 / 0; current is **1118 / 0 / 0** (delta +4 = door_knocks).
- **Vitest:** phase 106 was 675 / 0 / 24 todo; current is **708 / 0 / 24 todo** (delta +33 across 6 phase-107 test files).
- **Playwright:** phase 106 was 300 + 295 across the two greens (auth-setup caching delta); current is **305 + 305** (delta +5 covering the 5 active canvassing-wizard tests added by Plan 107-08, with 1 D-17 skip).
- **Skip-marker baseline:** unchanged. No new unjustified skips. The single `canvassing-wizard.spec.ts` deferred skip cross-references `.planning/todos/pending/107-e2e-fixture-needs.md` per D-10.
- **`PHASE-106-DELETE:` count:** 5 (unchanged).
- **Playwright `retries:` field:** unchanged from phase 106 baseline (`process.env.CI ? 2 : 0`). D-04 band-aid prohibition still honored.
- **rbac cluster:** still green under 8 workers.

## Wrapper Compliance (D-13)

Every Playwright invocation in this gate (and in the in-loop triage) went through `web/scripts/run-e2e.sh`. The descending fail-count trail in `web/e2e-runs.jsonl`:

- `04:32:04Z` — 17 fails (initial gate attempt, stale auth state) — exit 1
- `04:35:57Z` — 0 fails (canvassing-wizard.spec.ts only, post test-shape fix) — exit 0
- `04:39:52Z` — **0 fails** (gate run 1 of 2, fresh auth) — exit 0
- `04:42:43Z` — **0 fails** (gate run 2 of 2, fresh auth) — exit 0

## Conclusion

**Phase 107 exit gate: PASSED — CANV-01 / CANV-02 / CANV-03 / FORMS-01 complete.**

The full trustworthy baseline established by phase 106 is intact:
- Ruff clean
- Pytest 1118 / 0 / 0
- Vitest 708 / 0 / 24 todo
- Playwright 305 / 0 / 66 on two consecutive green runs via `run-e2e.sh`

Phase 107 adds 37 new tests across 6 files and closes the pinning regression at the render-path layer. CANV-01, CANV-02, CANV-03, and FORMS-01 are all marked complete in `REQUIREMENTS.md`. The phase is shippable.
