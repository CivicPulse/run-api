---
phase: 110-offline-queue-connectivity-hardening
plan: 04
subsystem: offline-queue
tags: [offline, sync, backoff, dead-letter, resilience, zustand]
requirements: [OFFLINE-03, TEST-01, TEST-02]
dependency_graph:
  requires:
    - 110-02 (client_uuid on payload — retryDeadLetter re-enqueues with original id so server-side partial unique index still dedupes)
    - 110-03 (persist v1 + migrate ladder — v1 → v2 bump extends the same ladder without breaking pre-110-04 rehydrates)
  provides:
    - "classifyError(err) — network/conflict/validation/server/unknown disposition for replay errors"
    - "computeBackoffMs(retryCount) — 1s → 60s cap exponential schedule"
    - "Dead-letter slice (deadLetter[] + moveToDeadLetter / retryDeadLetter / discardDeadLetter)"
    - "Per-item backoff gate via QueueItem.nextAttemptAt + QueueItem.lastError"
    - "30s soft sync budget observable via store.syncStartedAt + isSlow"
    - "lastSyncAt persisted — volunteers see 'Last sync: Xm ago' across reloads"
  affects:
    - "110-05 (ConnectivityPill Sheet — reads deadLetter, isSlow, lastSyncAt; retryDeadLetter / discardDeadLetter are the user-facing actions)"
    - "110-06 / 110-07 (any future drainQueue consumer — error classification is now the single source of truth for retry disposition)"
tech_stack:
  added:
    - "classifyError / computeBackoffMs helpers exported from useSyncEngine"
    - "SYNC_BUDGET_MS = 30_000 constant exported for test + UI reuse"
    - "@testing-library/react renderHook + vi.useFakeTimers pattern for budget-timer assertion"
  patterns:
    - "Dispatch on classified error kind rather than nested isX branches — drainQueue's catch block now has one switch-equivalent, no hidden precedence bugs"
    - "Dead-letter originalId preservation — retryDeadLetter rebuilds a QueueItem with the original id (which IS the client_uuid stamped on the payload) so re-enqueued items still 409 on server dedup, keeping plan 110-02's invariant intact"
    - "Budget timer armed via useEffect dependency on syncStartedAt — zustand subscription drives React re-render, timer auto-clears on endSync()"
key_files:
  created:
    - web/src/hooks/useSyncEngine.backoff.test.ts
    - .planning/phases/110-offline-queue-connectivity-hardening/110-04-SUMMARY.md
  modified:
    - web/src/stores/offlineQueueStore.ts
    - web/src/stores/offlineQueueStore.test.ts
    - web/src/stores/offlineQueueStore.persistence.test.ts
    - web/src/hooks/useSyncEngine.ts
    - web/src/hooks/useSyncEngine.test.ts
decisions:
  - "MAX_RETRY is no longer a removal gate — it stays exported as a deprecation-style constant for backward-compat but drainQueue never reads it. REL-02 invariant rewritten: 4xx moves to dead-letter on the FIRST failure; 5xx/network back off forever until reconnect. Exponential backoff is the new throttle."
  - "Dead-letter items get a NEW UUID (DeadLetterItem.id) distinct from originalId so the Sheet (plan 110-05) can key on stable IDs even after retryDeadLetter round-trips. originalId is preserved so retryDeadLetter rebuilds a QueueItem with the same id used as client_uuid — server-side dedup still fires."
  - "Persist schema bumped v1 → v2 with a no-op migration on items (new fields are all optional); deadLetter initializes to [] and lastSyncAt to null when absent. Existing v1 installs upgrade silently on next load."
  - "partialize now persists items + deadLetter + lastSyncAt; syncStartedAt and isSlow stay in memory (transient per-session state). Volunteers reloading mid-drain see a fresh budget window, not a stale 'slow' flag from the previous tab."
  - "The 30s budget is SOFT — drainQueue keeps processing after the deadline. markSlow() flips an observable flag so the ConnectivityPill can render 'Syncing (slow)' without hard-cancelling the sync. Users on a 3G connection still get their work through."
  - "'All caught up!' toast is now gated on BOTH items.length === 0 AND deadLetter.length === 0 — previously it fired whenever the active queue emptied, even with validation failures sitting in dead-letter. The gate prevents false-positive UX when a 422 moves an item out of the queue."
  - "classifyError returns errorSummary only for the validation kind — callers that need a human-readable string for network/server fall through to the generic 'network' / 'server' label stamped into QueueItem.lastError."
metrics:
  duration: "~40 min"
  completed_date: 2026-04-11
  tasks_completed: 3
  files_created: 2
  files_modified: 5
---

# Phase 110 Plan 04: Exponential Backoff + Dead-Letter + Sync Budget Summary

**One-liner:** Replaced the flat per-tick retry in `drainQueue` with a classified-error strategy — `classifyError(err)` dispatches 409 to silent success, 4xx non-409 to an immediate `moveToDeadLetter` (new persisted slice), and 5xx/network/unknown errors to an exponential `computeBackoffMs` schedule (1s → 2s → 4s → 8s → 16s → 32s → 60s cap) stamped into `QueueItem.nextAttemptAt` — while `useSyncEngine` arms a 30s soft budget that flips `store.isSlow` for the ConnectivityPill, and a successful empty-drain stamps `lastSyncAt` so volunteers see "Last sync: Xm ago" across reloads.

## What shipped

### `web/src/stores/offlineQueueStore.ts`

1. **`DeadLetterItem` type + `deadLetter[]` slice** — distinct new UUID per record, carries `originalId, type, payload, campaignId, resourceId, addedAt, failedAt, errorSummary, errorCode`. Enough context for the ConnectivityPill Sheet (plan 110-05) to render a volunteer-readable row without loading anything else.
2. **`QueueItem.nextAttemptAt?: number`** — ms epoch gate read by `drainQueue`. Optional so pre-110-04 rehydrated items drain on first tick with no schema coupling.
3. **`QueueItem.lastError?: string`** — one of `"network" | "server" | "unknown"` stamped by `setItemBackoff`. The Sheet will surface this as a stall reason.
4. **Store state:** `syncStartedAt: number | null` + `isSlow: boolean` + `lastSyncAt: number | null`.
5. **Actions:**
   - `moveToDeadLetter(itemId, {errorSummary, errorCode})` — removes from `items`, pushes a new `DeadLetterItem` with a fresh UUID + captured `failedAt = Date.now()`. No-op when `itemId` is not found.
   - `retryDeadLetter(deadLetterId)` — removes the dead-letter, rebuilds a `QueueItem` with `id = originalId` (preserving the `client_uuid` that's already stamped on the payload), `retryCount = 0`, `nextAttemptAt = Date.now()` so the next tick picks it up immediately. Keeps plan 110-02's invariant intact.
   - `discardDeadLetter(deadLetterId)` — removes only, no re-push.
   - `startSync()` — sets `isSyncing = true`, `syncStartedAt = Date.now()`, `isSlow = false`.
   - `endSync()` — resets all three to defaults.
   - `markSlow()` — flips `isSlow = true` (called by the 30s budget timer).
   - `recordSyncSuccess()` — stamps `lastSyncAt = Date.now()`.
   - `setItemBackoff(itemId, nextAttemptAt, lastError)` — stamps the gate and atomically increments `retryCount` (so the caller passes the *current* count without pre-incrementing).
6. **Persist config:**
   - `version: 1 → 2` with a v1 → v2 migration that is a no-op on existing items (new fields are all optional) but initializes `deadLetter: []` and `lastSyncAt: null` when absent. The v0 → v1 path from plan 110-03 is preserved unchanged.
   - `partialize` now includes `deadLetter` and `lastSyncAt`; `syncStartedAt` and `isSlow` stay transient.
7. **`clear()`** extended to reset the new slices so test beforeEach resets do not leak dead-letter state between suites.

### `web/src/hooks/useSyncEngine.ts`

1. **`classifyError(err): ClassifiedError`** — canonical entry point. Returns:
   - `{kind: "network", retry: true}` for `TypeError` (fetch failures, offline, DNS, CORS preflight block)
   - `{kind: "conflict", retry: false}` for `err.response.status === 409`
   - `{kind: "validation", retry: false, errorSummary, errorCode: "http_4xx"}` for 4xx non-409 (pulls `message` or `statusText` into `errorSummary`)
   - `{kind: "server", retry: true, errorCode: "http_5xx"}` for 5xx
   - `{kind: "unknown", retry: true}` otherwise
2. **`computeBackoffMs(retryCount): number`** — `1000 * 2^(retryCount - 1)` capped at `60_000`. Returns `0` for `retryCount <= 0` (caller responsibility to short-circuit).
3. **`drainQueue` refactor:**
   - Per-item `if (nextAttemptAt > now) continue` gate at the top of the loop.
   - Replaces `setSyncing(true)` / `setSyncing(false)` with `startSync()` / `endSync()` (in a try/finally — C14 lock release preserved).
   - Catch block dispatches on `classifyError(err).kind`:
     - `conflict` → `remove(item.id)` (silent success)
     - `validation` → `moveToDeadLetter(item.id, {errorSummary, errorCode})` + `toast.error("Sync failed — {label} moved to dead-letter.")`
     - `network | server | unknown` → `setItemBackoff(item.id, Date.now() + computeBackoffMs(retryCount+1), kind)`
   - Post-drain: "All caught up!" toast is now gated on `postState.items.length === 0 && postState.deadLetter.length === 0`. A separate check on empty `items` fires `recordSyncSuccess()` regardless of dead-letter state — the budget metric measures active-queue drain time, not dead-letter count.
4. **`useSyncEngine` hook** — new `useEffect` that subscribes to `syncStartedAt` and arms a `setTimeout(() => store.markSlow(), SYNC_BUDGET_MS)` when it flips non-null. The timer is cleared by the effect cleanup when `syncStartedAt` returns to `null` via `endSync()` OR when the hook unmounts.
5. **`MAX_RETRY` is retained as an exported constant for any external consumer that still references it, but drainQueue no longer reads it. The REL-02 invariant is now "4xx moves to dead-letter on the first failure; 5xx/network back off forever." documented inline in the module.

### `web/src/hooks/useSyncEngine.backoff.test.ts` (new — 18 tests)

| Group | Test | Invariant |
|-------|------|-----------|
| `classifyError` | TypeError → network | Network detection |
| | HTTPError 409 → conflict | Silent success |
| | HTTPError 422 → validation + errorCode + errorSummary | Dead-letter disposition |
| | HTTPError 403 → validation + errorCode http_403 | Auth dead-letter |
| | HTTPError 500 → server, retry=true | Server retry |
| | HTTPError 503 → server + errorCode http_503 | Any 5xx |
| | Plain Error → unknown, retry=true | Fallthrough |
| `computeBackoffMs` | 1→1s, 2→2s, 3→4s, ..., 7→60s, 20→60s cap | Schedule + cap |
| | retryCount 0 → 0 | Short-circuit |
| `backoff gate` | nextAttemptAt > Date.now() → api.post not called | Per-item gate |
| | network error stamps nextAttemptAt = now + 1000 + retryCount 1 | First-failure stamping |
| | 422 → moveToDeadLetter, items empty, deadLetter len 1 | 4xx terminal |
| | 403 → dead-letter with http_403 | Auth terminal |
| | 500 → backoff (NOT dead-letter), lastError="server" | 5xx retry |
| `budget` | startSync/endSync bookend drainQueue | Lifecycle |
| | Fake-timer advance over SYNC_BUDGET_MS → markSlow() flips isSlow | 30s soft budget |
| | Full drain → lastSyncAt stamped | Persisted success metric |
| | "All caught up!" gated on deadLetter === 0 | No false-positive toast |

### `web/src/stores/offlineQueueStore.test.ts` (extended)

11 new tests under the "dead-letter slice (plan 110-04)" describe:
- initial state for new fields, moveToDeadLetter removes + pushes with context, no-op on missing id, retryDeadLetter resets retryCount + preserves client_uuid, discardDeadLetter removes only, setItemBackoff stamps the gate and increments retryCount, startSync/endSync/markSlow manage budget state, recordSyncSuccess stamps lastSyncAt, partialize includes deadLetter + lastSyncAt but NOT syncStartedAt/isSlow, persist version is 2, clear() resets new slices.

### `web/src/stores/offlineQueueStore.persistence.test.ts` (updated)

Existing "persist config exposes version 1" test retargeted to assert `version === 2` (plan 110-04 schema bump). The v0 → v1 migration test is unchanged — the v1 → v2 path is a pass-through so the old assertion still holds for pre-110-03 envelopes.

### `web/src/hooks/useSyncEngine.test.ts` (updated)

The two "MAX_RETRY removal + toast" tests are replaced by "REL-02 dead-letter on validation" tests that exercise 422 → dead-letter + toast and 403 → dead-letter with context. The REL-02 invariant is rewritten in the describe block. All 31 existing sync-engine tests remain green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Persistence test asserted `version === 1` after schema bump**

- **Found during:** Task 1 verification (`vitest run offlineQueueStore.persistence.test.ts` failed 1 of 5)
- **Issue:** Plan 110-03's "persist config exposes version 1" test hard-codes the version. Bumping to v2 per this plan's requirements breaks it.
- **Fix:** Retarget the assertion to `toBe(2)` and update the test description to note the plan 110-04 bump.
- **Files modified:** `web/src/stores/offlineQueueStore.persistence.test.ts`
- **Commit:** `fddd3f33`

**2. [Rule 1 — Bug] Fake-timer test mounted hook BEFORE startSync()**

- **Found during:** Task 2 verification (budget timer test)
- **Issue:** The hook's `useEffect` early-returns when `syncStartedAt` is null. Mounting the hook first and then calling `startSync()` requires a React re-render to pick up the new value; under `vi.useFakeTimers()` that re-render cycle was not landing before `advanceTimersByTime` drained the expected timer — the assertion saw `isSlow === false`.
- **Fix:** Reorder — `startSync()` first, then `renderHook(() => useSyncEngine())`. The effect arms the timer on mount with the already-non-null `syncStartedAt`, and fake-timer advances deterministically fire `markSlow()`.
- **Files modified:** `web/src/hooks/useSyncEngine.backoff.test.ts`
- **Commit:** `6d400f5d`

## Verification

| Suite | Tests | Status |
|-------|-------|--------|
| `offlineQueueStore.test.ts` | 24 | passed |
| `offlineQueueStore.persistence.test.ts` | 5 | passed |
| `useSyncEngine.test.ts` | 31 | passed |
| `useSyncEngine.backoff.test.ts` | 18 | passed |
| `tsc --noEmit` | n/a | clean |
| **Total** | **78** | **passed** |

## Self-Check: PASSED

- FOUND: web/src/hooks/useSyncEngine.backoff.test.ts
- FOUND: .planning/phases/110-offline-queue-connectivity-hardening/110-04-SUMMARY.md
- FOUND commit: `fddd3f33` (Task 1 — dead-letter slice + backoff fields)
- FOUND commit: `6d400f5d` (Task 2 — classifyError + backoff + 30s budget)
