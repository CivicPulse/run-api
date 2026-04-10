import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { Invite, InviteCreate } from "@/types/invite"

export function useInvites(campaignId: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId, "invites"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/invites`).json<Invite[]>(),
    enabled: !!campaignId,
  })
}

export function useCreateInvite(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: InviteCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/invites`, { json: data })
        .json<Invite>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "invites"],
      })
    },
  })
}

export function useRevokeInvite(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (inviteId: string) => {
      await api.delete(`api/v1/campaigns/${campaignId}/invites/${inviteId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "invites"],
      })
    },
  })
}
