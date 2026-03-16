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
  const { recordOutcome } = useCanvassingStore.getState()

  return useMutation({
    mutationFn: (data: DoorKnockCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/door-knocks`, { json: data }).json(),
    onMutate: (data) => {
      // Optimistic: record in Zustand store immediately
      recordOutcome(data.walk_list_entry_id, data.result_code)
    },
    // onError removed — call sites (useCanvassingWizard handleOutcome, handleBulkNotHome)
    // handle errors with context-specific logic (offline queue vs revert)
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk-list-entries-enriched", campaignId, walkListId] })
    },
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
