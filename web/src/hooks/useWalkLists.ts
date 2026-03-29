import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { WalkListCreate, WalkListResponse, WalkListEntryResponse, CanvasserAssignment, DoorKnockCreate } from "@/types/walk-list"
import type { PaginatedResponse } from "@/types/common"
import { toast } from "sonner"

export function useWalkLists(campaignId: string) {
  return useQuery({
    queryKey: ["walk-lists", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/walk-lists`).json<PaginatedResponse<WalkListResponse>>(),
    enabled: !!campaignId,
  })
}

export function useWalkList(campaignId: string, walkListId: string) {
  return useQuery({
    queryKey: ["walk-lists", campaignId, walkListId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}`).json<WalkListResponse>(),
    enabled: !!campaignId && !!walkListId,
  })
}

export function useGenerateWalkList(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: WalkListCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/walk-lists`, { json: data }).json<WalkListResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk-lists", campaignId] })
      toast.success("Walk list generated")
    },
    onError: () => toast.error("Failed to generate walk list"),
  })
}

export function useDeleteWalkList(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (walkListId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk-lists", campaignId] })
      toast.success("Walk list deleted")
    },
    onError: () => toast.error("Failed to delete walk list"),
  })
}

export function useRenameWalkList(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      walkListId,
      name,
    }: {
      walkListId: string
      name: string
    }) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}`, {
          json: { name },
        })
        .json<WalkListResponse>(),
    onSuccess: (_data, { walkListId }) => {
      queryClient.invalidateQueries({
        queryKey: ["walk-lists", campaignId],
      })
      queryClient.invalidateQueries({
        queryKey: ["walk-lists", campaignId, walkListId],
      })
      toast.success("Walk list renamed")
    },
    onError: () => toast.error("Failed to rename walk list"),
  })
}

export function useWalkListEntries(campaignId: string, walkListId: string) {
  return useQuery({
    queryKey: ["walk-list-entries", campaignId, walkListId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/entries`).json<PaginatedResponse<WalkListEntryResponse>>(),
    enabled: !!campaignId && !!walkListId,
  })
}

export function useUpdateEntryStatus(campaignId: string, walkListId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ entryId, status }: { entryId: string; status: string }) =>
      api.patch(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/entries/${entryId}`, { json: { status } }).json<WalkListEntryResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk-list-entries", campaignId, walkListId] })
      queryClient.invalidateQueries({ queryKey: ["walk-lists", campaignId, walkListId] })
    },
    onError: () => toast.error("Failed to update entry status"),
  })
}

export function useListCanvassers(campaignId: string, walkListId: string) {
  return useQuery({
    queryKey: ["canvassers", campaignId, walkListId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`).json<CanvasserAssignment[]>(),
    enabled: !!campaignId && !!walkListId,
  })
}

export function useAssignCanvasser(campaignId: string, walkListId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CanvasserAssignment) =>
      api.post(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`, { json: data }).json<CanvasserAssignment>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvassers", campaignId, walkListId] })
      toast.success("Canvasser assigned")
    },
    onError: () => toast.error("Failed to assign canvasser"),
  })
}

export function useRemoveCanvasser(campaignId: string, walkListId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers/${userId}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvassers", campaignId, walkListId] })
      toast.success("Canvasser removed")
    },
    onError: () => toast.error("Failed to remove canvasser"),
  })
}

export function useRecordDoorKnock(campaignId: string, walkListId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: DoorKnockCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/door-knocks`, { json: data }).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk-list-entries", campaignId, walkListId] })
      queryClient.invalidateQueries({ queryKey: ["walk-lists", campaignId, walkListId] })
      toast.success("Door knock recorded")
    },
    onError: () => toast.error("Failed to record door knock"),
  })
}
