import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { UserResponse, UserCampaign } from "@/types/user"

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("api/v1/me").json<UserResponse>(),
  })
}

export function useMyCampaigns() {
  return useQuery({
    queryKey: ["me", "campaigns"],
    queryFn: () => api.get("api/v1/me/campaigns").json<UserCampaign[]>(),
  })
}

export function useMyCampaignRole(campaignId: string) {
  const { data: campaigns } = useMyCampaigns()
  const match = campaigns?.find((c) => c.campaign_id === campaignId)
  return match?.role ?? null
}
