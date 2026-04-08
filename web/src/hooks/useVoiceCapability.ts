import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { CallMode, VoiceCapabilityResponse } from "@/types/voice"
import type { TwilioBudgetSummary } from "@/types/org"

export function useVoiceCapability(campaignId: string): {
  mode: CallMode
  isLoading: boolean
  budget: TwilioBudgetSummary | null
} {
  const { data, isLoading } = useQuery({
    queryKey: ["voice", "capability", campaignId],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/voice/capability`)
        .json<VoiceCapabilityResponse>(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!campaignId,
  })

  const browserSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices

  const mode: CallMode =
    data?.browser_call_available && browserSupported ? "browser" : "tel"

  return { mode, isLoading, budget: data?.budget ?? null }
}
