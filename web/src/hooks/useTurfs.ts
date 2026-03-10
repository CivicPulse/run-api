import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { TurfResponse, TurfCreate, TurfUpdate } from "@/types/turf"
import type { PaginatedResponse } from "@/types/common"
import { toast } from "sonner"

export function useTurfs(campaignId: string) {
  return useQuery({
    queryKey: ["turfs", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/turfs`).json<PaginatedResponse<TurfResponse>>(),
    enabled: !!campaignId,
  })
}

export function useTurf(campaignId: string, turfId: string) {
  return useQuery({
    queryKey: ["turfs", campaignId, turfId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/turfs/${turfId}`).json<TurfResponse>(),
    enabled: !!campaignId && !!turfId,
  })
}

export function useCreateTurf(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: TurfCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/turfs`, { json: data }).json<TurfResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["turfs", campaignId] })
      toast.success("Turf created")
    },
    onError: () => toast.error("Failed to create turf"),
  })
}

export function useUpdateTurf(campaignId: string, turfId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: TurfUpdate) =>
      api.patch(`api/v1/campaigns/${campaignId}/turfs/${turfId}`, { json: data }).json<TurfResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["turfs", campaignId] })
      toast.success("Turf updated")
    },
    onError: () => toast.error("Failed to update turf"),
  })
}

export function useDeleteTurf(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (turfId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/turfs/${turfId}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["turfs", campaignId] })
      toast.success("Turf deleted")
    },
    onError: () => toast.error("Failed to delete turf"),
  })
}
