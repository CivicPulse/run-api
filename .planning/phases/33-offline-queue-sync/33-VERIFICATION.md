---
phase: 33-offline-queue-sync
verified: 2026-03-16T16:33:30Z
status: passed
score: 19/19 must-haves verified
re_verification: false
---

# Phase 33: Offline Queue & Sync Verification Report

**Phase Goal:** Offline queue and sync — queue mutations when offline and replay on reconnect
**Verified:** 2026-03-16T16:33:30Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Offline queue store persists items to localStorage across page reloads | VERIFIED | `createJSONStorage(() => localStorage)` in `offlineQueueStore.ts:65`; `partialize: (state) => ({ items: state.items })` at line 66; localStorage persistence test passes |
| 2 | Queue items include type discriminator (door_knock \| call_record), payload, timestamp, retryCount | VERIFIED | `QueueItem` interface at lines 6-14 of `offlineQueueStore.ts` with all required fields |
| 3 | useConnectivityStatus returns boolean online status reactively via useSyncExternalStore | VERIFIED | `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` at `useConnectivityStatus.ts:21`; 4 tests pass |
| 4 | OfflineBanner renders null when online and queue is empty | VERIFIED | Guard at `OfflineBanner.tsx:12-14`; test passes |
| 5 | OfflineBanner shows 'Offline' text with WifiOff icon when offline with empty queue | VERIFIED | State 2 render branch at lines 33-57; test passes |
| 6 | OfflineBanner shows 'Offline . N outcomes saved' with count when offline with items | VERIFIED | Count branch at lines 47-55 with `&middot;` separator; test passes |
| 7 | OfflineBanner shows 'Syncing N outcomes...' with Loader2 spinner when syncing | VERIFIED | State 3 render branch at lines 17-31; `animate-spin` class applied; test passes |
| 8 | OfflineBanner has role=status and aria-live=polite for screen reader announcements | VERIFIED | Both attributes on all banner render branches; 2 dedicated tests pass |
| 9 | Failed door-knock mutations push to offline queue instead of reverting optimistic UI | VERIFIED | `useCanvassingWizard.ts:106-122` — `err instanceof TypeError` check pushes to queue; does not call `revertOutcome` on network error |
| 10 | Failed phone-banking mutations push to offline queue instead of losing data | VERIFIED | `useCallingSession.ts:217-229` — `err instanceof TypeError` pushes `call_record` to queue |
| 11 | Queue drains automatically on online event in FIFO order | VERIFIED | `useSyncEngine.ts:167-175` — `useEffect` on `isOnline` with 1000ms debounce; FIFO via `[...items]` snapshot loop; test passes |
| 12 | Queue drains on 30-second interval as safety net | VERIFIED | `setInterval(() => drainRef.current?.(), 30_000)` at `useSyncEngine.ts:181-184`; test coverage present |
| 13 | Items retried up to 3 times on network error then skipped | VERIFIED | `retryCount >= 2` check at `useSyncEngine.ts:76` (0-indexed: 0, 1, 2 = 3 attempts); `incrementRetry + continue` skips; test passes |
| 14 | 409 Conflict responses cause silent discard of the item | VERIFIED | `isConflict(err)` branch at `useSyncEngine.ts:73-75` calls `remove` and `continue`; test passes |
| 15 | After sync completes, enriched entries and session queries are invalidated | VERIFIED | `invalidateQueries` for `walk-list-entries-enriched` and `phone-bank-sessions` at lines 94-114; both invalidation tests pass |
| 16 | OfflineBanner is visible in the field layout between FieldHeader and content | VERIFIED | `<OfflineBanner />` at `$campaignId.tsx:40`, positioned after `<FieldHeader>` and before `<main>` |
| 17 | Toast 'All caught up!' fires when sync drains queue to empty | VERIFIED | `toast.success("All caught up!")` at `useSyncEngine.ts:121`; test passes |
| 18 | If current canvassing entry was completed by another volunteer during offline period, auto-skip to next pending entry with toast | VERIFIED | Auto-skip logic at `useSyncEngine.ts:126-151`; `syncedEntryIds` distinguishes own vs others; both positive and negative auto-skip tests pass |
| 19 | useSyncEngine runs at field layout level covering all field screens | VERIFIED | `useSyncEngine()` called inside `FieldLayout` at `$campaignId.tsx:13` |

**Score:** 19/19 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/stores/offlineQueueStore.ts` | Zustand persist store with localStorage for offline queue | VERIFIED | 69 lines; exports `useOfflineQueueStore` and `QueueItem`; full push/remove/incrementRetry/setSyncing/clear implementation |
| `web/src/hooks/useConnectivityStatus.ts` | Reactive online/offline detection hook | VERIFIED | 22 lines; `useSyncExternalStore` with `online`/`offline` window events; exports `useConnectivityStatus` |
| `web/src/components/field/OfflineBanner.tsx` | Slim banner component for offline/syncing state | VERIFIED | 58 lines; 5-state rendering; full ARIA attributes |
| `web/src/hooks/useSyncEngine.ts` | Queue drain logic with retry, discard, post-sync invalidation, auto-skip on conflict | VERIFIED | 187 lines; exports `useSyncEngine`, `drainQueue`, `replayMutation`, `isNetworkError`, `isConflict` |
| `web/src/hooks/useCanvassingWizard.ts` | Modified handleOutcome with offline queue fallback on network error | VERIFIED | Contains `useOfflineQueueStore`; `instanceof TypeError` check in both `handleOutcome` and `handleBulkNotHome` |
| `web/src/hooks/useCallingSession.ts` | Modified handleOutcome with offline queue fallback on network error | VERIFIED | Contains `useOfflineQueueStore`; `instanceof TypeError` check pushes `call_record` |
| `web/src/routes/field/$campaignId.tsx` | Field layout with OfflineBanner and useSyncEngine wired in | VERIFIED | Imports both; `useSyncEngine()` called; `<OfflineBanner />` between FieldHeader and main |
| `web/e2e/phase33-offline-sync.spec.ts` | Playwright e2e smoke test for offline banner and queue behavior | VERIFIED | 3 test cases: banner on offline, banner disappears on reconnect, count display from localStorage |
| `web/src/stores/offlineQueueStore.test.ts` | 10 store operation tests | VERIFIED | 10 tests, all passing |
| `web/src/hooks/useConnectivityStatus.test.ts` | 4 connectivity hook tests | VERIFIED | 4 tests, all passing |
| `web/src/components/field/OfflineBanner.test.tsx` | 15 banner render state tests | VERIFIED | 15 tests, all passing (actually 15 tests per vitest output) |
| `web/src/hooks/useSyncEngine.test.ts` | 21 sync engine unit tests | VERIFIED | 21 tests, all passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `offlineQueueStore.ts` | `localStorage` | `createJSONStorage(() => localStorage)` | WIRED | Line 65; `partialize` at line 66 excludes `isSyncing` |
| `useConnectivityStatus.ts` | `navigator.onLine` | `useSyncExternalStore` with online/offline window events | WIRED | Lines 2, 13, 21; subscribe fn at lines 3-10 |
| `OfflineBanner.tsx` | `offlineQueueStore.ts` | reads `items.length` and `isSyncing` from store | WIRED | `useOfflineQueueStore((s) => s.items)` at line 7; `s.isSyncing` at line 8 |
| `useCanvassingWizard.ts` | `offlineQueueStore.ts` | `onError` callback pushes `door_knock` on network error | WIRED | `useOfflineQueueStore.getState().push({ type: "door_knock" ... })` at lines 109-114; also in `handleBulkNotHome` at lines 199-204 |
| `useCallingSession.ts` | `offlineQueueStore.ts` | `onError` callback pushes `call_record` on network error | WIRED | `useOfflineQueueStore.getState().push({ type: "call_record" ... })` at lines 219-224 |
| `useSyncEngine.ts` | `offlineQueueStore.ts` | reads items, calls remove/incrementRetry/setSyncing during drain | WIRED | `useOfflineQueueStore.getState()` calls at lines 44, 47, 61, 74, 77, 80, 86, 120 |
| `useSyncEngine.ts` | `@tanstack/react-query` | `invalidateQueries` after drain completes | WIRED | `queryClient.invalidateQueries(...)` at lines 95-113 |
| `useSyncEngine.ts` | `canvassingStore.ts` | reads `currentAddressIndex` and calls `advanceAddress` for auto-skip | WIRED | `useCanvassingStore.getState()` at lines 129-130; `advanceAddress()` at line 148 |
| `$campaignId.tsx` | `OfflineBanner.tsx` | renders `<OfflineBanner />` between FieldHeader and main | WIRED | Line 40 in `$campaignId.tsx`; `useSyncEngine()` called at line 13 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SYNC-01 | 33-01, 33-02 | Volunteer can record door-knock outcomes while offline; they queue locally | SATISFIED | `useCanvassingWizard.ts` pushes `door_knock` to queue on `TypeError`; `offlineQueueStore.ts` persists to localStorage |
| SYNC-02 | 33-02 | Queued interactions automatically sync when connectivity resumes | SATISFIED | `useSyncEngine.ts` drains queue on `isOnline` transition (1s debounce) and 30s interval |
| SYNC-03 | 33-01 | Volunteer sees a visible offline indicator when connectivity is lost | SATISFIED | `OfflineBanner.tsx` renders when offline; wired into field layout at `$campaignId.tsx:40` |
| SYNC-04 | 33-02 | Volunteer receives updated walk list status (houses contacted by others) when connectivity resumes | SATISFIED | Post-sync `invalidateQueries` for `walk-list-entries-enriched` plus auto-skip logic for conflict entries |
| SYNC-05 | 33-01, 33-02 | Volunteer can record phone banking outcomes while offline; they queue locally | SATISFIED | `useCallingSession.ts` pushes `call_record` to queue on `TypeError`; replayed via `replayMutation` |

All 5 requirements (SYNC-01 through SYNC-05) accounted for across the two plans. No orphaned requirements for Phase 33 found in REQUIREMENTS.md.

### Anti-Patterns Found

No blockers or warnings found. Scanned all 7 production files modified in this phase. No TODO, FIXME, placeholder, or empty implementation patterns detected.

One minor observation: `useCallingSession.ts:241` — the `handleOutcome` `useCallback` dependency array omits `campaignId` and `sessionId`. These are stable function parameters (the hook re-mounts when they change), so this does not cause incorrect behavior. It is an exhaustive-deps lint advisory only, not a functional defect.

### Human Verification Required

The following items cannot be verified programmatically:

**1. Offline banner visual appearance**

**Test:** Open a field canvassing screen, disable network in Chrome DevTools, wait for offline event
**Expected:** Slim banner appears between the header and main content with WifiOff icon and "Offline" text; does not obscure content
**Why human:** CSS rendering and layout fidelity cannot be verified via grep or unit tests

**2. Sync toast appearance on reconnect**

**Test:** Place items in offline queue (via localStorage), then re-enable network
**Expected:** "Syncing N outcomes..." banner appears briefly, then disappears and "All caught up!" toast fires
**Why human:** Toast animation timing and visual sequence require live rendering

**3. Auto-skip behavior in live canvassing flow**

**Test:** Have two volunteers on the same walk list; volunteer A goes offline, volunteer B records an outcome for the same door, volunteer A reconnects
**Expected:** Volunteer A sees a toast "This door was visited — moving to next" and automatically advances past that door
**Why human:** Requires two simultaneous actors and live backend state

**4. 30-second interval drain in practice**

**Test:** Go offline, record outcomes, reconnect, wait without interacting
**Expected:** Sync begins within 30 seconds without user action
**Why human:** Timing behavior and real network round-trips require a live environment

## Summary

Phase 33 fully achieves its goal. All foundational building blocks (queue store, connectivity hook, offline banner) are substantive implementations — not stubs. The sync engine correctly wires into both canvassing and phone-banking mutation flows via call-site `onError` overrides. Post-sync query invalidation and auto-skip on conflict are implemented and unit-tested. The field layout shell mounts `useSyncEngine` at the correct level to cover all field screens.

Test coverage is strong: 50 unit tests across 4 files (all passing), plus 3 Playwright e2e tests. The full vitest suite of 427 tests passes with no regressions introduced by this phase.

All 5 requirements (SYNC-01 through SYNC-05) are fully satisfied. All 4 commits documented in the summaries exist in git log.

---

_Verified: 2026-03-16T16:33:30Z_
_Verifier: Claude (gsd-verifier)_
