import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { api } from "@/api/client"
import type { Campaign, CampaignCreate } from "@/types/campaign"
import type { PaginatedResponse } from "@/types/common"

interface CampaignUpdate {
  name?: string
  description?: string
  election_date?: string | null
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get("api/v1/campaigns").json<PaginatedResponse<Campaign>>(),
  })
}

export function useCampaign(campaignId: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId],
    queryFn: () => api.get(`api/v1/campaigns/${campaignId}`).json<Campaign>(),
    enabled: !!campaignId,
  })
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CampaignCreate) =>
      api.post("api/v1/campaigns", { json: data }).json<Campaign>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    },
  })
}

export function useUpdateCampaign(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CampaignUpdate) =>
      api.patch(`api/v1/campaigns/${campaignId}`, { json: data }).json<Campaign>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] })
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    },
  })
}

export function useDeleteCampaign(campaignId: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => api.delete(`api/v1/campaigns/${campaignId}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      navigate({ to: "/" })
    },
  })
}

export function useTransferOwnership(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (newOwnerId: string) =>
      api
        .post(`api/v1/campaigns/${campaignId}/transfer-ownership`, {
          json: { new_owner_id: newOwnerId },
        })
        .json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] })
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId, "members"] })
    },
  })
}
