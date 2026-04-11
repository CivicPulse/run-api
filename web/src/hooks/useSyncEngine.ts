import { useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useOfflineQueueStore, type QueueItem } from "@/stores/offlineQueueStore"
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"
import { useCanvassingStore } from "@/stores/canvassingStore"
import { api } from "@/api/client"
import { toast } from "sonner"
import type { DoorKnockCreate } from "@/types/walk-list"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

// Plan 110-04 / OFFLINE-03: MAX_RETRY is retained as an exported
// constant for backward-compatibility with consumers that still
// reference it, but the drainQueue loop no longer uses it as a
// removal gate. 4xx responses move to dead-letter on the FIRST
// failure (not retryCount-based), and 5xx/network errors back off
// forever (subject to the 1s→60s cap) until reconnect. See the
// REL-02 invariant update in `useSyncEngine.test.ts`.
export const MAX_RETRY = 3

// Plan 110-04 / OFFLINE-03: budget deadline (ms) before the
// ConnectivityPill flips to "Syncing (slow)". Not a hard cutoff —
// drain keeps going until the queue empties.
export const SYNC_BUDGET_MS = 30_000

// Plan 110-04 / OFFLINE-03: backoff schedule. Matches the plan's
// must_haves.truths: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s...
export function computeBackoffMs(retryCount: number): number {
  if (retryCount <= 0) return 0
  // retryCount === 1 → 1s ; retryCount === 2 → 2s ; ... ; cap at 60s
  const ms = 1000 * Math.pow(2, retryCount - 1)
  return Math.min(ms, 60_000)
}

export type ClassifiedError =
  | { kind: "network"; retry: true }
  | { kind: "conflict"; retry: false }
  | {
      kind: "validation"
      retry: false
      errorSummary: string
      errorCode: string
    }
  | { kind: "server"; retry: true; errorCode: string }
  | { kind: "unknown"; retry: true }

function extractErrorSummary(err: unknown, fallback: string): string {
  // Try to pull a message out of a ky HTTPError-like shape:
  // { response: { status, statusText }, message }
  if (err && typeof err === "object") {
    const e = err as {
      message?: string
      response?: { status?: number; statusText?: string }
    }
    if (typeof e.message === "string" && e.message.length > 0) {
      return e.message
    }
    if (e.response?.statusText) {
      return `${e.response.status ?? ""} ${e.response.statusText}`.trim()
    }
  }
  return fallback
}

// Plan 110-04 / OFFLINE-03: classifyError replaces the flat
// isConflict/isNetworkError branches. It drives drainQueue's
// dispositions: network/5xx → exponential backoff, 4xx non-409 →
// dead-letter on first failure, 409 → silent success (server already
// has the record via the client_uuid partial unique index).
export function classifyError(err: unknown): ClassifiedError {
  // Network: ky surfaces TypeError for fetch failures (DNS, offline,
  // CORS preflight blocked, etc.)
  if (err instanceof TypeError) {
    return { kind: "network", retry: true }
  }
  if (err && typeof err === "object" && "response" in err) {
    const status = (err as { response: { status: number } }).response.status
    if (status === 409) {
      return { kind: "conflict", retry: false }
    }
    if (status >= 400 && status < 500) {
      return {
        kind: "validation",
        retry: false,
        errorSummary: extractErrorSummary(err, `HTTP ${status}`),
        errorCode: `http_${status}`,
      }
    }
    if (status >= 500) {
      return {
        kind: "server",
        retry: true,
        errorCode: `http_${status}`,
      }
    }
  }
  return { kind: "unknown", retry: true }
}

// Plan 110-04 / OFFLINE-03: retained for backward-compat with
// existing tests that import these helpers. `classifyError` is the
// canonical entry point.
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}

export function isConflict(err: unknown): boolean {
  if (err && typeof err === "object" && "response" in err) {
    return (err as { response: { status: number } }).response.status === 409
  }
  return false
}

export async function replayMutation(item: QueueItem): Promise<void> {
  switch (item.type) {
    case "door_knock":
      await api
        .post(
          `api/v1/campaigns/${item.campaignId}/walk-lists/${item.resourceId}/door-knocks`,
          { json: item.payload }
        )
        .json()
      break
    case "call_record":
      await api
        .post(
          `api/v1/campaigns/${item.campaignId}/phone-bank-sessions/${item.resourceId}/calls`,
          { json: item.payload }
        )
        .json()
      break
  }
}

export async function drainQueue(queryClient: QueryClient): Promise<void> {
  const { items, isSyncing } = useOfflineQueueStore.getState()
  if (items.length === 0 || isSyncing || !navigator.onLine) return

  // Plan 110-04 / OFFLINE-03: startSync() replaces setSyncing(true).
  // It also stamps syncStartedAt so the React-side useSyncEngine
  // hook can schedule the 30s markSlow() trigger.
  useOfflineQueueStore.getState().startSync()

  const syncedCampaignIds = new Set<string>()
  const syncedResourceIds = new Map<
    string,
    { type: string; campaignId: string }
  >()
  const syncedEntryIds = new Set<string>()

  try {
    const snapshot = [...items]
    const now = Date.now()

    for (const item of snapshot) {
      // Plan 110-04 / OFFLINE-03: per-item backoff gate. Skip items
      // whose nextAttemptAt has not yet elapsed — they stay in the
      // queue for the next drain tick.
      if (item.nextAttemptAt && item.nextAttemptAt > now) {
        continue
      }
      if (
        item.type === "door_knock" &&
        !(item.payload as DoorKnockCreate).voter_id
      ) {
        useOfflineQueueStore.getState().remove(item.id)
        toast.error(
          "A queued canvassing record was missing voter data and has been removed.",
        )
        continue
      }
      try {
        await replayMutation(item)
        useOfflineQueueStore.getState().remove(item.id)
        syncedCampaignIds.add(item.campaignId)
        syncedResourceIds.set(item.resourceId, {
          type: item.type,
          campaignId: item.campaignId,
        })
        if (item.type === "door_knock") {
          syncedEntryIds.add(
            (item.payload as DoorKnockCreate).walk_list_entry_id
          )
        }
      } catch (err) {
        const classified = classifyError(err)
        if (classified.kind === "conflict") {
          // Server already has this record (client_uuid partial
          // unique index hit) — silent success path.
          useOfflineQueueStore.getState().remove(item.id)
          continue
        }
        if (classified.kind === "validation") {
          // 4xx non-409 is terminal — move to dead-letter for
          // volunteer review. A door_knock validation failure will
          // never succeed on retry; stalling the queue helps nobody.
          useOfflineQueueStore.getState().moveToDeadLetter(item.id, {
            errorSummary: classified.errorSummary,
            errorCode: classified.errorCode,
          })
          const label =
            item.type === "door_knock"
              ? `door knock for walk list ${item.resourceId}`
              : `call record for session ${item.resourceId}`
          toast.error(`Sync failed — ${label} moved to dead-letter.`)
          continue
        }
        // network / server / unknown → exponential backoff.
        // retryCount+1 because setItemBackoff will itself increment.
        const nextRetryCount = item.retryCount + 1
        const delay = computeBackoffMs(nextRetryCount)
        useOfflineQueueStore
          .getState()
          .setItemBackoff(item.id, Date.now() + delay, classified.kind)
        continue
      }
    }

    // Post-sync: invalidate queries and handle toasts
    if (syncedResourceIds.size > 0) {
    const invalidationPromises: Promise<void>[] = []

    for (const [resourceId, { type, campaignId }] of syncedResourceIds) {
      if (type === "door_knock") {
        invalidationPromises.push(
          queryClient.invalidateQueries({
            queryKey: [
              "walk-list-entries-enriched",
              campaignId,
              resourceId,
            ],
          })
        )
      } else if (type === "call_record") {
        invalidationPromises.push(
          queryClient.invalidateQueries({
            queryKey: [
              "campaigns",
              campaignId,
              "phone-bank-sessions",
              resourceId,
            ],
          })
        )
      }
    }

    // Invalidate hub assignment data so progress counters refresh
    for (const campaignId of syncedCampaignIds) {
      invalidationPromises.push(
        queryClient.invalidateQueries({
          queryKey: ["field-me", campaignId],
        })
      )
    }

    await Promise.all(invalidationPromises)

    // Plan 110-04 / OFFLINE-03: gate "All caught up!" on BOTH the
    // active queue being empty AND deadLetter being empty. Otherwise
    // the UX claims caught-up while validation failures sit in the
    // dead-letter awaiting volunteer review.
    const postState = useOfflineQueueStore.getState()
    if (postState.items.length === 0 && postState.deadLetter.length === 0) {
      toast.success("All caught up!")
    }
    if (postState.items.length === 0) {
      // A full active drain — record the success timestamp so the
      // ConnectivityPill (plan 110-05) can show "Last sync: Xm ago".
      useOfflineQueueStore.getState().recordSyncSuccess()
    }

    // Auto-skip on conflict: check if current canvassing entry was completed
    // by another volunteer during offline period
    for (const [resourceId, { type, campaignId }] of syncedResourceIds) {
      if (type !== "door_knock") continue

      const { walkListId, currentAddressIndex } =
        useCanvassingStore.getState()

      if (walkListId !== resourceId) continue

      const entries = queryClient.getQueryData<EnrichedWalkListEntry[]>([
        "walk-list-entries-enriched",
        campaignId,
        walkListId,
      ])

      if (!entries) continue

      const currentEntry = entries[currentAddressIndex]
      if (
        currentEntry &&
        currentEntry.status === "visited" &&
        !syncedEntryIds.has(currentEntry.id)
      ) {
        useCanvassingStore.getState().advanceAddress()
        toast("This door was visited \u2014 moving to next")
      }
    }
    }
  } finally {
    // C14 fix: lock always releases, even if invalidateQueries or any
    // post-sync work throws.
    // Plan 110-04 / OFFLINE-03: endSync() supersedes setSyncing(false)
    // — also clears syncStartedAt / isSlow.
    useOfflineQueueStore.getState().endSync()
  }
}

export function useSyncEngine(): void {
  const isOnline = useConnectivityStatus()
  const queryClient = useQueryClient()
  const drainRef = useRef<(() => void) | undefined>(undefined)

  const drain = useCallback(() => {
    drainQueue(queryClient)
  }, [queryClient])

  useLayoutEffect(() => { drainRef.current = drain })

  // Trigger drain on online transition with 1000ms debounce
  useEffect(() => {
    if (!isOnline) return

    const timeout = setTimeout(() => {
      drainRef.current?.()
    }, 1000)

    return () => clearTimeout(timeout)
  }, [isOnline])

  // Periodic drain every 30 seconds while online
  useEffect(() => {
    if (!isOnline) return

    const interval = setInterval(() => {
      drainRef.current?.()
    }, 30_000)

    return () => clearInterval(interval)
  }, [isOnline])

  // Plan 110-04 / OFFLINE-03: 30s soft sync budget. When a drain
  // starts (syncStartedAt flips from null → number), arm a timer
  // that calls markSlow() at 30s. When syncStartedAt flips back to
  // null (endSync), clear the timer. This is observable from the
  // store, so the ConnectivityPill (plan 110-05) can render
  // "Syncing (slow)" without polling.
  const syncStartedAt = useOfflineQueueStore((s) => s.syncStartedAt)
  useEffect(() => {
    if (syncStartedAt === null) return
    const timer = setTimeout(() => {
      useOfflineQueueStore.getState().markSlow()
    }, SYNC_BUDGET_MS)
    return () => clearTimeout(timer)
  }, [syncStartedAt])
}
