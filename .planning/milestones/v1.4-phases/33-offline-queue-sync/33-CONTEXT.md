# Phase 33: Offline Queue & Sync - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Volunteers can continue recording outcomes when they lose cell signal, and their data syncs automatically when connectivity returns. This phase delivers: a localStorage-backed offline queue shared by both canvassing and phone banking, connectivity detection with a visible offline banner and pending count, automatic FIFO sync with retry on reconnect, and walk list/call list freshness after sync completes. Full offline-first with IndexedDB/service worker is explicitly out of scope (v1.5 candidate). This is a basic queue for intermittent signal loss.

</domain>

<decisions>
## Implementation Decisions

### Queue storage & persistence
- Dedicated `useOfflineQueue` Zustand store with localStorage persistence (not sessionStorage)
- Both canvassing and phone banking push failed mutations to the same queue — single sync engine drains it
- Each queued item includes: type (door_knock | call_record), payload (full mutation data), timestamp, retry count
- Items removed individually from localStorage after server confirms receipt
- Queue survives tab close, browser restart, and phone reboot

### Offline indicator UX
- Top banner below FieldHeader, above content — slim horizontal bar
- Shows on ALL field screens (/field/*), not just during active canvassing/calling
- Banner text: "Offline • N outcomes saved" with pending count that updates in real-time
- When reconnecting: banner transitions to "Syncing N outcomes..." with spinner
- On sync complete: success toast "All caught up!" and banner disappears
- Outcome buttons look and feel identical when offline — no visual changes to action UI
- Only the banner signals offline state

### Sync & retry behavior
- Sequential FIFO replay — outcomes sent in the order they were recorded
- Triggered by: `online` event + periodic drain every 30 seconds while online (safety net)
- Retry up to 3 times per item on transient failure (network errors)
- On permanent failure (409 conflict, entry already completed): discard the item and continue syncing rest
- No manual sync trigger — fully automatic, zero volunteer intervention
- No user-facing error for discarded conflicts

### Walk list freshness on reconnect
- After all queued outcomes are synced, invalidate and refetch enriched entries query (React Query invalidation)
- Same pattern for phone banking: refetch claimed entries and re-claim any expired entries after sync
- Brief toast summary for team progress: "N doors were visited by others while you were offline"
- If current door/voter was completed by another volunteer during offline period: auto-skip to next pending entry with toast "This door was visited — moving to next"
- No delta endpoint — full refetch leverages existing React Query caching

### Claude's Discretion
- Exact banner styling, colors, and animation transitions
- Periodic drain interval tuning (default 30s, adjustable)
- How to intercept failed mutations (React Query onError vs ky interceptor vs wrapper)
- Whether to use `navigator.onLine` directly or a custom ping-based connectivity check
- Toast duration and styling for sync feedback
- Queue item schema details beyond the core fields

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Canvassing outcome recording
- `web/src/hooks/useCanvassingWizard.ts` — Orchestrator hook with handleOutcome that fires doorKnockMutation
- `web/src/hooks/useCanvassing.ts` — useDoorKnockMutation, useSkipEntryMutation, useEnrichedEntries
- `web/src/stores/canvassingStore.ts` — Zustand persist store with completedEntries tracking

### Phone banking outcome recording
- `web/src/hooks/useCallingSession.ts` — Orchestrator hook with handleOutcome that fires recordCall mutation
- `web/src/hooks/usePhoneBankSessions.ts` — useRecordCall, useClaimEntry, useCheckIn/Out mutations
- `web/src/stores/callingStore.ts` — Zustand persist store with completedCalls tracking

### Field infrastructure
- `web/src/components/field/FieldHeader.tsx` — Header component; offline banner renders below this
- `web/src/routes/field/$campaignId.tsx` — Field layout shell; banner injection point

### Backend endpoints
- `app/services/canvass.py` — CanvassService.record_door_knock() for canvassing outcomes
- `app/services/phone_bank.py` — PhoneBankService.record_call() for phone banking outcomes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useCanvassingStore` / `useCallingStore`: Both already use Zustand persist + sessionStorage — new offline queue store follows same pattern but with localStorage
- `sonner` toast library: Already used throughout field mode for transient feedback — reuse for sync status toasts
- React Query `queryClient.invalidateQueries()`: Existing pattern for refetching after mutations — use after sync completes
- `ky` HTTP client: All API calls go through ky with auth interceptor — mutation failures already surface via onError

### Established Patterns
- Zustand persist with `createJSONStorage()` — switch storage factory from `sessionStorage` to `localStorage` for queue store
- React Query mutations with `onSuccess`/`onError` callbacks — hook into onError to push to offline queue
- Field layout shell renders children inside a flex column — banner inserts between FieldHeader and children
- `useEffect` with `window.addEventListener('online'/'offline')` for connectivity detection

### Integration Points
- `useCanvassingWizard.handleOutcome()` → `doorKnockMutation.mutate()` — intercept failure here
- `useCallingSession.handleOutcome()` → `recordCall.mutate()` — intercept failure here
- `useCallingSession.handleSkip()` → `selfRelease.mutate()` — queue skip/release if offline
- Field layout route (`$campaignId.tsx`) — inject OfflineBanner component
- React Query's `onlineManager` — potential integration point for pausing/resuming mutations

</code_context>

<specifics>
## Specific Ideas

- The experience should be invisible when online — volunteers shouldn't even know the offline queue exists until they need it
- Badge count on the offline banner ("3 outcomes saved") is critical for field confidence — volunteers in rural areas need assurance their work isn't lost
- Sync animation ("Syncing 3 outcomes...") provides closure — volunteers see their data making it to the server
- Team progress toast ("5 doors were visited by others") gives a sense of shared momentum after reconnect
- Auto-skip on conflict prevents the awkward "this was already done" dead end

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 33-offline-queue-sync*
*Context gathered: 2026-03-16*
