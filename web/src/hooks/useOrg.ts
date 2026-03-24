import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/api/client"
import type { OrgCampaign, OrgMember, UserOrg } from "@/types/org"

export function useOrgCampaigns() {
  return useQuery({
    queryKey: ["org", "campaigns"],
    queryFn: () =>
      api.get("api/v1/org/campaigns").json<OrgCampaign[]>(),
  })
}

export function useOrgMembers() {
  return useQuery({
    queryKey: ["org", "members"],
    queryFn: () =>
      api.get("api/v1/org/members").json<OrgMember[]>(),
  })
}

export function useMyOrgs() {
  return useQuery({
    queryKey: ["me", "orgs"],
    queryFn: () => api.get("api/v1/me/orgs").json<UserOrg[]>(),
  })
}

export function useArchiveCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) =>
      api
        .patch(`api/v1/campaigns/${campaignId}`, {
          json: { status: "archived" },
        })
        .json(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["org", "campaigns"],
      })
      queryClient.invalidateQueries({
        queryKey: ["campaigns"],
      })
    },
  })
}

export function useUpdateOrg() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string }) =>
      api.patch("api/v1/org", { json: data }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org"] })
      queryClient.invalidateQueries({
        queryKey: ["me", "orgs"],
      })
    },
  })
}

export function useAddMemberToCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      campaignId,
      userId,
      role,
    }: {
      campaignId: string
      userId: string
      role: string
    }) =>
      api
        .post(`api/v1/org/campaigns/${campaignId}/members`, {
          json: { user_id: userId, role },
        })
        .json(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["org", "members"],
      })
      queryClient.invalidateQueries({
        queryKey: ["org", "campaigns"],
      })
    },
  })
}
