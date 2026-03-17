import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { Voter } from "@/types/voter"
import type { PaginatedResponse } from "@/types/common"
import type {
  VoterList,
  VoterListCreate,
  VoterListUpdate,
  VoterListMemberUpdate,
} from "@/types/voter-list"

const listKeys = {
  all: (campaignId: string) => ["campaigns", campaignId, "lists"] as const,
  detail: (campaignId: string, listId: string) =>
    ["campaigns", campaignId, "lists", listId] as const,
  members: (campaignId: string, listId: string) =>
    ["campaigns", campaignId, "lists", listId, "members"] as const,
}

export function useVoterLists(campaignId: string) {
  return useQuery({
    queryKey: listKeys.all(campaignId),
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/lists`).json<PaginatedResponse<VoterList>>(),
    select: (data) => data.items,
    enabled: !!campaignId,
  })
}

export function useVoterList(campaignId: string, listId: string) {
  return useQuery({
    queryKey: listKeys.detail(campaignId, listId),
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/lists/${listId}`).json<VoterList>(),
    enabled: !!campaignId && !!listId,
  })
}

export function useVoterListVoters(campaignId: string, listId: string) {
  return useQuery({
    queryKey: listKeys.members(campaignId, listId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/lists/${listId}/voters`)
        .json<PaginatedResponse<Voter>>(),
    enabled: !!campaignId && !!listId,
  })
}

export function useCreateVoterList(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterListCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/lists`, { json: data }).json<VoterList>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKeys.all(campaignId) }),
  })
}

export function useUpdateVoterList(campaignId: string, listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterListUpdate) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/lists/${listId}`, { json: data })
        .json<VoterList>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKeys.all(campaignId) })
      qc.invalidateQueries({ queryKey: listKeys.detail(campaignId, listId) })
    },
  })
}

export function useDeleteVoterList(campaignId: string, listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.delete(`api/v1/campaigns/${campaignId}/lists/${listId}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKeys.all(campaignId) }),
  })
}

export function useAddListMembers(campaignId: string, listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterListMemberUpdate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/lists/${listId}/members`, { json: data })
        .json(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: listKeys.members(campaignId, listId) }),
  })
}

export function useRemoveListMembers(campaignId: string, listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterListMemberUpdate) =>
      api
        .delete(`api/v1/campaigns/${campaignId}/lists/${listId}/members`, { json: data })
        .json(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: listKeys.members(campaignId, listId) }),
  })
}
