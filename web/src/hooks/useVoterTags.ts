import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { VoterTag, VoterTagCreate } from "@/types/voter-tag"

export function useCampaignTags(campaignId: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId, "tags"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/tags`).json<VoterTag[]>(),
    enabled: !!campaignId,
  })
}

export function useVoterTags(campaignId: string, voterId: string) {
  return useQuery({
    queryKey: ["voters", campaignId, voterId, "tags"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/voters/${voterId}/tags`).json<VoterTag[]>(),
    enabled: !!campaignId && !!voterId,
  })
}

export function useCreateTag(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterTagCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/tags`, { json: data }).json<VoterTag>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns", campaignId, "tags"] }),
  })
}

export function useAddTagToVoter(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      api.post(`api/v1/campaigns/${campaignId}/voters/${voterId}/tags/${tagId}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voters", campaignId, voterId, "tags"] }),
  })
}

export function useRemoveTagFromVoter(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/voters/${voterId}/tags/${tagId}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voters", campaignId, voterId, "tags"] }),
  })
}
