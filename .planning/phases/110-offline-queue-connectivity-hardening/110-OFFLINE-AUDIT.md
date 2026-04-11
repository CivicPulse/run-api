---
plan_id: 110-01
phase: 110-offline-queue-connectivity-hardening
doc: 110-OFFLINE-AUDIT
created: 2026-04-11
purpose: >-
  Ground-truth baseline of the existing offline queue + connectivity status +
  offline banner stack. Every gap is tagged to OFFLINE-01/02/03 so plans
  110-02..110-05 can scope their tasks directly from §6 and §8.
requirements: [OFFLINE-01, OFFLINE-02, OFFLINE-03]
---

# Phase 110: Offline Infrastructure Audit

**Purpose:** Catalogue exactly what the existing offline stack does so plans
110-02 (idempotency), 110-03 (persistence), 110-04 (sync robustness), and
110-05 (indicator UI) can scope their tasks precisely — without duplicating
work already shipped (phase 75 C14/C15 lock + MAX_RETRY invariants) and
without missing load-bearing nuances.

**Audit method:** direct file reads + `rg` greps over `web/src/` and `app/`.
File:line citations are real (not placeholders). Grep outputs inlined in §2.

**Sources audited:**
- `web/src/hooks/useSyncEngine.ts` (222 lines)
- `web/src/hooks/useConnectivityStatus.ts` (22 lines)
- `web/src/stores/offlineQueueStore.ts` (76 lines)
- `web/src/components/field/OfflineBanner.tsx` (58 lines)
- `web/src/hooks/useCanvassingWizard.ts` (enqueue call site)
- `web/src/hooks/useCallingSession.ts` (call-record submission path)
- `web/src/routes/field/$campaignId.tsx` (shell integration)
- `web/src/types/walk-list.ts` (`DoorKnockCreate` TS shape)
- `app/api/v1/walk_lists.py` (POST /door-knocks route)
- `app/services/canvass.py` (`record_door_knock` service impl)
- `app/schemas/canvass.py` (`DoorKnockCreate` Pydantic schema)

---

## §1. Queue Persistence Inventory

| Concern | Current behavior | File:line | Status |
|---|---|---|---|
| Storage backend | localStorage via zustand `persist` middleware | `web/src/stores/offlineQueueStore.ts:69-74` | Survives reload — OK |
| Storage key | Hardcoded `"offline-queue"` — no version/namespace | `offlineQueueStore.ts:70` | GAP — schema versioning (OFFLINE-01) |
| Partialize scope | Only `items`, not `isSyncing` | `offlineQueueStore.ts:72` | OK — syncing lock is ephemeral |
| Schema versioning | No `version` key in persist config and no `migrate` fn | `offlineQueueStore.ts:69-74` | GAP — future-safe migration path (OFFLINE-01) |
| Cross-tab sync | None — each tab has its own in-memory copy; changes in tab A only reach tab B via reload | — | GAP — `storage` event listener or broadcast channel needed (OFFLINE-01) |
| Storage quota handling | No handler for `QuotaExceededError`; push just silently fails on full localStorage | `offlineQueueStore.ts:38-49` | GAP — low-end device risk (OFFLINE-03 dead-letter overlap) |
| Validation at push | Guards only `door_knock` missing `voter_id` — logs + drops silently | `offlineQueueStore.ts:33-37` | PARTIAL — no call_record validation; no user-facing feedback on drop |
| Rehydration integrity | No check that rehydrated items have expected shape (e.g., missing fields from older versions) | — | GAP — couples to schema versioning above |
| `clear()` API | Exists, wipes `items` + `isSyncing` | `offlineQueueStore.ts:67` | OK (used by tests) |

---

## §2. Idempotency Inventory

Cross-references client enqueue shape ↔ server endpoint shape. Evidence from
greps run during this audit.

**Grep evidence:**

```
$ rg "client_uuid|Idempotency-Key" app/api/v1/walk_lists.py
(no results)

$ rg "Idempotency-Key|client_uuid" web/src/types/walk-list.ts
(no results)

$ rg "client_uuid" app/schemas/canvass.py
(no results)

$ rg "client_uuid" web/src/stores/offlineQueueStore.ts
(no results)
```

The entire door-knock path has **zero** idempotency keys. The only matches
for "Idempotency" anywhere in `app/` are in the Twilio webhook path
(`app/services/twilio_webhook.py`, `app/api/v1/webhooks.py`) — a completely
different subsystem that cannot be reused.

| Layer | Current behavior | Evidence | Gap |
|---|---|---|---|
| Client UUID on enqueue | `crypto.randomUUID()` stored as `QueueItem.id` only — NOT injected into `payload` | `offlineQueueStore.ts:43` | GAP — server never sees the UUID (OFFLINE-01) |
| Client payload shape | `DoorKnockCreate` (TS) has no `client_uuid` field | `web/src/types/walk-list.ts:38-47` | GAP (OFFLINE-01) |
| Server payload shape | `DoorKnockCreate` (Pydantic) has no `client_uuid` field | `app/schemas/canvass.py:50-58` | GAP (OFFLINE-01) |
| Server dedup on /door-knocks | None — service directly inserts a `VoterInteraction` with no dedup check | `app/api/v1/walk_lists.py:332-363`, `app/services/canvass.py:30-130` | GAP (OFFLINE-01) |
| DB unique constraint | None on interaction/door-knock for `(campaign_id, client_uuid)` | `app/models/voter_interaction.py` (no unique idx for this) | GAP (OFFLINE-01) — must be added for concurrency-safe dedup |
| 409 handling (client) | `drainQueue` catches `isConflict` → removes item silently, continues loop | `useSyncEngine.ts:86-89` | OK — already ready to consume 409 once server starts emitting it |
| `isConflict` helper | Checks `err.response.status === 409` | `useSyncEngine.ts:17-22` | OK |
| Double-enqueue guard | None — `queueDoorKnockOffline` pushes blindly on TypeError fallback | `useCanvassingWizard.ts:248-256`, `useCanvassingWizard.ts:317-321` | GAP — user hitting Submit twice offline enqueues two items with different UUIDs (OFFLINE-01) |
| Online path UUID | `doorKnockMutation.mutateAsync(payload)` submits with no UUID, so server-side dedup cannot protect a dropped-connection retry that later falls into the offline queue | `useCanvassingWizard.ts:308` | GAP — online AND offline paths must share the UUID for end-to-end idempotency (OFFLINE-01) |
| Call-record path | `recordCall.mutateAsync` hits server directly — no offline fallback and no UUID | `useCallingSession.ts:298`, `usePhoneBankSessions.ts:190-196` | GAP — but call-record offline enqueue is **not yet implemented** in production code (see §5); decide scope in 110-02 |

---

## §3. Retry & Backoff Inventory

| Concern | Current | File:line | Gap vs OFFLINE-03 |
|---|---|---|---|
| Drain triggers | 1 s debounce on `online` transition + 30 s periodic interval while online | `useSyncEngine.ts:202-221` | OK but blunt — no exponential curve |
| Per-item retry cap | `MAX_RETRY = 3` | `useSyncEngine.ts:11` | OK (phase 75 C14/C15 shipped) |
| Backoff curve | **None.** Every drain tick reprocesses every item; failing items are retried every 30 s until cap | `useSyncEngine.ts:61-107` | GAP — need exp. backoff 1 s → 60 s cap for 5xx/network (OFFLINE-03) |
| Per-item `nextAttemptAt` | Not tracked in `QueueItem` | `offlineQueueStore.ts:6-14` | GAP — required to implement backoff (OFFLINE-03) |
| 4xx vs 5xx classification | Only **409** is classified → silent remove. All other errors (4xx, 5xx, network) fall into the generic branch and simply `incrementRetry` | `useSyncEngine.ts:86-106` | GAP — non-409 4xx (401/403/422) should dead-letter immediately, not burn retries (OFFLINE-03) |
| Network-error helper exists but unused in drain | `isNetworkError` checks `err instanceof TypeError` but `drainQueue` never calls it | `useSyncEngine.ts:13-15` | GAP — classification path is hardcoded to the generic "retry until MAX_RETRY" bucket |
| Sync budget deadline | None | — | GAP — need 30 s soft deadline, pill dims to "Syncing… (slow)" after (OFFLINE-03) |
| Dead-letter store | None. After `MAX_RETRY`, items are `toast.error`'d and `remove()`'d — permanently lost | `useSyncEngine.ts:93-103` | GAP — volunteer cannot see or retry failed items (OFFLINE-03) |
| Loss surface | User only sees a transient sonner toast; no persistent list | `useSyncEngine.ts:99-101` | GAP (OFFLINE-03) |
| FIFO preservation | `snapshot = [...items]` then iterated in order; successful items removed in-place | `useSyncEngine.ts:59-107` | OK — phase 75 invariant |
| Stall safety (C14/C15) | `try/finally` releases `setSyncing(false)` even if invalidate throws | `useSyncEngine.ts:58,183-187` | OK (phase 75) |

---

## §4. Connectivity Indicator Inventory

| UI element | Location | States shown | Gap |
|---|---|---|---|
| `OfflineBanner` | Rendered at `web/src/routes/field/$campaignId.tsx:67` (between header and `<Outlet />`) | hidden (online + empty + !syncing), offline, offline + N items, syncing + N items | Full-width `h-8` strip — intrusive. OFFLINE-02 wants a glanceable pill in the header |
| `useConnectivityStatus` | `web/src/hooks/useConnectivityStatus.ts:20-22` | Boolean via `useSyncExternalStore` on `navigator.onLine` | OK as source of truth; no new hook needed |
| Last-sync timestamp | **Not tracked anywhere** — `drainQueue` does not record when the last successful drain happened | `useSyncEngine.ts:45-188` | GAP — required for "Last sync: 2 min ago" (OFFLINE-02) |
| Dead-letter surface | None | — | GAP (OFFLINE-03) |
| Manual retry UI | None | — | GAP (OFFLINE-03) |
| Field shell header | `<FieldHeader />` at `field/$campaignId.tsx:61-66` | Renders title + help button + (optional) back button | GAP — no slot for a connectivity pill; 110-05 needs to add one |
| Touch target | Banner is non-interactive; tap does nothing | `OfflineBanner.tsx:38-57` | GAP — OFFLINE-02 wants 44×44 tap target that opens a Sheet |
| aria-live | `role="status"` + `aria-live="polite"` | `OfflineBanner.tsx:21,42` | OK to port |
| Color tokens | `bg-status-info-muted` (syncing), `bg-muted` (offline) | `OfflineBanner.tsx:23,43` | OK — tokens land in oklch brand system |
| Sheet integration | None | — | GAP — OFFLINE-02 wants a Sheet (reuse pattern from phase 108 `DoorListView`) |

---

## §5. Enqueue Integration Points

Grep for every call site that invokes `useOfflineQueueStore.getState().push`.

```
$ rg "useOfflineQueueStore\(\).getState\(\)\.push|useOfflineQueueStore\.getState\(\)\.push" web/src
web/src/hooks/useCanvassingWizard.ts:249:    useOfflineQueueStore.getState().push({
web/src/stores/offlineQueueStore.test.ts:15,46,71,102,108,124,144,159   (test fixtures)
web/src/hooks/useSyncEngine.test.ts: many (test fixtures)
```

| Call site | What it enqueues | File:line | Trigger |
|---|---|---|---|
| `queueDoorKnockOffline` in `useCanvassingWizard` | `type: "door_knock"` with `DoorKnockCreate` payload | `useCanvassingWizard.ts:248-256` | Called from `submitDoorKnock` catch branch when `err instanceof TypeError` (`useCanvassingWizard.ts:317-321`) |
| Phone-bank call_record enqueue | **Not implemented** in production code | — | `useCallingSession.ts:285-327` calls `recordCall.mutateAsync` and does NOT catch to offline queue. The `"call_record"` type exists in the queue store union (`offlineQueueStore.ts:8`) and in `replayMutation` switch (`useSyncEngine.ts:34-41`) solely to support a future caller; today only tests exercise it |
| Any other production enqueue | None found | — | Confirmed by grep above |

**Implication:** OFFLINE-01 today applies to door-knocks only. If phase 110 wants
phone-bank call records to get parity, 110-02 must add the offline fallback in
`useCallingSession.submitCall` (mirror the `TypeError` catch → enqueue pattern)
AND extend idempotency to the `/phone-bank-sessions/{id}/calls` route.
Recommend: **defer call-record offline to 110-02 stretch goal** unless the phase
owner flags otherwise — the replay machinery is already wired, only the enqueue
hook is missing.

---

## §6. Gaps per Requirement

### OFFLINE-01 — Queue persist + replay with no duplication or loss

- [ ] **Add `client_uuid` to client `DoorKnockCreate`** (`web/src/types/walk-list.ts`) — required string.
- [ ] **Add `client_uuid` to server `DoorKnockCreate`** (`app/schemas/canvass.py:50`) — required `UUID`.
- [ ] **Stamp `client_uuid` in `offlineQueueStore.push()`** — generate UUID once, assign to BOTH `item.id` AND `item.payload.client_uuid`.
- [ ] **Stamp `client_uuid` in online path too** — `useCanvassingWizard.submitDoorKnock` must generate the UUID before `mutateAsync` so a mid-flight drop retries with the same UUID.
- [ ] **Add DB column + unique index** `(campaign_id, client_uuid)` on door-knock interaction (or a new `DoorKnock` table) — Alembic migration.
- [ ] **Server dedup on 409** — service catches `IntegrityError` on the unique constraint, route returns `problem.ProblemResponse(status=409, type="door-knock-duplicate")`. Client already handles 409 via `isConflict`.
- [ ] **Double-enqueue guard** — in `queueDoorKnockOffline`, skip push if an item with same `(walk_list_entry_id, voter_id, result_code)` already exists in `items`.
- [ ] **Persist schema versioning** — add `version: 1` + `migrate` fn to zustand persist config in `offlineQueueStore.ts`.
- [ ] **Rehydration integrity check** — on rehydrate, drop/repair items missing required fields (e.g., missing `client_uuid` on pre-v1 rows).
- [ ] **Cross-tab sync (optional, document deferral if skipped)** — `storage` event listener that triggers drain.
- [ ] *(Stretch)* Extend idempotency + offline enqueue to `/phone-bank-sessions/{id}/calls` (see §5).

### OFFLINE-02 — Glanceable connectivity indicator

- [ ] **New `ConnectivityPill` component** in `web/src/components/field/ConnectivityPill.tsx` — shadcn `Badge` + lucide icon + 44×44 touch target.
- [ ] **Mount in `FieldHeader`** — add a right-side slot; render pill in all field routes.
- [ ] **Track `lastSyncAt: number | null`** in `offlineQueueStore` — update from `drainQueue` on successful drain completion (inside the `try` block before releasing the lock).
- [ ] **Pill states** — online (empty queue), online + pending N, offline, offline + pending N, syncing, syncing (slow), last-sync "2 min ago".
- [ ] **Tap → `Sheet`** showing: queue count, last sync timestamp, list of pending items, list of dead-letter items with Retry/Discard buttons, manual "Retry all" button.
- [ ] **Keep existing `OfflineBanner`** for critical/prolonged offline state (per 110-CONTEXT.md §specifics) — or demote to a thinner `role="alert"` strip; decide in 110-05.
- [ ] **z-index** — pill Sheet inherits Sheet=1100 / Radix popper=1200 lock from phase 109.

### OFFLINE-03 — Backoff + budget + actionable errors

- [ ] **Exponential backoff 1 s → 60 s cap** on 5xx/network errors. Store `nextAttemptAt: number` on each `QueueItem`; drain loop skips items whose `nextAttemptAt > Date.now()`.
- [ ] **Classify errors in `drainQueue` catch** — network (TypeError, via `isNetworkError`) → backoff; 5xx → backoff; 409 → silent remove (existing); other 4xx (401/403/422) → move to dead-letter immediately (do NOT burn retries).
- [ ] **Add dead-letter slice** — new `deadLetter: DeadLetterItem[]` in store (separate array) with reason/error string.
- [ ] **30 s soft sync budget** — track `syncStartedAt: number | null` in store; if drain has been running > 30 s, flip pill to "Syncing… (slow)" state.
- [ ] **Dead-letter actions** — `retryDeadLetter(id)` (reset `retryCount=0`, `nextAttemptAt=Date.now()`, push back to `items`, preserve `client_uuid`), `discardDeadLetter(id)` (just remove).
- [ ] **Dead-letter UI** — cards in the ConnectivityPill Sheet showing household address, outcome, error summary, Retry + Discard buttons.
- [ ] **Quota error handling** — catch `QuotaExceededError` in `push()`, toast + move oldest items to dead-letter (or reject new push with user-visible toast).

---

## §7. Findings Summary

1. **The queue is already well-plumbed but completely un-idempotent.** `crypto.randomUUID()` is generated on enqueue but only used as the in-memory queue key — the server never sees it, so the very first acceptance criterion of OFFLINE-01 ("no duplication") cannot hold today. Adding `client_uuid` end-to-end (TS type → store push → Pydantic schema → DB unique index → 409 path) is the critical-path change and the biggest single workstream in 110-02.

2. **Error classification is a two-line bucket today.** Only HTTP 409 is recognized; everything else burns retries until `MAX_RETRY` and then silently evaporates. 110-04 needs to split the single catch branch into four lanes: 409 (remove), network+5xx (backoff), other-4xx (dead-letter), over-retry (dead-letter). The `isNetworkError` helper already exists but is unused in `drainQueue`.

3. **There is no dead-letter surface at all** — after three failures a sonner toast fires and the item is deleted. A volunteer in the field literally cannot recover a lost outcome. 110-03 + 110-04 + 110-05 together need to introduce a persistent dead-letter store, a UI to view it, and Retry/Discard actions.

4. **Persistence is not versioned.** zustand's `persist` with no `version`/`migrate` means any future shape change to `QueueItem` will crash rehydration on already-installed PWAs. Even if 110-02 doesn't ship a schema migration, it MUST seed `version: 1` now so 110-03's `client_uuid` addition has a migration path (stamp `client_uuid` from legacy `item.id` for v0 → v1 upgrade).

5. **The connectivity UI is a single full-width strip with no interactive affordance.** The current `OfflineBanner` cannot be "glanced at" while canvassing because it pushes content down; it also cannot be tapped to surface queue status. 110-05 is essentially a greenfield component (`ConnectivityPill` + Sheet) that bolts onto existing state (`useConnectivityStatus` + `offlineQueueStore`).

**Bonus finding (out-of-scope but worth logging):** `useCallingSession.submitCall` has no `TypeError` catch → no offline fallback for phone banking. The replay machinery already handles `type: "call_record"` end-to-end; only the enqueue hook is missing. Recommend flagging this as a deferred item unless 110-02 owner takes it as stretch scope.

---

## §8. Downstream Plan Scoping

| Plan | Scope | Gaps owned from §6 |
|---|---|---|
| **110-02** — Idempotency end-to-end (OFFLINE-01 core) | `client_uuid` TS + Pydantic + store + mutation hook + Alembic migration + DB unique index + service `IntegrityError` handling + route 409 + double-enqueue guard | OFFLINE-01 items #1–#7 |
| **110-03** — Persistence hardening (OFFLINE-01 durability) | Persist schema `version`/`migrate`, rehydration integrity check, QuotaExceededError handling, optional cross-tab `storage` listener | OFFLINE-01 items #8–#10; OFFLINE-03 quota item |
| **110-04** — Sync robustness (OFFLINE-03) | Exponential backoff with `nextAttemptAt`, four-way error classification (409 / network+5xx / non-409 4xx / over-retry), 30 s sync budget, dead-letter slice + actions (`retryDeadLetter`, `discardDeadLetter`), `lastSyncAt` tracking in store | OFFLINE-03 items #1–#5; OFFLINE-02 `lastSyncAt` store hook |
| **110-05** — Indicator UI (OFFLINE-02 + OFFLINE-03 surface) | `ConnectivityPill` component in `FieldHeader`, Sheet with queue/dead-letter UI, Retry/Discard buttons, all visible pill states incl. "Syncing… (slow)", retire or demote `OfflineBanner` | OFFLINE-02 items #1–#7; OFFLINE-03 items #6 (dead-letter UI) |

**Wave dependency graph:**

```
110-02 (client_uuid everywhere)  ──┐
                                    ├──> 110-04 (needs client_uuid stable across retries)
110-03 (persist versioning)   ─────┘
                                            │
                                            └──> 110-05 (reads store state, renders pill/Sheet)
```

**Scope revisions suggested by this audit:**

- **110-02 MUST also patch the online path** in `useCanvassingWizard.submitDoorKnock` to stamp `client_uuid` BEFORE `mutateAsync`, not only in the offline fallback. Otherwise a dropped-connection retry that lands in the queue carries a fresh UUID and the server can't dedupe. The current 110-02 PLAN.md already calls this out (Task 2 step 4) — confirmed correct scope.
- **110-03 MUST seed `version: 1`** in the persist config even if no migration runs yet, to unblock future schema evolution without a rehydration crash.
- **110-04 should own `lastSyncAt` in the store**, not 110-05. 110-05 only reads it. This avoids a cross-plan race where 110-05 renders "Last sync" but 110-04 hasn't added the write-site yet.
- **Phone-bank call_record offline enqueue** — recommend **deferring** out of phase 110 unless 110-02 owner adopts it as stretch. File as a deferred item so it is not forgotten. The replay machinery is already wired; only `useCallingSession.submitCall` needs a `TypeError` catch branch.
- **`OfflineBanner` retirement** — 110-05 should decide whether to retire fully or keep as a prolonged-offline alert strip. Audit recommends **keeping as a demoted alert** (e.g., only appears after >60 s offline or when dead-letter count > 0), per 110-CONTEXT.md §specifics.

---

## Appendix: key raw grep results

```
$ rg "useOfflineQueueStore.*\.push|queueDoorKnockOffline" web/src --glob '!*.test.*'
web/src/hooks/useCanvassingWizard.ts:248:  const queueDoorKnockOffline = useCallback((payload: DoorKnockCreate) => {
web/src/hooks/useCanvassingWizard.ts:249:    useOfflineQueueStore.getState().push({
web/src/hooks/useCanvassingWizard.ts:319:        queueDoorKnockOffline(payload)
web/src/hooks/useCanvassingWizard.ts:356:  }, [..., queueDoorKnockOffline])

$ rg '"call_record"' web/src --glob '!*.test.*'
web/src/hooks/useSyncEngine.ts:34:    case "call_record":
web/src/hooks/useSyncEngine.ts:124:      } else if (type === "call_record") {
web/src/stores/offlineQueueStore.ts:8:  type: "door_knock" | "call_record"
# (no production enqueue site for call_record)

$ rg "client_uuid|Idempotency-Key" app/api/v1/walk_lists.py app/schemas/canvass.py app/services/canvass.py
(no results)

$ rg "client_uuid|Idempotency-Key" web/src/types/walk-list.ts web/src/stores/offlineQueueStore.ts
(no results)
```
