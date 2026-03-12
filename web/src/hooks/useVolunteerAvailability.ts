import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { AvailabilityResponse } from "@/types/volunteer"
import { volunteerKeys } from "@/hooks/useVolunteers"

const availabilityKeys = {
  all: (campaignId: string, volunteerId: string) =>
    ["volunteer-availability", campaignId, volunteerId] as const,
}

export function useVolunteerAvailability(
  campaignId: string,
  volunteerId: string,
) {
  return useQuery({
    queryKey: availabilityKeys.all(campaignId, volunteerId),
    queryFn: () =>
      api
        .get(
          `api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability`,
        )
        .json<AvailabilityResponse[]>(),
    enabled: !!campaignId && !!volunteerId,
  })
}

export function useAddAvailability(campaignId: string, volunteerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { start_at: string; end_at: string }) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability`,
          { json: data },
        )
        .json<AvailabilityResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: availabilityKeys.all(campaignId, volunteerId),
      })
      qc.invalidateQueries({
        queryKey: volunteerKeys.detail(campaignId, volunteerId),
      })
    },
  })
}

export function useDeleteAvailability(
  campaignId: string,
  volunteerId: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (availabilityId: string) =>
      api
        .delete(
          `api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability/${availabilityId}`,
        )
        .json(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: availabilityKeys.all(campaignId, volunteerId),
      })
      qc.invalidateQueries({
        queryKey: volunteerKeys.detail(campaignId, volunteerId),
      })
    },
  })
}
