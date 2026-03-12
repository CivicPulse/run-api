import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { VolunteerHoursResponse } from "@/types/volunteer"

export function useVolunteerHours(campaignId: string, volunteerId: string) {
  return useQuery({
    queryKey: ["volunteer-hours", campaignId, volunteerId] as const,
    queryFn: () =>
      api
        .get(
          `api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/hours`,
        )
        .json<VolunteerHoursResponse>(),
    enabled: !!campaignId && !!volunteerId,
  })
}
