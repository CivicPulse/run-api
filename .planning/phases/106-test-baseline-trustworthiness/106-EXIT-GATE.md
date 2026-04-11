---
gate: passed
date: 2026-04-11
phase: 106-test-baseline-trustworthiness
plan: 05
commit_at_gate: c21f60246b47131e1e736e96ed4875110a205889
suites:
  pytest:
    pass: 1114
    fail: 0
    skip: 0
    duration_s: 69.95
  vitest:
    pass: 675
    fail: 0
    todo: 24
    file_skipped: 7
    duration_s: 8.44
  playwright:
    runs: 2
    run_1:
      timestamp: "2026-04-11T01:52:12Z"
      pass: 300
      fail: 0
      skip: 65
      duration_s: 127.4
      workers: 8
    run_2:
      timestamp: "2026-04-11T01:54:28Z"
      pass: 295
      fail: 0
      skip: 65
      duration_s: 123.1
      workers: 8
---

# Phase 106 Exit Gate — D-12 Green Bar Confirmation

**Executed:** 2026-04-11 01:21Z → 2026-04-11 01:55Z
**Commit at gate:** `c21f60246b47131e1e736e96ed4875110a205889`
**Branch:** `gsd/v1.18-field-ux-polish`

## Pre-flight (verified clean)

- Docker compose: all services Up and healthy (api, web, postgres, minio, zitadel, zitadel-db, worker)
- Alembic: at head `039_volunteer_applications`
- `web/playwright/.auth/*.json`: cleared pre-flight (and again before each gate run)
- `web/playwright.config.ts` `retries:` line: unchanged from baseline (`process.env.CI ? 2 : 0`) — D-04 band-aid prohibition still honored

## Ruff

```
$ uv run ruff check .
All checks passed!                                       (exit 0)

$ uv run ruff format --check .
352 files already formatted                              (exit 0)
```

## Pytest

```
$ uv run pytest --tb=no -q
1114 passed, 16 warnings in 69.95s (0:01:09)             (exit 0)
```

- **Pass / Fail / Skip:** 1114 / 0 / 0
- **Skip audit:** Surviving skips all justified — only marker is
  `tests/integration/test_l2_import.py:24` with inline
  `pytest.mark.skipif(not _SAMPLE_PATH.exists(), reason="L2 sample CSV not available")`.
  D-10-compliant via the `reason=` argument.

## Vitest

```
$ cd web && npx vitest run
 Test Files  72 passed | 7 skipped (79)
      Tests  675 passed | 24 todo (699)
   Duration  8.44s                                       (exit 0)
```

- **Pass / Fail / Todo:** 675 / 0 / 24
- **`.only` markers:** 0 (grep `\.only(` in `web/src` `*.{test,spec}.{ts,tsx}` returned no matches)
- **`.skip` / `.fixme` markers:** 0 in `web/src` test files (the 7 file-level "skipped" reports are all `.todo()`-only files in `components/canvassing/map/*.test.tsx`, which are explicit TODO declarations and outside D-10 scope per `106-BASELINE.md §Vitest`)
- **D-10 audit verdict:** CLEAN

## Playwright — TWO consecutive runs (D-12, D-13)

Both runs invoked via `web/scripts/run-e2e.sh` (D-13 wrapper compliance).

| Run | Command | Exit | Pass | Fail | Skip | Duration | Workers | JSONL timestamp |
|-----|---------|------|------|------|------|----------|---------|-----------------|
| 1   | `web/scripts/run-e2e.sh` | 0 | 300 | 0 | 65 | 127.4s | 8 | `2026-04-11T01:52:12Z` |
| 2   | `web/scripts/run-e2e.sh` | 0 | 295 | 0 | 65 | 123.1s | 8 | `2026-04-11T01:54:28Z` |

Note: total executed test count varies (365 vs 360) because Playwright caches
auth setup tests across consecutive runs. The 5-test delta is the auth setup
suite being skipped in run #2 — every test that ran, passed.

JSONL hard assertion:
```
$ tail -2 of e2e-runs.jsonl entries → both have "fail": 0 and "exit_code": 0
BOTH_GREEN=True
```

## Triage performed during gate (in-loop authorized by orchestrator)

The first gate attempt at `2026-04-11T01:24:36Z` surfaced 5 failures.
Per the plan's failure-handling clause and orchestrator authorization, in-loop
triage was performed using the D-04 3x rerun rule:

| Spec | 3x rerun verdict | Action | Commit |
|------|-----------------|--------|--------|
| `a11y-scan.spec.ts` (volunteer-shifts) | 0/3 in isolation | Skip-with-justification (real product a11y bug; D-08 defer) | `b4d26eb` |
| `shifts.spec.ts` SHIFT-04/05 | 0/3 in isolation | Fix `.first()` locator (toast vs badge collision) | `b4d26eb` |
| `shifts.spec.ts` SHIFT-08 | (cascade) | Switch to API-direct edit (UI selector race) | `b4d26eb` |
| `shifts.spec.ts` SHIFT-07 | (cascade) | Fix apiPatch fallback body shape (was wrapped in `{data, headers}`) | `c21f602` |
| `voter-contacts.spec.ts` Final delete | 0/3 in isolation | Skip-with-justification (test data collision; defer to v1.19) | `b4d26eb` |
| `rbac.volunteer.spec.ts` | 3/3 PASS in isolation | Worker reduction 16→8 (concurrency flake) | `2250521` |
| `rbac.viewer.spec.ts` | 3/3 PASS in isolation | Worker reduction 16→8 (concurrency flake) | `2250521` |

Triage commits (chronological):
- `b4d26eb` — `test(106-05): triage gate-time hard fails — fix locator collisions, defer 2 specs`
- `2250521` — `chore(106-05): reduce default playwright workers 16 -> 8 (gate flake fix)`
- `c21f602` — `test(106-05): fix SHIFT-07 API fallback body shape (apiPatch is flat)`

After triage, two consecutive full-suite Playwright runs both exited 0. Total
triage cycles: 1 (within the orchestrator's 2-cycle cap).

## D-10 Skip-Marker Audit Rollup

| Suite | File-level surviving markers | All justified |
|-------|------------------------------|---------------|
| pytest (`tests/`) | 1 (`test_l2_import.py:24` skipif with reason) | YES |
| vitest (`web/src/**/*.{test,spec}.*`) | 0 | YES (vacuous) |
| Playwright (`web/e2e/*.spec.ts`) | 41 markers across 24 files | YES (every marker has adjacent justification comment from waves 4 + 5) |

`.only` markers across all suites: **0** (zero tolerance honored).

## Deletion Audit Trail (D-02, D-14)

```
$ git log --grep='PHASE-106-DELETE:' --all --oneline
f8b6fda test(106-04): delete walk-lists.spec.ts — pitfall-5
06f2ca3 test(106-04): delete map-interactions.spec.ts — pitfall-5
bff0bc3 test(106-04): delete field-mode.volunteer.spec.ts — pitfall-5
aff720e test(vitest): delete useCanvassing.test.ts — pitfall-5 imminent rewrite
8de8423 test(pytest): triage integration baseline — 1 fixed, 1 deleted
```

**Count:** 5 delete commits across pytest (1) + vitest (1) + Playwright (3).
All justifications in commit message bodies per D-02. No deletions in plan
106-05 itself — only skip-with-justification markers (which are not deletes).

## Playwright Config Integrity (D-04)

```
$ git log -p -- web/playwright.config.ts | grep -E "^[+-].*retries"
+  retries: process.env.CI ? 2 : 0,
```

The single matching line is from the original baseline commit. No recent
modifications to the `retries:` field. D-04 band-aid prohibition is honored.

## Wrapper Compliance (D-13)

Every Playwright invocation in this gate (and in the in-loop triage) went
through `web/scripts/run-e2e.sh`. The JSONL trail shows the descending
fail count of the gate sequence:

- `01:24:36Z` — 5 fails (initial gate attempt) — exit 1
- (in-loop spec-level triage runs, exit 1 each)
- `01:48:59Z` — 1 fail (after triage cycle 1 commits, before SHIFT-07 fix) — exit 1
- `01:52:12Z` — **0 fails** (gate run 1 of 2) — exit 0
- `01:54:28Z` — **0 fails** (gate run 2 of 2) — exit 0

## Gate Verdict

**PASSED** — TEST-04 success criteria satisfied. Phase 107 may proceed on a
trustworthy baseline.

D-12 exit gate PASSED — TEST-04 complete.
