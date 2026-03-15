import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { FieldMeResponse } from "@/types/field"

export function useFieldMe(campaignId: string) {
  return useQuery({
    queryKey: ["field-me", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/field/me`).json<FieldMeResponse>(),
    enabled: !!campaignId,
    staleTime: 0,
  })
}
