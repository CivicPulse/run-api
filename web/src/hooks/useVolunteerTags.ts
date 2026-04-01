import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { VolunteerTagResponse } from "@/types/volunteer"
import { volunteerKeys } from "@/hooks/useVolunteers"

export const volunteerTagKeys = {
  all: (campaignId: string) => ["volunteer-tags", campaignId] as const,
}

export function useVolunteerCampaignTags(campaignId: string) {
  return useQuery({
    queryKey: volunteerTagKeys.all(campaignId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/volunteer-tags`)
        .json<VolunteerTagResponse[]>(),
    enabled: !!campaignId,
  })
}

export function useCreateVolunteerTag(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string }) =>
      api
        .post(`api/v1/campaigns/${campaignId}/volunteer-tags`, { json: data })
        .json<VolunteerTagResponse>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: volunteerTagKeys.all(campaignId) }),
  })
}

export function useUpdateVolunteerTag(campaignId: string, tagId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string }) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/volunteer-tags/${tagId}`, {
          json: data,
        })
        .json<VolunteerTagResponse>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: volunteerTagKeys.all(campaignId) }),
  })
}

export function useDeleteVolunteerTag(campaignId: string, tagId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .delete(`api/v1/campaigns/${campaignId}/volunteer-tags/${tagId}`)
        .json(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: volunteerTagKeys.all(campaignId) }),
  })
}

export function useAddTagToVolunteer(
  campaignId: string,
  volunteerId: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/tags/${tagId}`,
        )
        .json(),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: volunteerKeys.detail(campaignId, volunteerId),
      }),
  })
}

export function useRemoveTagFromVolunteer(
  campaignId: string,
  volunteerId: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      api
        .delete(
          `api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/tags/${tagId}`,
        )
        // API returns 204 No Content — do not call .json()
        .then(() => undefined),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: volunteerKeys.detail(campaignId, volunteerId),
      }),
  })
}
