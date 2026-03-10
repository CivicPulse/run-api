import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { CampaignMember } from "@/types/campaign"
import type { PaginatedResponse } from "@/types/common"

export function useMembers(campaignId: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId, "members"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/members`).json<PaginatedResponse<CampaignMember>>(),
    enabled: !!campaignId,
  })
}

export function useUpdateMemberRole(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/members/${userId}/role`, {
          json: { role },
        })
        .json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "members"],
      })
    },
  })
}

export function useRemoveMember(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/members/${userId}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "members"],
      })
    },
  })
}
