import { useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useOfflineQueueStore, type QueueItem } from "@/stores/offlineQueueStore"
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"
import { useCanvassingStore } from "@/stores/canvassingStore"
import { api } from "@/api/client"
import { toast } from "sonner"
import type { DoorKnockCreate } from "@/types/walk-list"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

export const MAX_RETRY = 3

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

  useOfflineQueueStore.getState().setSyncing(true)

  const syncedCampaignIds = new Set<string>()
  const syncedResourceIds = new Map<
    string,
    { type: string; campaignId: string }
  >()
  const syncedEntryIds = new Set<string>()

  try {
    const snapshot = [...items]

    for (const item of snapshot) {
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
        if (isConflict(err)) {
          useOfflineQueueStore.getState().remove(item.id)
          continue
        }
        // C15 fix: if already at MAX_RETRY, remove + toast; otherwise
        // increment and CONTINUE (never break — one bad item must not
        // stall the whole queue).
        if (item.retryCount >= MAX_RETRY) {
          useOfflineQueueStore.getState().remove(item.id)
          const label =
            item.type === "door_knock"
              ? `door knock for walk list ${item.resourceId}`
              : `call record for session ${item.resourceId}`
          toast.error(
            `Sync failed after ${MAX_RETRY} attempts — removed ${label}.`,
          )
          continue
        }
        useOfflineQueueStore.getState().incrementRetry(item.id)
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

    // Check if queue is now empty
    if (useOfflineQueueStore.getState().items.length === 0) {
      toast.success("All caught up!")
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
    useOfflineQueueStore.getState().setSyncing(false)
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
}
