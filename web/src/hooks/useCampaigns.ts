import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { Campaign, CampaignCreate } from "@/types/campaign"
import type { PaginatedResponse } from "@/types/common"

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
