import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { EnrichedWalkListEntry } from "@/types/canvassing"
import type { DoorKnockCreate } from "@/types/walk-list"
import { useCanvassingStore } from "@/stores/canvassingStore"
import { toast } from "sonner"

export function useEnrichedEntries(campaignId: string, walkListId: string) {
  return useQuery({
    queryKey: ["walk-list-entries-enriched", campaignId, walkListId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/entries/enriched`)
        .json<EnrichedWalkListEntry[]>(),
    enabled: !!campaignId && !!walkListId,
    staleTime: 5 * 60 * 1000,  // 5 min -- entries don't change often during a session
  })
}

export function useDoorKnockMutation(campaignId: string, walkListId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: DoorKnockCreate) =>
      // Plan 110-08 exit-gate Rule 1 fix: disable ky's retry for
      // door-knock POSTs. ky's default retry (1s → 2s → 4s) swallows
      // network TypeErrors for ~7s before surfacing them, which blocks
      // the offline queue fallback from firing in time for the
      // ConnectivityPill to update. The offline queue is the correct
      // retry mechanism for door-knocks — exponential backoff + dead-
      // letter + client_uuid idempotency — so a per-request retry
      // layer on top is both redundant AND harmful.
      api
        .post(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/door-knocks`, {
          json: data,
          retry: { limit: 0 },
        })
        .json(),
    onSuccess: (_data, variables) => {
      useCanvassingStore.getState().recordOutcome(variables.walk_list_entry_id, variables.result_code)
      queryClient.invalidateQueries({ queryKey: ["walk-list-entries-enriched", campaignId, walkListId] })
    },
    // onError remains caller-owned so route-specific flows can keep the active
    // door stable, queue offline retries, and preserve draft state.
  })
}

export function useSkipEntryMutation(campaignId: string, walkListId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) =>
      api.patch(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/entries/${entryId}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk-list-entries-enriched", campaignId, walkListId] })
    },
    onError: () => toast.error("Failed to skip entry"),
  })
}
