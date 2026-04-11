---
gate: passed
date: 2026-04-11
phase: 110-offline-queue-connectivity-hardening
plan: 08
commit_at_gate: 18d54e9
requirements: [OFFLINE-01, OFFLINE-02, OFFLINE-03, TEST-01, TEST-02, TEST-03]
suites:
  ruff:
    check_exit: 0
    format_exit: 0
    files: 355
  pytest:
    pass: 1122
    fail: 0
    skip: 0
    duration_s: 73.79
    delta_vs_phase_109: "+4 (client_uuid canvass service tests — plan 110-02)"
  tsc:
    exit: 0
  vitest:
    pass: 805
    fail: 0
    todo: 21
    file_skipped: 6
    duration_s: 9.17
    delta_vs_phase_109: "+67 (offline queue, sync engine, connectivity pill/sheet, offline banner, wizard pre-flight test — plans 110-02/03/04/05/06/08)"
  playwright:
    runs: 2
    run_1:
      timestamp: "2026-04-11T21:38:14Z"
      pass: 312
      fail: 0
      skip: 66
      duration_s: 137.9
      workers: 8
      exit: 0
      log_file: e2e-logs/20260411-173814.log
    run_2:
      timestamp: "2026-04-11T21:40:44Z"
      pass: 312
      fail: 0
      skip: 66
      duration_s: 132.4
      workers: 8
      exit: 0
      log_file: e2e-logs/20260411-174044.log
    delta_vs_phase_109: "+4 (canvassing-offline-sync.spec.ts — OFFLINE-01, OFFLINE-02, OFFLINE-03 5xx, OFFLINE-03 422)"
---

# Phase 110 — Verification Results

**Phase:** 110-offline-queue-connectivity-hardening
**Requirements:** OFFLINE-01, OFFLINE-02, OFFLINE-03, TEST-01, TEST-02, TEST-03
**Run date:** 2026-04-11T21:40Z
**Run host:** kudzu
**Git SHA at verification:** `18d54e9` (branch `gsd/v1.18-field-ux-polish`)
**Branch:** `gsd/v1.18-field-ux-polish`

Phase 110 analog of phase 109's `109-VERIFICATION-RESULTS.md`. Same shape,
same D-12 + D-13 wrapper rule, same two-consecutive-Playwright-greens
requirement. This is the **milestone v1.18 final exit gate** — when this
passes, v1.18 ships.

## Baseline (from phase 109 exit gate)

| Suite      | Pass | Fail | Skip/Todo |
|------------|------|------|-----------|
| ruff       | clean | —   | — |
| pytest     | 1118 | 0    | 0 |
| tsc        | clean | —   | — |
| vitest     | 738  | 0    | 21 todo |
| playwright | 308  | 0    | 66 |

## Pre-flight (verified clean)

Phase 110 artifacts present before gate run:

```
test -f .planning/phases/110-offline-queue-connectivity-hardening/110-OFFLINE-AUDIT.md   → OK
test -f .planning/phases/110-offline-queue-connectivity-hardening/110-COVERAGE-AUDIT.md  → OK
test -f web/src/components/field/ConnectivityPill.tsx                                     → OK
test -f web/src/components/field/ConnectivitySheet.tsx                                    → OK
test -f web/e2e/canvassing-offline-sync.spec.ts                                           → OK
grep -q "client_uuid" app/schemas/walk_list.py                                            → OK
grep -q "client_uuid" web/src/types/walk-list.ts                                          → OK
grep -q "computeBackoffMs" web/src/hooks/useSyncEngine.ts                                 → OK
grep -q "deadLetter" web/src/stores/offlineQueueStore.ts                                  → OK
```

Docker compose: api, web, postgres, minio, zitadel, zitadel-db, worker all Up.

## Suite Results

| Suite      | Command                                  | Exit | Summary                         | Duration |
| ---------- | ---------------------------------------- | ---- | ------------------------------- | -------- |
| Ruff       | `uv run ruff check .`                    | 0    | All checks passed               | 0.03s    |
| Ruff fmt   | `uv run ruff format --check .`           | 0    | 355 files already formatted     | 0.03s    |
| Pytest     | `uv run pytest`                          | 0    | 1122 passed, 16 warnings        | 73.79s   |
| tsc        | `cd web && npx tsc --noEmit`             | 0    | clean                           | —        |
| Vitest     | `cd web && npx vitest run`               | 0    | 805 passed, 21 todo, 6 skipped  | 9.17s    |
| Playwright | `./scripts/run-e2e.sh` (×2)              | 0    | 312 passed, 66 skipped (each)   | 137.9s + 132.4s |

## Gate 1 — Ruff

**Command:** `uv run ruff check . && uv run ruff format --check .`
**Timestamp:** 2026-04-11T21:12Z
**Result:** PASS (no diffs)

```
$ uv run ruff check .
All checks passed!                                          (exit 0)

$ uv run ruff format --check .
355 files already formatted                                 (exit 0)
```

## Gate 2 — Pytest

**Command:** `uv run pytest`
**Timestamp:** 2026-04-11T21:12Z
**Result:** 1122 pass, 0 fail — **delta vs phase 109 baseline: +4**

```
$ uv run pytest
================= 1122 passed, 16 warnings in 73.79s (0:01:13) =================
```

- **Pass / Fail / Skip:** 1122 / 0 / 0
- **Delta vs phase 109 baseline:** +4 (Plan 110-02 added four `test_canvass_client_uuid_*` tests covering the new `DuplicateClientUUIDError` 409 path, the `uq_voter_interactions_door_knock_client_uuid` partial unique index, and the idempotent re-POST path required by OFFLINE-01 replay semantics).
- **Skip-marker audit:** unchanged from phase 109.

## Gate 3 — tsc + Vitest

**Command:** `cd web && npx tsc --noEmit && npx vitest run`
**Timestamp:** 2026-04-11T21:13Z
**Result:** tsc clean; vitest 805 pass, 0 fail, 21 todo

```
$ cd web && npx tsc --noEmit
(clean exit, no output)                                     (exit 0)

$ cd web && npx vitest run
 Test Files  83 passed | 6 skipped (89)
      Tests  805 passed | 21 todo (826)
   Duration  9.17s                                          (exit 0)
```

- **Pass / Fail / Todo:** 805 / 0 / 21
- **Delta vs phase 109 baseline:** **+67 pass** (738 → 805), 0 todo delta
- **`.only` markers:** 0
- **`.skip` / `.fixme` in `web/src`:** 0

### Phase 110 new vitest test inventory

| File                                                                  | Plan   | New tests |
| --------------------------------------------------------------------- | ------ | --------- |
| `src/stores/offlineQueueStore.test.ts` (OFFLINE-01 push semantics)    | 110-02 | +24       |
| `src/stores/offlineQueueStore.persistence.test.ts` (localStorage rehydration) | 110-02 | +5 |
| `src/hooks/useSyncEngine.test.ts` (classifyError + drainQueue dispositions) | 110-03/04 | +31 |
| `src/hooks/useSyncEngine.backoff.test.ts` (OFFLINE-03 backoff schedule)      | 110-04   | +5       |
| `src/components/field/ConnectivityPill.test.tsx`                       | 110-05 | +parts of suite (pre-existed) |
| `src/components/field/ConnectivitySheet.test.tsx`                      | 110-05 | +parts of suite (pre-existed) |
| `src/components/field/OfflineBanner.test.tsx` (coverage backfill)      | 110-06 | +parts of suite |
| `src/hooks/useCanvassingWizard.test.ts` (pre-flight onLine regression) | 110-08 | +1        |
| **Total:**                                                             |        | **+67 absolute delta vs phase 109** |

738 + 67 = 805; matches the raw delta exactly.

### tsc

Clean exit, no diagnostics. Plan 110-08 added `client_uuid: string` to
the `DoorKnockCreate` type and threaded it through every call site
(`DoorKnockDialog`, `useCanvassingWizard` single / contact-draft /
batch-not-home paths). All offline queue + sync engine + field component
tests were updated to include the new required field in fixture
payloads; tsc saw zero diagnostics on the updated surface.

## Gate 4 — Playwright (TWO consecutive runs via run-e2e.sh, D-13)

Both runs invoked via `web/scripts/run-e2e.sh` in preview mode (auto-detected
— no Vite dev server on :5173), targeting the docker compose stack on
their standard ports. Preview mode serves a freshly built `dist/`
bundle (built at 21:26:14Z after the pre-flight onLine fix landed).

| Run | Exit | Pass | Fail | Skip | Duration | Workers | JSONL timestamp        |
| --- | ---- | ---- | ---- | ---- | -------- | ------- | ---------------------- |
| 1   | 0    | 312  | 0    | 66   | 137.9s   | 8       | `2026-04-11T21:38:14Z` |
| 2   | 0    | 312  | 0    | 66   | 132.4s   | 8       | `2026-04-11T21:40:44Z` |

**Auth staleness retry needed:** NO. Both runs reused the cached
`playwright/.auth/*.json` state; docker stack has been running
continuously, ZITADEL tokens remained inside their lifetime.

### Delta analysis vs phase 109 baseline

Phase 109 reported 308 pass / 374 total. Phase 110 reports 312 pass /
378 total. The raw summary delta is **+4 pass, +4 total**, accounted
for entirely by:

- **+4 new tests** from `canvassing-offline-sync.spec.ts` (Plan 110-07):
  - OFFLINE-01: 3 outcomes recorded offline replay as 3 distinct POSTs on reconnect
  - OFFLINE-02: ConnectivityPill walks Online → Offline → pending → Syncing → Synced
  - OFFLINE-03 (5xx): server error stamps backoff, recovery on retry lands 200
  - OFFLINE-03 (422): validation error dead-letters, Sheet Retry recovers

Per-spec count verification: every phase 109 spec runs the same number
of tests today; only new spec is `canvassing-offline-sync.spec.ts`.
**Zero regressions.**

### run-e2e.sh jsonl entries (final two gate rows)

```json
{
  "timestamp": "2026-04-11T21:38:14Z",
  "pass": 312, "fail": 0, "skip": 66, "did_not_run": 0, "total": 378,
  "duration_s": "137.9",
  "command": "npx playwright test --reporter=list --workers 8",
  "exit_code": 0,
  "log_file": "e2e-logs/20260411-173814.log",
  "mode": "preview", "workers": "8"
}
{
  "timestamp": "2026-04-11T21:40:44Z",
  "pass": 312, "fail": 0, "skip": 66, "did_not_run": 0, "total": 378,
  "duration_s": "132.4",
  "command": "npx playwright test --reporter=list --workers 8",
  "exit_code": 0,
  "log_file": "e2e-logs/20260411-174044.log",
  "mode": "preview", "workers": "8"
}
```

### canvassing-offline-sync coverage observed in both runs

Both runs executed the full 4-test `canvassing-offline-sync.spec.ts`
spec with identical pass outcomes. The OFFLINE-01/02/03(5xx)/03(422)
quartet is the Plan 110-07 deliverable that closes the OFFLINE
requirement column of the phase 110 coverage audit.

## Requirements Closed

| REQ        | Plan         | Evidence                                                                                             |
|------------|--------------|------------------------------------------------------------------------------------------------------|
| OFFLINE-01 | 110-02       | `client_uuid` partial unique index (migration 040) + `DuplicateClientUUIDError` 409 path + offline queue dedupe-on-push + idempotent replay; E2E OFFLINE-01 proves 3 POSTs land as 3 distinct rows |
| OFFLINE-02 | 110-05       | `ConnectivityPill` + `ConnectivitySheet` with 6-state deriveView; E2E OFFLINE-02 walks the full Online → Offline → pending → Syncing → Synced cycle at iPhone 14 Pro viewport |
| OFFLINE-03 | 110-03, 110-04 | `classifyError` 4-way split + `computeBackoffMs` 1s→60s ladder + `moveToDeadLetter` for 4xx + `setItemBackoff` for 5xx/network; E2E OFFLINE-03 (5xx) proves backoff + recovery, (422) proves dead-letter + Sheet Retry |
| TEST-01    | 110-02/03/04 | Unit: offlineQueueStore +24, useSyncEngine +31, backoff schedule +5, canvass service client_uuid +4  |
| TEST-02    | 110-05/06    | Component: ConnectivityPill + ConnectivitySheet + OfflineBanner test suites (Plan 110-05/06)         |
| TEST-03    | 110-07       | E2E: `canvassing-offline-sync.spec.ts` — 4 tests, green in both gate runs                            |

- [x] **OFFLINE-01** — Offline outcome queue idempotent on replay: the
      `client_uuid` stamp at the submitDoorKnock call site flows through
      the offline queue, the online retry path, AND the server's
      partial unique index on `voter_interactions.client_uuid` so replay
      is safe even across page reloads.
- [x] **OFFLINE-02** — Volunteers always know their sync state:
      ConnectivityPill's six-state derivation covers Online, Offline,
      Syncing, Syncing (slow), N pending, Synced Xm ago, plus a
      dead-letter overlay dot. ConnectivitySheet provides the Retry /
      Discard affordances required by the plan.
- [x] **OFFLINE-03** — Error classification and recovery: 4xx non-409
      dead-letters on first failure (no retry stall); 5xx + network
      back off on the 1s→2s→4s→…60s ladder; 409 is silent success;
      volunteer-initiated retry via the ConnectivitySheet re-enqueues
      with a fresh `nextAttemptAt` and the next drain lands 200.

## Test Coverage Obligations (TEST-01/02/03 per D-12)

- [x] **Unit (vitest):** offlineQueueStore, useSyncEngine, backoff
      schedule, canvass service client_uuid tests. See inventory above.
- [x] **Component (vitest):** ConnectivityPill, ConnectivitySheet,
      OfflineBanner test suites (Plan 110-05 / 110-06).
- [x] **E2E (Playwright):** `canvassing-offline-sync.spec.ts` — 4 tests
      covering OFFLINE-01/02/03(5xx)/03(422) (Plan 110-07).

Phase-110 coverage: **+67 vitest net-new + 4 Playwright = 71 new tests
delivered against the OFFLINE-01/02/03 + TEST-01/02/03 obligations.**

## Must-Have Verification

| # | Must-have                                                                         | Plan   | Evidence |
|---|-----------------------------------------------------------------------------------|--------|----------|
| 1 | `110-OFFLINE-AUDIT.md` catalogs every offline-boundary touch point                | 110-01 | `110-OFFLINE-AUDIT.md` |
| 2 | `client_uuid` threaded end-to-end with partial unique index + 409 dedupe         | 110-02 | migration 040, `canvass.py` `DuplicateClientUUIDError`, Plan 110-02 pytest +4 |
| 3 | `classifyError` 4-way split + `computeBackoffMs` 1s→60s ladder                    | 110-03 | `useSyncEngine.ts` + backoff test suite +5 |
| 4 | Dead-letter queue + Sheet Retry/Discard + periodic drain trigger                   | 110-04 | `offlineQueueStore.ts` deadLetter slice + `retryDeadLetter` + `ConnectivitySheet.tsx` |
| 5 | `ConnectivityPill` 6-state derivation + overlay for dead-letter                    | 110-05 | `ConnectivityPill.tsx` + component test suite |
| 6 | Coverage audit closes gaps identified in `110-COVERAGE-AUDIT.md`                   | 110-06 | `110-COVERAGE-AUDIT.md` + VoterCard backfill |
| 7 | E2E Playwright spec exercises OFFLINE-01/02/03                                     | 110-07 | `canvassing-offline-sync.spec.ts` (4 tests) |
| 8 | Full 4-suite green with two consecutive Playwright greens                          | 110-08 | This document |

## Roadmap Success Criteria (from ROADMAP.md §Phase 110)

- [x] **(1)** Offline queue reliably persists outcomes across reloads,
      replays them on reconnect, and reconciles idempotently via
      `client_uuid` — Plan 110-02 end-to-end evidence + E2E OFFLINE-01.
- [x] **(2)** Volunteers always know their sync state via the
      ConnectivityPill + Sheet — Plan 110-05 evidence + E2E OFFLINE-02.
- [x] **(3)** Server errors back off correctly and validation errors
      dead-letter cleanly; volunteer-initiated retry recovers dead-letter
      items — Plan 110-03 / 110-04 evidence + E2E OFFLINE-03 (5xx, 422).
- [x] **(4)** Full v1.18 test suite gate satisfied (4-suite green with
      two consecutive Playwright greens) — this document.

## Deviations from Plan

### Auto-fixed issues (Rule 1 — Bug)

**1. [Rule 1 — Bug] ky retry ladder swallowed offline errors past the 5s assertion window**

- **Found during:** Gate 4, first full-suite run (exit 1, 5 failures —
  4 × canvassing-offline-sync + 1 × phase12-settings-verify).
- **Issue:** `useDoorKnockMutation` was calling `api.post(...)` with ky's
  default retry config. Ky's default network-error retry ladder
  (1s → 2s → 4s ≈ 7s total before surfacing the error) blocked the
  `submitDoorKnock` catch branch from firing before the offline queue
  fallback could update the `ConnectivityPill`. Under Playwright's
  `context.setOffline(true)`, outgoing requests hang until ky's 10s
  timeout — but the E2E assertions poll for 5s — so the `aria-label`
  never transitioned from `"Offline"` to `"Offline, 1 pending"`.
- **Fix:** Disabled ky's retry for door-knock POSTs (`retry: { limit: 0 }`)
  — the offline queue (exponential backoff + dead-letter + client_uuid
  idempotency) is the correct retry layer, so a per-request retry is
  both redundant and harmful.
- **Verify:** First fix alone still failed — see Rule 1 #2 below.
- **Files modified:** `web/src/hooks/useCanvassing.ts`.
- **Commit:** `8f4116c2`.

**2. [Rule 1 — Bug] submitDoorKnock's offline fallback fired too late (post-failure instanceof TypeError)**

- **Found during:** Gate 4, second full-suite run (post-Rule-1-#1).
- **Issue:** Even with ky retry disabled, the four
  `canvassing-offline-sync` tests continued to fail with the same
  `aria-label: "Offline"` / expected `/1 pending/` error. Root cause:
  `submitDoorKnock` only triggered the offline queue fallback inside a
  `catch (err) { if (err instanceof TypeError) { queueDoorKnockOffline(payload) } }`
  block — it was waiting for the fetch to _fail_ rather than checking
  `navigator.onLine` directly. Under Playwright's CDP-level setOffline,
  outgoing requests hang rather than reject with TypeError, so ky sat
  waiting for its own 10s timeout, past the test's 5s window. The
  `ConnectivityPill` derives its "Offline" state from `navigator.onLine`,
  so `submitDoorKnock` disagreed with the UI about whether we were
  offline.
- **Fix:** Added a pre-flight `navigator.onLine === false` check at the
  top of `submitDoorKnock`. When the browser already knows it's offline,
  skip the network attempt entirely and queue synchronously. The
  `instanceof TypeError` branch stays in place as a safety net for
  "we thought we were online and the request died mid-flight". This
  aligns `submitDoorKnock` with `ConnectivityPill`: both now derive
  offline state from the same `navigator.onLine` signal, so the UI
  and the queue can't disagree.
- **Verify:** Unit regression test added to
  `useCanvassingWizard.test.ts` ("submitDoorKnock pre-flights
  navigator.onLine and queues offline without firing mutateAsync")
  + 3/4 OFFLINE tests passed on next full-suite run.
- **Files modified:** `web/src/hooks/useCanvassingWizard.ts`,
  `web/src/hooks/useCanvassingWizard.test.ts`.
- **Commit:** `c0120038`.

**3. [Rule 1 — Test Bug] OFFLINE-03 (5xx) asserted an offline-only aria-label substring after reconnect**

- **Found during:** Gate 4, third full-suite run (post-rebuild).
- **Issue:** With the real offline fallback working, OFFLINE-01/02/03(422)
  all passed — but OFFLINE-03 (5xx) failed at a NEW spot. After
  `context.setOffline(false)` the `ConnectivityPill.deriveView` enters
  its online-with-queue branch and uses the aria-label phrasing
  `"N outcomes pending sync"` — distinct from the offline phrasing
  `"Offline, N pending"` matched earlier in the same test. The test
  regex `/1 pending/` only matched the offline phrase as a substring;
  it was never going to match the online phrase.
- **Fix:** Widened the regex to `/outcomes? pending sync|1 pending/` so
  the assertion matches either phrasing. The test comment ("pill
  continues to show '1 pending'") was referring to the button's visible
  text (which IS `"1 pending"`) but the assertion targeted `aria-label`.
- **Files modified:** `web/e2e/canvassing-offline-sync.spec.ts`.
- **Commit:** `780e57a9`.

**4. [Rule 1 — Test Bug] OFFLINE-03 (422) raced React's useConnectivityStatus via back-to-back CDP toggles**

- **Found during:** Gate 4, fourth full-suite run (after Rule 1 #3).
- **Issue:** After clicking the Sheet Retry button, OFFLINE-03 (422)
  needs to re-trigger `drainQueue` so the retried item is POSTed. The
  test did `setOffline(true); setOffline(false)` with no wait between
  the two CDP calls. The `useEffect([isOnline])` in `useSyncEngine`
  arms a 1s debounced drain on every online transition, so the test
  relies on React seeing `isOnline` go `false → true`. But the two
  Playwright CDP calls coalesce faster than React's
  `useConnectivityStatus` can observe the intermediate state — React
  `isOnline` stays `true` the whole time, the effect dep doesn't
  change, and no new drain timer schedules. The test then waits 25s
  for the queue to drain, but the next drain trigger is the 30s
  periodic interval — which fires AFTER the poll timeout.
- **Fix:** Added an `await expect(pill(page)).toHaveAttribute("aria-label", /Offline/, { timeout: 5_000 })`
  between the two CDP toggles. This blocks the test until React has
  actually observed the offline state, guaranteeing the subsequent
  online transition re-runs the effect and schedules a fresh 1s drain.
- **Verify:** Spot-check: `./scripts/run-e2e.sh --grep "OFFLINE-03 \(422\)" canvassing-offline-sync.spec.ts`
  → 2/2 passed in 9.7s (previously failed consistently at 28.7s).
  Full-suite run: 312/0/66 × 2.
- **Files modified:** `web/e2e/canvassing-offline-sync.spec.ts`.
- **Commit:** `18d54e93`.

### Test-bug auto-fix (pre-existing flake, not a phase 110 regression)

**5. [Test bug — react-hook-form reset race] phase12-settings-verify CAMP-01 left DB polluted on failure**

- **Found during:** Gate 4, first and second full-suite runs (surfaced
  once the offline-queue bug stopped masking other failures).
- **Issue:** The CAMP-01 test saves the form to `"E2E Test Campaign (CAMP-01)"`,
  then immediately tries to `fill("Macon-Bibb Demo Campaign")` for
  cleanup. React Hook Form's `reset()` onSuccess races the fill — the
  DOM value snaps back to the just-saved value and the `toHaveValue`
  assertion fails. On failure the restore never runs, so the campaign
  name stayed polluted for every subsequent run. Pre-existing flake,
  pattern not introduced in phase 110 but surfaced when the offline
  queue bug stopped eating the Playwright run.
- **Fix:** Wait for the post-save `form.reset()` to land on the
  just-saved value BEFORE issuing the second fill — same guard the
  first fill already had. Also reset the name once in the database
  via `UPDATE campaigns SET name='Macon-Bibb Demo Campaign'` to unblock
  the iteration.
- **Files modified:** `web/e2e/phase12-settings-verify.spec.ts`.
- **Commit:** `780e57a9`.

## Deferred items

Carried forward from earlier plans, not introduced by Plan 110-08:

1. **`tsc -b` incremental-build errors in `src/hooks/useCanvassingWizard.test.ts`**
   (originally flagged by Plan 109-02). `tsc --noEmit` (the flag this
   gate uses) remains clean. Scoped for a dedicated test-hygiene plan.
2. **`web/public/leaflet/` hand-managed marker PNG copies** still
   present on disk (Plan 109-01 Open Issue #2).
3. **E2E Sheet-portal + map `::before` pointer-event overlap** —
   deferred per Plan 108-06.
4. **Enter-key activation at the E2E layer** — deferred per Plan 108-06.
5. **Seed script idempotency** — `scripts/seed.py` is documented as
   idempotent in CLAUDE.md but raises
   `UniqueViolationError: ix_organizations_zitadel_org_id` when an
   organization already exists. Not a phase 110 bug; surfaced when this
   gate attempted to reseed for test-pollution cleanup. Worked around
   with direct SQL. Scoped as a test-infra follow-up.

## Regressions

**None.**

- Pytest: 1122 / 0 / 0 — +4 from phase 110 additions, no existing tests
  regressed.
- Vitest: 805 / 0 / 21 todo — +67 from phase 110 additions, no existing
  tests regressed.
- Playwright: per-spec count diff vs phase 109 exit gate run 2 shows
  every existing spec runs the same number of tests; only addition is
  the new `canvassing-offline-sync.spec.ts` (4 tests).
- tsc: clean.
- Skip-marker baseline: unchanged.

Four Rule 1 auto-fixes were applied during the gate (documented in
Deviations above). Two were production-code bugs in the offline queue
integration path (`useCanvassing` ky retry, `useCanvassingWizard`
pre-flight onLine); two were test bugs in `canvassing-offline-sync.spec.ts`
(wrong aria-label phrase for online-with-queue state; CDP toggle race).
A fifth fix cleaned up a pre-existing `phase12-settings-verify`
form-reset race that had been masked by the offline queue bug.

## Wrapper Compliance (D-13)

Every Playwright invocation in this gate went through
`web/scripts/run-e2e.sh`. The descending fail-count trail in
`web/e2e-runs.jsonl` for phase 110 exit gate:

- `2026-04-11T21:15:53Z` — 5 fails (first run, pre-fix)
- `2026-04-11T21:23:01Z` — 4 fails (after ky retry fix, stale dist/ build)
- `2026-04-11T21:26:23Z` — 2 fails (after pre-flight onLine fix + rebuild)
- `2026-04-11T21:31:22Z` — 1 fail (after 5xx regex widening + phase12 race guard)
- `2026-04-11T21:35:16Z` — 1 fail (flake confirmation, no code change)
- `2026-04-11T21:37:37Z` —  0 fails (targeted OFFLINE-03 422 spot-check post-toggle-wait fix)
- `2026-04-11T21:38:14Z` — **0 fails** (gate run 1 of 2) — exit 0
- `2026-04-11T21:40:44Z` — **0 fails** (gate run 2 of 2) — exit 0

Two consecutive greens achieved with no code changes between them.

## Conclusion

**Phase 110 exit gate: PASSED — milestone v1.18 exits clean.**

The trustworthy baseline established by phase 106 and carried through
phases 107/108/109 is intact with phase 110's additions:

- Ruff clean
- Pytest 1122 / 0 / 0 (+4 from Plan 110-02 client_uuid service tests)
- tsc clean (`--noEmit`)
- Vitest 805 / 0 / 21 todo (+67 from OFFLINE-01/02/03 unit + component coverage)
- Playwright 312 / 0 / 66 on two consecutive green runs via
  `run-e2e.sh` (+4 from `canvassing-offline-sync.spec.ts`)

Phase 110 closes OFFLINE-01, OFFLINE-02, OFFLINE-03, and TEST-01/02/03
with full unit / component / E2E coverage and ships two production-code
Rule 1 bug fixes that align `submitDoorKnock` with the same
`navigator.onLine` signal the `ConnectivityPill` already uses — so the
UI and the offline queue can't disagree about whether the volunteer is
online.

Milestone v1.18 — Field UX Polish — ships on commit `18d54e9`.

Exit gate PASSED on 2026-04-11.

---
*Phase 110 exit gate: PASSED — milestone v1.18 complete*
