---
phase: 110-offline-queue-connectivity-hardening
plan: 07
subsystem: offline-queue
tags: [e2e, playwright, offline-01, offline-02, offline-03, test-03, wave-5]
requirements: [OFFLINE-01, OFFLINE-02, OFFLINE-03, TEST-03]
dependency_graph:
  requires:
    - 110-02 (client_uuid on payload — asserted directly in Test 1)
    - 110-03 (persist schema — queue probing via localStorage 'offline-queue' envelope)
    - 110-04 (classifyError + setItemBackoff + moveToDeadLetter + recordSyncSuccess)
    - 110-05 (ConnectivityPill data-tour + aria-label ladder + ConnectivitySheet Retry/Discard)
  provides:
    - "Phase 110 E2E coverage file canvassing-offline-sync.spec.ts (4 tests)"
    - "TEST-03 obligation satisfied for OFFLINE-01 / OFFLINE-02 / OFFLINE-03"
    - "Playwright regression guard for the full offline → queue → pill → sync → dead-letter journey"
  affects:
    - .planning/phases/110-offline-queue-connectivity-hardening/110-08-PLAN.md
tech_stack:
  added: []
  patterns:
    - "phase 107/108 route-level mock fixture cloned verbatim (field/me + walk-lists + door-knocks + survey + PATCH)"
    - "Mutable handler pattern (`handler.mode = 'fail' | 'pass'`) for mid-test 5xx/422 → 200 flipping without page.unroute churn"
    - "page.evaluate(localStorage.getItem('offline-queue')) for authoritative queue probing — zustand partialize makes the persisted snapshot the single source of truth"
    - "context.setOffline(true/false) as the offline gate — dispatches the same offline/online window events useConnectivityStatus subscribes to"
key_files:
  created:
    - web/e2e/canvassing-offline-sync.spec.ts
  modified: []
decisions:
  - "One 4-test spec covering OFFLINE-01/02/03 in sequence rather than three separate specs — the flows share ~150 lines of mock fixture and the handoff from queue → pill → sync is tightly coupled, so in-sequence tests are higher signal than isolated ones (plan 110-07 objective)."
  - "CAMPAIGN_ID / WALK_LIST_ID / SCRIPT_ID suffixed `-110` so parallel runs with canvassing-wizard (107) and canvassing-house-selection (108) cannot collide on mock routing."
  - "Queue probing via `localStorage.getItem('offline-queue')` rather than attempting to expose the zustand store handle on `window` — the persistence envelope is synchronously updated on every `set()` via `partialize`, so it is the canonical observability surface for E2E."
  - "OFFLINE-03 5xx test queues the item offline FIRST, then reconnects to trigger the drain — the online-path `submitDoorKnock` catch block only enqueues on TypeError (offline), so a 5xx at the online path never reaches the queue. Queueing offline is the only way to get a QueueItem the drainQueue will POST → 503 against."
  - "Handler-mode flag (`{ mode: 'fail' | 'pass' }`) avoids Playwright's `page.unroute` + `page.route` reinstall ordering hazards in Tests 3 & 4. The handler closure mutates in-place between phases; simpler and more deterministic than tear-down/rebuild."
  - "ConnectivityPill located via `[data-tour='connectivity-pill']` (a stable pre-existing attribute) rather than role=button+name, because several tests need to assert against the derived aria-label itself. The structural locator + aria-label readback is stricter than a role+name match."
  - "Dead-letter overlay located via `[data-testid='dead-letter-overlay']` (added in plan 110-05 for unit tests) rather than text — the overlay is aria-hidden so a role-based locator would not match."
  - "Tests run only through `web/scripts/run-e2e.sh` per phase 106 D-13 + CLAUDE.md. The spec file contains zero `npx playwright test` invocations; the shell wrapper is the single entry point for the docker-backed exit gate (plan 110-08) to run against."
metrics:
  duration: "~20 min"
  completed_date: 2026-04-11
  tasks_completed: 2
  files_created: 1
  files_modified: 0
  lines_added: 733
  tests_added: 4
---

# Phase 110 Plan 07: OFFLINE-01/02/03 E2E Coverage Summary

Ships `web/e2e/canvassing-offline-sync.spec.ts`, a 4-test Playwright
suite that drives a volunteer through the full offline → queue →
reconnect → replay journey and asserts the OFFLINE-01 exactly-once
delivery contract, the OFFLINE-02 pill state ladder, the OFFLINE-03
5xx exponential backoff recovery path, and the OFFLINE-03 422
dead-letter Retry flow end-to-end. Satisfies the TEST-03 obligation
for every requirement phase 110 shipped without touching plan 110-06's
component tests or coverage audit.

## Test Inventory

| # | Test name | Covers | Assertion highlight |
|---|-----------|--------|---------------------|
| 1 | `OFFLINE-01: 3 outcomes recorded offline replay as 3 distinct POSTs on reconnect` | OFFLINE-01 (plan 110-02 client_uuid + plan 110-04 drainQueue replay) | `seenPostCount.n === 3` AND `new Set(seenClientUuids).size === 3` AND `readOfflineQueue().items === []` after reconnect |
| 2 | `OFFLINE-02: ConnectivityPill walks Online → Offline → pending → Syncing → Synced` | OFFLINE-02 (plan 110-05 deriveView ladder) | Pill `aria-label` transitions through `Online`, `^Offline$`, `Offline, 1 pending`, `All synced` — plus `lastSyncAt !== null` after drain |
| 3 | `OFFLINE-03 (5xx): server error stamps backoff, recovery on retry lands 200` | OFFLINE-03 server-error REL-02 (plan 110-04 classifyError + setItemBackoff) | After 503: `items.length === 1` AND `deadLetter.length === 0` (backoff, not dead-letter). After handler flip + re-drain: `items === []`, `handler.calls >= 2` |
| 4 | `OFFLINE-03 (422): validation error dead-letters, Sheet Retry recovers` | OFFLINE-03 validation REL-02 (plan 110-04 moveToDeadLetter + plan 110-05 Sheet Retry) | After 422: `deadLetter.length === 1`, `dead-letter-overlay` visible. After Sheet Retry with handler flipped: `{ items: [], deadLetter: [] }` and overlay removed |

## Fixture Strategy

Cloned verbatim from the phase 107 / 108 route-mock fixture: 5 walk list
entries (3 voters at House A + 1 each at B / C) with the Plan 108-01
Wave 0 coordinates so the Door counter reads `Door X of 3`. Mocks
installed: `field/me`, `walk-lists/{id}/entries/enriched**`,
`walk-lists/{id}`, `surveys/{script}`, the entries PATCH (skip), and a
per-test door-knock POST handler that each test supplies directly so it
can track call counts, capture `client_uuid` values, and flip between
200/422/503 responses mid-test.

CAMPAIGN_ID / WALK_LIST_ID / SCRIPT_ID are suffixed `-110` so parallel
Playwright workers running the 107 / 108 / 110 specs at the same time
cannot collide on mock routing.

## Locator Strategy

- **ConnectivityPill** — `page.locator('[data-tour="connectivity-pill"]')`.
  The `data-tour` attribute already exists on the pill (plan 110-05) for
  the onboarding tour system. Using a structural locator + an
  `aria-label` readback is stricter than a role+name match because the
  label encodes the derivedView state and is the load-bearing OFFLINE-02
  contract.
- **Dead-letter overlay** — `[data-testid="dead-letter-overlay"]`. The
  overlay span is `aria-hidden="true"` so role-based locators would not
  match; the test-id was added in plan 110-05 explicitly for test reach.
- **Retry / Discard buttons** — `getByRole("button", { name: /^Retry / })`
  / `/^Discard /`. `ConnectivitySheet.DeadLetterCard` sets
  `aria-label={`Retry ${label}`}` and `aria-label={`Discard ${label}`}`
  (plan 110-05), so the action-verb prefix is enough to disambiguate.
- **Record buttons** — `getByRole("button", { name: /Record Not Home for ${voterName}/i })`
  matches the OutcomeGrid aria-label pattern used by phase 107/108 specs.

## Queue Probing

Queue observability goes through `page.evaluate(localStorage.getItem('offline-queue'))`.
The zustand persist envelope is synchronously updated on every `set()`
(partialize writes `items`, `deadLetter`, `lastSyncAt`), so reading the
persisted JSON is authoritative and avoids the complexity of exposing
the zustand store handle on `window`. Two helpers wrap this:

- `readOfflineQueue(page)` — returns `{ items, deadLetter }` for
  length / content assertions and `toMatchObject` comparisons.
- `readLiveQueue(page)` — same, plus `lastSyncAt` for the OFFLINE-02
  test's "successful drain stamps lastSyncAt" assertion.

## Handler-Mode Pattern

Tests 3 and 4 both need a mid-test transition from "server errors" to
"server recovers". Playwright's `page.unroute` + `page.route` reinstall
is brittle across ordering edge cases (especially when another handler
in a different fulfill branch is still active). The cleaner pattern:

```ts
const handler = { mode: "fail" as "fail" | "pass", calls: 0 }
await page.route(DOOR_KNOCK_URL_GLOB, async (route) => {
  handler.calls += 1
  if (handler.mode === "fail") {
    await route.fulfill({ status: 503, ... })
    return
  }
  await route.fulfill({ status: 200, ... })
})
// ... later ...
handler.mode = "pass"
```

The handler closure captures the mutable object; flipping `handler.mode`
between phases is a single assignment with no route-system interaction.
Both Test 3 (503 → 200) and Test 4 (422 → 200) use this pattern. Also
lets us assert `handler.calls >= 2` to prove the recovery path actually
landed a second call.

## Critical Design Note: Offline-first Queue Seeding

The OFFLINE-03 5xx test had one load-bearing design constraint: the
online-path `submitDoorKnock` (`useCanvassingWizard.ts:325-336`) only
falls through to `queueDoorKnockOffline` when `err instanceof TypeError`
— i.e., a fetch failure from an actual offline condition. A 5xx error
from the server is caught by the same try/catch and routed to the
retry-toast branch; it never enqueues. So a test that does "record a
door knock while online with the server returning 503" would surface
the retry toast but leave the queue empty — no QueueItem for drainQueue
to re-POST, no backoff to observe.

The working recipe: **queue offline first, then reconnect**. The test
goes offline, records the outcome (TypeError → enqueue), flips online
(drain triggered after the 1s debounce in useSyncEngine), at which
point drainQueue POSTs against the 503 handler → setItemBackoff stamps
`nextAttemptAt` → the item stays in `items` (not dead-letter) → the
pill still reads "1 pending" → the handler flips to pass → a second
drain trigger (offline/online toggle, to avoid waiting the 30s periodic
interval) lands a 200 → queue drains → pill flips to "All synced".

This is documented in the test's inline comments and the decision-log
frontmatter so future plan authors don't rediscover it the hard way.

## Deviations from Plan

Plan 110-07 is two tasks: (1) write the spec, (2) commit. Both tasks
executed exactly as written with one minor collapse:

**[Task consolidation]** Task 1 verification's `<automated>` gate is
`cd web && ./scripts/run-e2e.sh canvassing-offline-sync.spec.ts`. The
plan frontmatter explicitly notes: *"110-08 exit gate will actually run
them against docker stack — you don't need to green them in the
worktree"*. Per that guidance, the verification gate for this plan is
shifted to `tsc --noEmit` (clean) + `npx playwright test --list`
(4 tests discovered). The plan-prescribed `run-e2e.sh` invocation
requires a running docker compose dev server that the worktree does not
have, and the 108-06 summary documented the same worktree constraint.
Not a deviation so much as the plan's own exit-gate handoff to 110-08.

**[Task commit collapse]** Task 2 ("Commit") folded into Task 1's commit
rather than creating a separate empty commit — Task 2's `<action>`
block is literally the git commit that already lands the spec file.
The plan phrasing "Commit each task atomically" is respected: one
atomic commit lands one atomic deliverable (the spec file).

No Rule 1 / Rule 2 / Rule 3 fixes were needed during execution.

## Verification Results

| Check | Command | Result |
|---|---|---|
| Spec file created | `test -f web/e2e/canvassing-offline-sync.spec.ts` | PASS (733 lines) |
| TypeScript clean | `cd web && npx tsc --noEmit` | PASS (0 errors) |
| Playwright discovers 4 tests | `cd web && npx playwright test canvassing-offline-sync.spec.ts --list` | PASS (4 tests in 1 file) |
| No bare `npx playwright test` in spec | `grep -c 'npx playwright test' web/e2e/canvassing-offline-sync.spec.ts` | PASS (0 matches) |
| Spec references all three requirements | `grep -c 'OFFLINE-0[123]' web/e2e/canvassing-offline-sync.spec.ts` | PASS (7+ matches) |
| Docker-backed green run | `./scripts/run-e2e.sh canvassing-offline-sync.spec.ts` | DEFERRED to 110-08 per plan frontmatter |

## Success Criteria

- [x] 4 E2E tests in `canvassing-offline-sync.spec.ts`
- [x] Spec compiles cleanly (`tsc --noEmit`)
- [x] Playwright discovers all 4 tests (`--list`)
- [x] Spec runs via `run-e2e.sh` wrapper (zero bare CLI invocations) — D-13 compliance
- [x] Spec covers all three OFFLINE requirements (OFFLINE-01 / OFFLINE-02 / OFFLINE-03)
- [x] No touch on 110-06 files (coverage audit, component tests) — parallel wave 5 respected
- [ ] Tests green against running docker stack — deferred to 110-08 exit gate per plan guidance

## Known Stubs

None. The spec is fully wired — every test mounts the complete mock
fixture, exercises real component state transitions, and asserts
against real DOM + persisted zustand state. No `test.skip`, no
placeholder assertions, no commented-out branches.

## Threat Flags

None. This plan adds one test file that mocks all network routes and
asserts against DOM + localStorage state. No new network endpoints, no
auth surface, no schema changes, no file I/O beyond the existing
`screenshots/` gitignored directory (not used by this spec). The mock
fixture uses synthetic IDs (`test-campaign-110`, `wl-110`, `script-110`)
that cannot collide with production or seed data.

## Files Touched

- `web/e2e/canvassing-offline-sync.spec.ts` (NEW, 733 lines, 4 tests)

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 + 2 | `test(110-07): E2E canvassing-offline-sync spec (OFFLINE-01/02/03)` | `7b3e6535` |
| docs | `docs(110-07): plan summary` | _(pending — this SUMMARY commit)_ |

## Self-Check: PASSED

- FOUND: `web/e2e/canvassing-offline-sync.spec.ts` (733 lines)
- FOUND: commit `7b3e6535` in `git log --oneline` with message `test(110-07): E2E canvassing-offline-sync spec (OFFLINE-01/02/03)`
- VERIFIED: `cd web && npx tsc --noEmit` → 0 errors
- VERIFIED: `cd web && npx playwright test canvassing-offline-sync.spec.ts --list` → 4 tests in 1 file
- VERIFIED: No `npx playwright test` invocations inside the spec file
- VERIFIED: 7+ references to `OFFLINE-0[123]` in the spec (covers all three requirements)
- VERIFIED: Base matches expected `fd7485e9` + 1 new commit for 110-07 (plus 110-06's 4208b980 landing in parallel wave 5)
