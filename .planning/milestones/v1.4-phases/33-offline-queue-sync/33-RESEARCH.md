# Phase 33: Offline Queue & Sync - Research

**Researched:** 2026-03-16
**Domain:** Browser offline detection, localStorage queue persistence, automatic sync
**Confidence:** HIGH

## Summary

Phase 33 adds a localStorage-backed offline queue that captures failed mutations from both canvassing and phone banking, replays them sequentially when connectivity returns, and refreshes list data after sync. This is a well-scoped problem with no new dependencies -- the existing stack (Zustand persist, React Query, sonner, ky) provides all necessary building blocks.

The key integration points are the `onError` callbacks in `useDoorKnockMutation` and `useRecordCall`, where failed network requests get intercepted and pushed into a shared Zustand queue store. The offline banner renders in the field layout shell between FieldHeader and content. After sync completes, React Query's `queryClient.invalidateQueries()` triggers a full refetch of enriched entries / claimed entries.

**Primary recommendation:** Build a single `useOfflineQueue` Zustand store persisted to localStorage, a `useSyncEngine` hook that drains it on `online` events and a 30-second interval, and an `OfflineBanner` component injected into the field layout. Intercept mutation failures via wrapper functions around the existing mutation hooks -- do NOT modify React Query's global `onlineManager` (it would pause ALL queries/mutations globally, which is too aggressive for this use case).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Dedicated `useOfflineQueue` Zustand store with localStorage persistence (not sessionStorage)
- Both canvassing and phone banking push failed mutations to the same queue -- single sync engine drains it
- Each queued item includes: type (door_knock | call_record), payload (full mutation data), timestamp, retry count
- Items removed individually from localStorage after server confirms receipt
- Queue survives tab close, browser restart, and phone reboot
- Top banner below FieldHeader, above content -- slim horizontal bar
- Shows on ALL field screens (/field/*), not just during active canvassing/calling
- Banner text: "Offline - N outcomes saved" with pending count that updates in real-time
- When reconnecting: banner transitions to "Syncing N outcomes..." with spinner
- On sync complete: success toast "All caught up!" and banner disappears
- Outcome buttons look and feel identical when offline -- no visual changes to action UI
- Only the banner signals offline state
- Sequential FIFO replay -- outcomes sent in the order they were recorded
- Triggered by: `online` event + periodic drain every 30 seconds while online (safety net)
- Retry up to 3 times per item on transient failure (network errors)
- On permanent failure (409 conflict, entry already completed): discard the item and continue syncing rest
- No manual sync trigger -- fully automatic, zero volunteer intervention
- No user-facing error for discarded conflicts
- After all queued outcomes are synced, invalidate and refetch enriched entries query (React Query invalidation)
- Same pattern for phone banking: refetch claimed entries and re-claim any expired entries after sync
- Brief toast summary for team progress: "N doors were visited by others while you were offline"
- If current door/voter was completed by another volunteer during offline period: auto-skip to next pending entry with toast "This door was visited -- moving to next"
- No delta endpoint -- full refetch leverages existing React Query caching

### Claude's Discretion
- Exact banner styling, colors, and animation transitions
- Periodic drain interval tuning (default 30s, adjustable)
- How to intercept failed mutations (React Query onError vs ky interceptor vs wrapper)
- Whether to use `navigator.onLine` directly or a custom ping-based connectivity check
- Toast duration and styling for sync feedback
- Queue item schema details beyond the core fields

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | Volunteer can record door-knock outcomes while offline; they queue locally | Zustand persist store with localStorage; intercept `useDoorKnockMutation` onError to push to queue; optimistic UI unchanged |
| SYNC-02 | Queued interactions automatically sync when connectivity resumes | `useSyncEngine` hook listens to `online` event + 30s interval; sequential FIFO drain with retry/discard logic |
| SYNC-03 | Volunteer sees a visible offline indicator when connectivity is lost | `OfflineBanner` component in field layout; `useConnectivityStatus` hook combining navigator.onLine + online/offline events |
| SYNC-04 | Volunteer receives updated walk list status when connectivity resumes | After sync drain completes, invalidate enriched entries + claimed entries queries; compare before/after for team progress toast |
| SYNC-05 | Volunteer can record phone banking outcomes while offline; they queue locally | Same queue store as SYNC-01; intercept `useRecordCall` onError to push to queue with type `call_record` |

</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.11 | Offline queue store with localStorage persist | Already used for canvassingStore, callingStore |
| @tanstack/react-query | ^5.90.21 | Query invalidation after sync, mutation hooks | Already powers all data fetching |
| ky | ^1.14.3 | HTTP client for replay requests | Already used in api/client.ts |
| sonner | ^2.0.7 | Toast notifications for sync status | Already used throughout field mode |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom sync engine | React Query `onlineManager` + `persistQueryClient` | Too aggressive -- pauses ALL queries globally; we only want to queue specific mutations |
| navigator.onLine only | Custom ping-based check | Ping adds network overhead and latency; navigator.onLine is sufficient for this use case since we handle false positives via retry logic |
| IndexedDB | localStorage | IndexedDB is overkill for a simple queue of <100 items; deferred to v1.5 OFFLINE-01 |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
  stores/
    offlineQueueStore.ts       # Zustand persist store (localStorage)
  hooks/
    useConnectivityStatus.ts   # Online/offline detection hook
    useSyncEngine.ts           # Queue drain + retry logic
    useOfflineAwareMutation.ts # Wrapper that intercepts failures
  components/field/
    OfflineBanner.tsx           # Slim banner below FieldHeader
```

### Pattern 1: Offline Queue Store (Zustand persist + localStorage)

**What:** A dedicated Zustand store persisted to localStorage that holds an array of queued mutation items. Each item has a type discriminator, the full payload needed to replay the request, a timestamp, and a retry count.

**When to use:** Any mutation that should survive network failure.

**Example:**
```typescript
// Source: Existing pattern from canvassingStore.ts + callingStore.ts
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface QueueItem {
  id: string                          // crypto.randomUUID()
  type: "door_knock" | "call_record"
  payload: DoorKnockPayload | CallRecordPayload
  campaignId: string
  resourceId: string                  // walkListId or sessionId
  createdAt: number                   // Date.now()
  retryCount: number
}

interface OfflineQueueState {
  items: QueueItem[]
  isSyncing: boolean
  push: (item: Omit<QueueItem, "id" | "createdAt" | "retryCount">) => void
  remove: (id: string) => void
  incrementRetry: (id: string) => void
  setSyncing: (syncing: boolean) => void
  clear: () => void
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set) => ({
      items: [],
      isSyncing: false,
      push: (item) => set((state) => ({
        items: [...state.items, {
          ...item,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          retryCount: 0,
        }],
      })),
      remove: (id) => set((state) => ({
        items: state.items.filter((i) => i.id !== id),
      })),
      incrementRetry: (id) => set((state) => ({
        items: state.items.map((i) =>
          i.id === id ? { ...i, retryCount: i.retryCount + 1 } : i
        ),
      })),
      setSyncing: (syncing) => set({ isSyncing: syncing }),
      clear: () => set({ items: [], isSyncing: false }),
    }),
    {
      name: "offline-queue",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),  // Don't persist isSyncing
    }
  )
)
```

### Pattern 2: Connectivity Detection Hook

**What:** A hook that combines `navigator.onLine` with `online`/`offline` window events to provide reactive connectivity status.

**When to use:** Any component that needs to show/hide based on online status.

**Key insight:** `navigator.onLine === false` reliably means offline. `navigator.onLine === true` may be a false positive (connected to LAN but no internet). This is acceptable because:
1. If truly online, mutations succeed normally -- no queue involvement
2. If falsely online (captive portal, etc.), mutations will fail and get queued via onError
3. The 30-second periodic drain catches anything queued during false-positive periods

```typescript
import { useSyncExternalStore, useCallback } from "react"

function subscribe(callback: () => void) {
  window.addEventListener("online", callback)
  window.addEventListener("offline", callback)
  return () => {
    window.removeEventListener("online", callback)
    window.removeEventListener("offline", callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

export function useConnectivityStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
```

**Why `useSyncExternalStore`:** This is the React-recommended pattern for subscribing to external browser APIs. It avoids the stale-closure issues of `useState` + `useEffect` + `addEventListener` and works correctly with concurrent rendering.

### Pattern 3: Mutation Interception via Wrapper

**What:** Instead of modifying existing mutation hooks, create wrapper functions that catch network errors and push to the offline queue.

**Recommendation for Claude's Discretion item:** Use wrapper functions around the existing mutation `.mutate()` calls inside the orchestrator hooks (`useCanvassingWizard` and `useCallingSession`). This is better than:
- **ky interceptor:** Would need to reconstruct mutation payloads from raw requests -- fragile
- **React Query onError:** Already used by `useDoorKnockMutation` for optimistic revert; adding queue logic there couples the mutation hook to offline concerns
- **Wrapper approach:** Clean separation; orchestrator decides what to do on failure

```typescript
// In useCanvassingWizard.ts handleOutcome:
doorKnockMutation.mutate(payload, {
  onError: (err) => {
    if (isNetworkError(err)) {
      offlineQueue.push({
        type: "door_knock",
        payload,
        campaignId,
        resourceId: walkListId,
      })
      // Don't revert optimistic update -- it stays in canvassingStore
    }
  },
})
```

**Critical detail:** The existing `useDoorKnockMutation` does `revertOutcome` in its onError. When offline queueing is active, we need to prevent the revert so the optimistic UI stays. The cleanest approach: pass an `onError` override in the `.mutate()` call options, which overrides the mutation-level `onError` per React Query's API.

### Pattern 4: Sync Engine Hook

**What:** A hook that runs in the field layout, draining the queue on `online` events and periodically.

**Key behaviors:**
- FIFO order (items[0] first)
- Sequential replay (wait for each response before sending next)
- 3 retries on network error, then move to next
- Discard on 409 Conflict (already completed by another volunteer)
- After drain complete: invalidate queries + show team progress toast

```typescript
// Simplified sync drain logic
async function drainQueue() {
  const { items } = useOfflineQueueStore.getState()
  if (items.length === 0 || !navigator.onLine) return

  useOfflineQueueStore.getState().setSyncing(true)

  for (const item of items) {
    try {
      await replayMutation(item)
      useOfflineQueueStore.getState().remove(item.id)
    } catch (err) {
      if (isConflict(err)) {
        // 409 -- already done by someone else; discard silently
        useOfflineQueueStore.getState().remove(item.id)
      } else if (item.retryCount >= 2) {
        // Max retries (0,1,2 = 3 attempts); skip for now
        useOfflineQueueStore.getState().incrementRetry(item.id)
        continue
      } else {
        useOfflineQueueStore.getState().incrementRetry(item.id)
        break // Stop drain on network failure, will retry later
      }
    }
  }

  useOfflineQueueStore.getState().setSyncing(false)
  // Post-sync: invalidate queries
}
```

### Pattern 5: Field Layout Banner Injection

**What:** The OfflineBanner sits between FieldHeader and main content in the field layout.

```typescript
// In web/src/routes/field/$campaignId.tsx
<div className="flex min-h-svh flex-col">
  <FieldHeader ... />
  <OfflineBanner />           {/* NEW -- renders null when online */}
  <main className="flex-1 px-4 pb-4">
    <Outlet />
  </main>
</div>
```

### Anti-Patterns to Avoid

- **Modifying React Query's global onlineManager:** This pauses ALL queries and mutations globally, which would break data fetching for screens that don't need offline support. Only specific mutations should be queued.
- **Storing full response objects in queue:** Only store the request payload needed to replay the mutation. Responses are ephemeral.
- **Using sessionStorage for the queue:** sessionStorage clears on tab close. The user decision explicitly requires localStorage for persistence across browser restarts.
- **Parallel queue drain:** Sending multiple queued items simultaneously risks out-of-order processing on the server, which can cause incorrect state (e.g., recording an outcome for an entry that was already auto-skipped).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State persistence | Custom localStorage wrapper | Zustand persist middleware | Already used in project; handles serialization, rehydration, and partial state |
| Online/offline detection | Custom polling/ping service | navigator.onLine + window events via useSyncExternalStore | Sufficient for intermittent signal; false positives handled by retry logic |
| Toast notifications | Custom notification system | sonner (already installed) | Already used throughout field mode |
| Query invalidation | Manual refetch logic | React Query queryClient.invalidateQueries() | Already the established pattern in all mutation hooks |
| UUID generation | Custom ID generator | crypto.randomUUID() | Native browser API, available in all modern browsers |

**Key insight:** This phase adds zero new dependencies. Every building block already exists in the project.

## Common Pitfalls

### Pitfall 1: Optimistic UI Revert on Offline Queue
**What goes wrong:** The existing `useDoorKnockMutation.onError` calls `revertOutcome()`, which would undo the optimistic UI update even though the item is now queued for later sync.
**Why it happens:** The mutation's built-in error handler doesn't know about the offline queue.
**How to avoid:** Override `onError` at the `.mutate()` call site when pushing to the offline queue. React Query's `.mutate(data, { onError })` overrides the mutation-level `onError` handler.
**Warning signs:** Outcome buttons resetting to un-pressed state after network failure.

### Pitfall 2: Double-Submission After Sync
**What goes wrong:** A queued item syncs successfully, then the volunteer records the same outcome again (e.g., re-visiting the same door after reconnect).
**Why it happens:** The server may accept duplicates if not idempotent.
**How to avoid:** The server already tracks door-knock and call outcomes per entry. A 409 Conflict response from the server should be caught and the item discarded silently. Verify that the backend returns 409 on duplicate door-knock/call-record for the same entry.
**Warning signs:** Duplicate interaction records in the database.

### Pitfall 3: Stale Queue Items After Session Reset
**What goes wrong:** Volunteer ends a canvassing/calling session, starts a new one, and old queued items from the previous session attempt to sync.
**Why it happens:** localStorage persists across sessions; queue items reference old walkListId/sessionId.
**How to avoid:** This is actually fine -- the queue items contain all the data needed to replay independently of the current session state. The server processes them by their payload, not by current session context. Old items sync successfully because the API endpoints are stateless.
**Warning signs:** None expected, but verify that walk list and session endpoints accept outcomes regardless of current user session state.

### Pitfall 4: localStorage Size Limits
**What goes wrong:** On some mobile browsers, localStorage is limited to ~5MB. If a volunteer queues hundreds of outcomes over an extended offline period, the store could exceed the limit.
**Why it happens:** Each queue item is ~500 bytes JSON. 5MB allows ~10,000 items -- effectively unlimited for this use case.
**How to avoid:** Not a practical concern for v1.4 (walk lists cap at 500 entries). If needed later, IndexedDB is the v1.5 path.
**Warning signs:** `QuotaExceededError` in console.

### Pitfall 5: Race Condition in Periodic Drain
**What goes wrong:** The 30-second interval fires while a drain is already in progress, causing duplicate requests.
**Why it happens:** Async drain takes time; interval doesn't know drain is running.
**How to avoid:** Guard with `isSyncing` flag in the store. Skip drain if already syncing.
**Warning signs:** Duplicate network requests visible in DevTools.

### Pitfall 6: Banner Flicker on Unstable Connections
**What goes wrong:** In areas with spotty signal, the banner rapidly appears and disappears.
**Why it happens:** online/offline events fire rapidly as connection toggles.
**How to avoid:** Debounce the offline-to-online transition by ~1 second. Show the offline banner immediately (no debounce going offline), but delay hiding it until online status is stable for 1 second.
**Warning signs:** Banner flickering in testing.

## Code Examples

### Replaying a Queued Mutation
```typescript
// Source: Derived from existing api/client.ts patterns
import { api } from "@/api/client"

async function replayMutation(item: QueueItem): Promise<void> {
  switch (item.type) {
    case "door_knock": {
      const payload = item.payload as DoorKnockPayload
      await api.post(
        `api/v1/campaigns/${item.campaignId}/walk-lists/${item.resourceId}/door-knocks`,
        { json: payload }
      ).json()
      break
    }
    case "call_record": {
      const payload = item.payload as CallRecordPayload
      await api.post(
        `api/v1/campaigns/${item.campaignId}/phone-bank-sessions/${item.resourceId}/calls`,
        { json: payload }
      ).json()
      break
    }
  }
}
```

### Detecting Network Errors vs Server Errors
```typescript
// ky throws TypeError for network failures (no response received)
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.name === "TypeError")
}

// ky throws HTTPError for server responses
function isConflict(err: unknown): boolean {
  if (err && typeof err === "object" && "response" in err) {
    return (err as { response: { status: number } }).response.status === 409
  }
  return false
}
```

### Post-Sync Query Invalidation with Team Progress
```typescript
// Source: Derived from existing useCanvassing.ts invalidation pattern
import { useQueryClient } from "@tanstack/react-query"

async function onSyncComplete(
  queryClient: QueryClient,
  campaignId: string,
  walkListId: string | null,
  sessionId: string | null,
) {
  // Snapshot current data for comparison
  const prevEntries = walkListId
    ? queryClient.getQueryData<EnrichedWalkListEntry[]>(
        ["walk-list-entries-enriched", campaignId, walkListId]
      )
    : null

  // Invalidate and refetch
  if (walkListId) {
    await queryClient.invalidateQueries({
      queryKey: ["walk-list-entries-enriched", campaignId, walkListId],
    })
  }
  if (sessionId) {
    await queryClient.invalidateQueries({
      queryKey: ["campaigns", campaignId, "phone-bank-sessions", sessionId],
    })
  }

  // Compare for team progress toast
  if (prevEntries && walkListId) {
    const newEntries = queryClient.getQueryData<EnrichedWalkListEntry[]>(
      ["walk-list-entries-enriched", campaignId, walkListId]
    )
    if (newEntries) {
      const prevVisited = new Set(prevEntries.filter(e => e.status === "visited").map(e => e.id))
      const newlyVisited = newEntries.filter(
        e => e.status === "visited" && !prevVisited.has(e.id)
      )
      // Subtract our own synced items -- only count others' work
      // ... (implementation detail for planner)
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Service Worker + IndexedDB | localStorage queue for basic offline | N/A | Simpler; full offline-first deferred to v1.5 |
| React Query onlineManager global | Selective mutation interception | N/A | Only specific mutations get queued; queries continue normally |
| useState + useEffect for online detection | useSyncExternalStore | React 18+ | Concurrent-safe, no stale closures |

**Deprecated/outdated:**
- React Query v3's `setOnline` global approach: v5 has better granular control but still too aggressive for this use case
- `navigator.connection` API: Still experimental, not widely supported, unnecessary here

## Open Questions

1. **409 Conflict Response from Backend**
   - What we know: The context assumes 409 for duplicate outcomes
   - What's unclear: Do `record_door_knock` and `record_call` endpoints actually return 409 on duplicates, or do they succeed silently/return 200?
   - Recommendation: Verify backend behavior. If no 409, the sync engine can still discard based on success (idempotent) -- but the planner should note this needs backend verification

2. **Phone Banking Session Expiry During Offline**
   - What we know: Phone banking sessions have check-in/check-out lifecycle
   - What's unclear: If a volunteer goes offline for 30+ minutes, does their session expire? Will queued `record_call` mutations fail with 403/404?
   - Recommendation: Queue items should carry all context needed. If session expired, those items get discarded as permanent failures (non-retryable server error).

3. **Walk List Entry Locking**
   - What we know: Entries can be claimed/locked to a volunteer
   - What's unclear: If another volunteer completes an entry while the original volunteer is offline, does the door-knock endpoint reject the late submission or accept it?
   - Recommendation: Accept-and-discard (last-write-wins) is fine for field operations. The "auto-skip to next" UX handles the volunteer-facing side.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x + Playwright 1.58 |
| Config file | web/vitest.config.ts (unit), web/playwright.config.ts (e2e) |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Door-knock queues on network error | unit | `cd web && npx vitest run src/stores/offlineQueueStore.test.ts -t "door_knock"` | No -- Wave 0 |
| SYNC-02 | Queue drains on online event | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts` | No -- Wave 0 |
| SYNC-03 | Offline banner shows/hides | unit + e2e | `cd web && npx vitest run src/components/field/OfflineBanner.test.ts` | No -- Wave 0 |
| SYNC-04 | Walk list refreshes after sync | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts -t "invalidate"` | No -- Wave 0 |
| SYNC-05 | Call record queues on network error | unit | `cd web && npx vitest run src/stores/offlineQueueStore.test.ts -t "call_record"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/stores/offlineQueueStore.test.ts` -- covers SYNC-01, SYNC-05 (push, remove, persist, rehydrate)
- [ ] `web/src/hooks/useSyncEngine.test.ts` -- covers SYNC-02, SYNC-04 (drain, retry, discard, invalidation)
- [ ] `web/src/components/field/OfflineBanner.test.tsx` -- covers SYNC-03 (show/hide, pending count, syncing state)
- [ ] `web/e2e/phase33-offline-sync.spec.ts` -- e2e smoke test using page.route() to simulate offline

## Sources

### Primary (HIGH confidence)
- Project codebase: `useCanvassingWizard.ts`, `useCallingSession.ts`, `canvassingStore.ts`, `callingStore.ts`, `useCanvassing.ts`, `usePhoneBankSessions.ts`, `api/client.ts`, `field/$campaignId.tsx`
- [Zustand persist middleware docs](https://zustand.docs.pmnd.rs/reference/middlewares/persist)
- [TanStack Query OnlineManager docs](https://tanstack.com/query/latest/docs/reference/onlineManager)
- [MDN Navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)

### Secondary (MEDIUM confidence)
- [TanStack Query Network Mode docs](https://tanstack.com/query/v4/docs/react/guides/network-mode) -- verified onlineManager behavior
- [How to really know if your webapp is online](https://jfhr.me/how-to-really-know-if-your-webapp-is-online/) -- navigator.onLine reliability analysis

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources or project code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns verified in existing codebase
- Architecture: HIGH -- direct extension of existing Zustand persist + React Query patterns
- Pitfalls: HIGH -- derived from code analysis of actual integration points
- Connectivity detection: MEDIUM -- navigator.onLine has known false-positive behavior, but retry logic mitigates this adequately

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain, no fast-moving dependencies)
