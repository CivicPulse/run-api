---
phase: 110-offline-queue-connectivity-hardening
plan: 03
subsystem: offline-queue
tags: [offline, persist, zustand, quota, migration, rehydrate]
requirements: [OFFLINE-01, TEST-01]
dependency_graph:
  requires:
    - 110-02 (client_uuid stamping on QueueItem.payload — migrate hook preserves this invariant across versions)
  provides:
    - "Versioned persist envelope (v1) with v0→v1 migration safety net"
    - "QuotaExceededError guard on push() (toast + no crash)"
    - "Rehydrate error handler that starts empty rather than crashing on corrupted JSON"
  affects:
    - "110-04 (sync robustness — new QueueItem fields like nextAttemptAt will bump to v2 via the same migrate path)"
    - "110-05 (connectivity pill — reads the store state that is now provably rehydrate-safe)"
tech_stack:
  added:
    - "zustand persist `version` + `migrate` + `onRehydrateStorage` wiring"
    - "Dynamic-imported sonner toast on QuotaExceededError (cold-start graph unchanged)"
  patterns:
    - "v0→v1 migration stamps `client_uuid` from pre-110-02 `item.id` so legacy payloads hit the server-side partial unique index via the existing 409 path"
    - "try/catch around zustand set() catches the synchronous storage.setItem call that persist middleware makes inside the wrapped set"
key_files:
  created:
    - web/src/stores/offlineQueueStore.persistence.test.ts
    - .planning/phases/110-offline-queue-connectivity-hardening/110-03-SUMMARY.md
  modified:
    - web/src/stores/offlineQueueStore.ts
decisions:
  - "Schema version starts at 1 (not 0) so any future shape change can bump to 2 and use the same migrate ladder — matches zustand convention of v0 = 'no version key present'"
  - "Migration stamps client_uuid from the existing QueueItem.id instead of dropping legacy items — pre-110-02 installs keep their pending door-knocks, and the server's 409 path still dedupes any double-replay"
  - "QuotaExceededError is caught but in-memory items are still updated (best effort) — volunteers at least see the item in the pending queue; persistence failure is surfaced via toast so they know to clear synced items"
  - "Detect quota by name (`QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`) AND message regex `/quota/i` — Safari's DOMException name differs from Chrome's and some polyfills throw plain Errors"
  - "Sonner is dynamic-imported inside the catch so the store module's cold-start graph does not pull in the toast runtime; test envs that cannot resolve sonner fall through silently"
  - "Cross-tab BroadcastChannel sync is OUT OF SCOPE for this plan — audit §1 flagged it as an OFFLINE-01 gap but the plan's `must_haves.truths` did not require it. Deferred as an explicit follow-up; see Deferred Items below"
metrics:
  duration: "~35 min"
  completed_date: 2026-04-11
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 110 Plan 03: Persist Schema Hardening Summary

**One-liner:** Added `version: 1` + `migrate` + `onRehydrateStorage` to the zustand persist config and wrapped `push()` in a QuotaExceededError catch that toasts-and-survives, proving all four guarantees (version stamped, v0→v1 migration stamps `client_uuid`, corrupted JSON rehydrates empty, quota exhaustion does not crash) with a new `offlineQueueStore.persistence.test.ts` suite against the real `createJSONStorage(localStorage)` pipeline.

## What shipped

### `web/src/stores/offlineQueueStore.ts`

1. **Persist config `version: 1`** — zustand now stamps the storage envelope with `{ state, version: 1 }`. Any future QueueItem shape change will bump to `version: 2` and extend the migration ladder.
2. **`migrate(persistedState, version)` hook** — when zustand detects a lower version on the stored envelope, the hook walks the items array, drops entries that fail the minimal shape guard (`id: string`, `payload` truthy), and stamps `client_uuid` from `item.id` onto any pre-110-02 door_knock payloads missing it. This preserves the plan 110-02 invariant (`payload.client_uuid === item.id`) so a rehydrated legacy item still hits the server-side 409 dedup path on next drain.
3. **`onRehydrateStorage` error callback** — logs via `console.warn("[offlineQueueStore] rehydrate error", error)` and lets zustand fall through to the store's default empty items array, so corrupted JSON in localStorage can never crash app boot.
4. **QuotaExceededError guard in `push()`** — wraps the `set(...)` call (which is the surface where zustand's persist middleware synchronously calls `storage.setItem` inside its own `api.setState` override, per `node_modules/zustand/esm/middleware.mjs:356–371`). Detection uses three parallel checks: `err.name === "QuotaExceededError"`, `err.name === "NS_ERROR_DOM_QUOTA_REACHED"` (Firefox), and a message regex `/quota/i` (polyfill catch-all). On match: `console.warn` the error, dynamic-import sonner, fire `toast.error("Storage full — clearing synced items may help")`, and swallow the exception. Non-quota errors are re-thrown so real bugs stay loud.

### `web/src/stores/offlineQueueStore.persistence.test.ts` (new — 5 tests)

| Test | Guarantee exercised |
|---|---|
| `persist config exposes version 1` | After a real push, the localStorage envelope has `version: 1` |
| `v0 → v1 migrate stamps client_uuid on legacy door_knock items` | Seeds a v0 envelope with a door_knock payload missing `client_uuid`, calls `persist.rehydrate()`, asserts the rehydrated item has `client_uuid === item.id` |
| `corrupted JSON in localStorage does NOT crash, store rehydrates empty + warns` | Seeds `"{this-is-not-json"`, rehydrates, asserts items = [] and no throw |
| `QuotaExceededError during push() surfaces a toast and does not throw` | Spies `localStorage.setItem` (per-instance, not prototype — jsdom override) to throw a quota error, calls push(), asserts no throw + warn emitted |
| `round-trip: push 3 items → rehydrate → same 3 client_uuids present` | Pushes 3 door_knocks, snapshots the storage envelope, clears in-memory, restores the envelope, rehydrates, asserts all 3 `client_uuid`s match their `item.id`s |

All 5 new tests exercise zustand's real `createJSONStorage(localStorage)` pipeline — no mocked store. Total test file count for the store module: 18 passing (13 existing + 5 new).

## Verification

- `npx vitest run src/stores/offlineQueueStore.persistence.test.ts src/stores/offlineQueueStore.test.ts` → **18 passed** (2 files, ~460 ms)
- `npx tsc --noEmit` → **clean** (0 errors)
- Existing `offlineQueueStore.test.ts` (13 tests including the 110-02 client_uuid + double-enqueue suite) → regression-free

## Critical findings discovered during execution

1. **zustand persist's `setItem` fires synchronously inside the wrapped `set()`.** Reading `node_modules/zustand/esm/middleware.mjs:356–371` confirmed that `api.setState = (state, replace) => { savedSetState(state, replace); return setItem(); }` and the inner `config(...)` wrapper both call `setItem()` immediately after `set(...args)`. `setItem()` itself is a direct synchronous call to `storage.setItem(...)` (no toThenable wrapping). This means a `try/catch` around our own `set(...)` call inside `push()` reliably catches a `QuotaExceededError` thrown from `localStorage.setItem` — a structure that would NOT work for async storage backends. If 110-04 or later swaps to an async storage (IndexedDB), the catch will need to become `.catch()` on the returned thenable.

2. **`vi.spyOn(Storage.prototype, "setItem")` misses jsdom's per-instance `localStorage.setItem`.** First pass of the quota test stubbed the prototype and observed zero warn calls; switching to `vi.spyOn(localStorage, "setItem")` fixed it. Root cause: jsdom defines `setItem` as an own property on the `localStorage` instance, not as a Storage.prototype method, so prototype spies are not reached. Documented inline for future contributors.

3. **`vi.restoreAllMocks()` in `beforeEach` does NOT restore the per-instance `localStorage.setItem` spy.** First pass put `vi.restoreAllMocks()` AFTER `useOfflineQueueStore.getState().clear()` in `beforeEach`, which meant the next test's `clear()` call (which triggers a persist write) hit the previous test's stub and threw the fake QuotaExceededError out of a different test body. Fix: add an explicit `setItemSpy.mockRestore()` at the end of the quota test, plus move `vi.restoreAllMocks()` to the TOP of `beforeEach`. Belt-and-suspenders because jsdom's non-configurable `localStorage` makes vitest's auto-restore flaky across major versions.

4. **Cross-tab `storage` event listener + BroadcastChannel sync is deferred.** The 110-OFFLINE-AUDIT §1 table flagged "Cross-tab sync" as an OFFLINE-01 gap, but plan 110-03's `must_haves.truths` only required reload safety + quota handling + corruption resilience. Adding a BroadcastChannel would expand scope beyond the tested guarantees and interact non-trivially with the 110-04 sync engine (two tabs racing to drain the same items). Explicitly deferred; see "Deferred Items" below.

## Deviations from plan

- **Plan task wording vs. reality:** The plan's Task 1 action sketch showed the catch swallowing ALL `set()` errors and returning a generic warn. Applied **Rule 2 (missing critical correctness)** to narrow the catch to quota-only errors and re-throw everything else — otherwise a genuine bug (e.g., `items` accidentally becoming non-iterable) would be silently eaten. The `must_haves` truth 3 ("storage quota exceeded surfaces a toast.error") is still met.
- **Test file uses `localStorage.setItem` spy, not `Storage.prototype`:** plan sketch didn't specify; picked the one that actually works against jsdom (see finding #2). No user decision needed.
- **No BroadcastChannel:** see finding #4. The plan header phrase "cross-tab BroadcastChannel sync (if plan specifies)" in the parent orchestrator prompt resolves to "not required" — neither the plan's `must_haves` nor its task list include it.

## Auto-fixed issues

None. The plan executed cleanly against the real file state; the only iteration was test plumbing (spy target + restore ordering), not production code corrections.

## Deferred Items

| Item | Reason | Proposed home |
|---|---|---|
| Cross-tab `storage` event / BroadcastChannel sync | Out of scope per 110-03 `must_haves`; interacts with 110-04 drain engine design | Log as OFFLINE-01 stretch in phase 110 exit gate (110-06 audit) — decide then whether to ship in 110-04 or defer to v1.19 |
| Dead-letter slice + `lastSyncAt` in store | Explicitly owned by plan 110-04 per audit §8 | 110-04 |

## Known Stubs

None. All paths wired to real behavior: `migrate` actually mutates legacy items, `onRehydrateStorage` actually logs, `push()` actually catches and toasts.

## Threat Flags

None new. The 110-OFFLINE-AUDIT §2 threat model for the persist layer is unchanged:

- Schema migration runs entirely client-side on data the user already possessed; no trust boundary is crossed.
- QuotaExceededError is a local DoS surface, not a security vulnerability — the guard degrades gracefully (in-memory items survive) and the server-side partial unique index continues to reject any replay that does reach it.
- Corrupted localStorage JSON could theoretically be attacker-planted in a shared-device scenario, but the `onRehydrateStorage` path starts with an empty items array — there is no code path where malformed JSON reaches a privileged operation.

## Commits

- `43865185` feat(110-03): persist schema version + quota + rehydrate guards (OFFLINE-01)
- `<pending>` docs(110-03): complete persist schema hardening plan (this SUMMARY)

## Self-Check: PASSED

- FOUND: `web/src/stores/offlineQueueStore.ts` (modified — version/migrate/onRehydrateStorage/quota guard)
- FOUND: `web/src/stores/offlineQueueStore.persistence.test.ts` (5 new tests, all green)
- FOUND commit `43865185` (`git log --oneline -5` confirms)
- VERIFIED: `npx vitest run` → 18 passed (13 existing + 5 new)
- VERIFIED: `npx tsc --noEmit` → clean
- VERIFIED: `push()` quota catch covered by test 4; re-throws non-quota errors (code inspection)
- VERIFIED: migrate hook only runs on `version < 1`; v1+ envelopes pass through untouched (code inspection + test 1)
