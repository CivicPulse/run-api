import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { HTTPError } from "ky"
import { api, PermissionError } from "@/api/client"
import type { OrgCampaign, OrgMember, UserOrg } from "@/types/org"

export function useOrgCampaigns() {
  return useQuery({
    queryKey: ["org", "campaigns"],
    queryFn: async (): Promise<OrgCampaign[]> => {
      try {
        return await api.get("api/v1/org/campaigns").json<OrgCampaign[]>()
      } catch (err) {
        const is404 =
          err instanceof HTTPError && err.response.status === 404
        if (err instanceof PermissionError || is404) {
          // Non-admin users can't access org endpoint; fall back to
          // the general campaigns list which works for all roles.
          const resp = await api
            .get("api/v1/campaigns")
            .json<{
              items: Array<{
                id: string
                name: string
                status: string | null
                created_at: string
                type?: string | null
                election_date?: string | null
              }>
            }>()
          return resp.items.map((c) => ({
            id: c.id,
            name: c.name,
            slug: null,
            campaign_type: c.type ?? null,
            election_date: c.election_date ?? null,
            created_at: c.created_at,
            member_count: 0,
            status: c.status,
          }))
        }
        throw err
      }
    },
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

export function useUnarchiveCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) =>
      api
        .patch(`api/v1/campaigns/${campaignId}`, {
          json: { status: "active" },
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
