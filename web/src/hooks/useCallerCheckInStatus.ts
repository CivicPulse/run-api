import { useQuery } from "@tanstack/react-query"
import { HTTPError } from "ky"
import { api } from "@/api/client"

/**
 * Server-side caller check-in status — source of truth for SEC-12 / H26.
 *
 * Wraps GET /api/v1/campaigns/{campaignId}/phone-bank-sessions/{sessionId}/callers/me.
 * Returns 404 when the current user is not an assigned caller for the session;
 * this is exposed as `notAssigned: true` rather than an error.
 */
export interface CallerCheckInStatus {
  id: string
  session_id: string
  user_id: string
  check_in_at: string | null
  check_out_at: string | null
  checked_in: boolean
}

export function useCallerCheckInStatus(campaignId: string, sessionId: string) {
  const query = useQuery<CallerCheckInStatus | null>({
    queryKey: ["caller-check-in", campaignId, sessionId],
    queryFn: async () => {
      try {
        return await api
          .get(
            `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers/me`,
          )
          .json<CallerCheckInStatus>()
      } catch (err) {
        if (err instanceof HTTPError && err.response.status === 404) {
          return null
        }
        throw err
      }
    },
    // Do not retry on 4xx — not-assigned is a deterministic outcome.
    retry: (failureCount, err) => {
      if (err instanceof HTTPError && err.response.status >= 400 && err.response.status < 500) {
        return false
      }
      return failureCount < 2
    },
    staleTime: 30_000,
    enabled: Boolean(campaignId) && Boolean(sessionId),
  })

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    notAssigned: query.isSuccess && query.data === null,
  }
}
