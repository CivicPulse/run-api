import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type {
  PhoneBankSession,
  SessionCaller,
  SessionCreate,
  SessionUpdate,
  RecordCallPayload,
  SessionProgressResponse,
} from "@/types/phone-bank-session"
import type { CallListEntry } from "@/types/call-list"

interface PaginatedResponse<T> {
  items: T[]
  pagination: { next_cursor: string | null; has_more: boolean }
}

export const sessionKeys = {
  all: (campaignId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions"] as const,
  detail: (campaignId: string, sessionId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions", sessionId] as const,
  callers: (campaignId: string, sessionId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions", sessionId, "callers"] as const,
  progress: (campaignId: string, sessionId: string) =>
    ["campaigns", campaignId, "phone-bank-sessions", sessionId, "progress"] as const,
}

// --- Session queries ---

export function usePhoneBankSessions(campaignId: string) {
  return useQuery({
    queryKey: sessionKeys.all(campaignId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/phone-bank-sessions`)
        .json<PaginatedResponse<PhoneBankSession>>(),
  })
}

export function useMyPhoneBankSessions(campaignId: string) {
  return useQuery({
    queryKey: [...sessionKeys.all(campaignId), "mine"],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/phone-bank-sessions?assigned_to_me=true`)
        .json<PaginatedResponse<PhoneBankSession>>(),
  })
}

export function usePhoneBankSession(campaignId: string, sessionId: string) {
  return useQuery({
    queryKey: sessionKeys.detail(campaignId, sessionId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}`)
        .json<PhoneBankSession>(),
    enabled: !!sessionId,
  })
}

// --- Session mutations ---

export function useCreatePhoneBankSession(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SessionCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/phone-bank-sessions`, { json: data })
        .json<PhoneBankSession>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.all(campaignId) }),
  })
}

export function useUpdateSessionStatus(campaignId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SessionUpdate) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}`, {
          json: data,
        })
        .json<PhoneBankSession>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.detail(campaignId, sessionId) })
      qc.invalidateQueries({ queryKey: sessionKeys.all(campaignId) })
    },
  })
}

export function useDeletePhoneBankSession(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      api
        .delete(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}`)
        .then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.all(campaignId) }),
  })
}

// --- Caller management ---

export function useSessionCallers(campaignId: string, sessionId: string) {
  return useQuery({
    queryKey: sessionKeys.callers(campaignId, sessionId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers`)
        .json<SessionCaller[]>(),
    enabled: !!sessionId,
  })
}

export function useAssignCaller(campaignId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers`,
          { json: { user_id: userId } },
        )
        .json<SessionCaller>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: sessionKeys.callers(campaignId, sessionId) }),
  })
}

export function useRemoveCaller(campaignId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .delete(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers/${userId}`,
        )
        .then(() => undefined),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: sessionKeys.callers(campaignId, sessionId) }),
  })
}

export function useCheckIn(campaignId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/check-in`,
        )
        .json<SessionCaller>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.detail(campaignId, sessionId) })
      qc.invalidateQueries({ queryKey: sessionKeys.callers(campaignId, sessionId) })
    },
  })
}

export function useCheckOut(campaignId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/check-out`,
        )
        .json<SessionCaller>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.detail(campaignId, sessionId) })
      qc.invalidateQueries({ queryKey: sessionKeys.callers(campaignId, sessionId) })
    },
  })
}

// --- Calling screen mutations ---

export function useClaimEntry(campaignId: string, callListId: string) {
  return useMutation({
    mutationFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/call-lists/${callListId}/claim`, {
          json: { batch_size: 1 },
        })
        .json<CallListEntry[]>(),
    // No cache invalidation — claim is a stateful operation; calling screen manages state locally
  })
}

export function useRecordCall(campaignId: string, sessionId: string) {
  return useMutation({
    mutationFn: (data: RecordCallPayload) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/calls`,
          { json: data },
        )
        .json<{ id: string; result_code: string; interaction_id: string }>(),
  })
}

export function useSelfReleaseEntry(campaignId: string, sessionId: string) {
  return useMutation({
    mutationFn: (entryId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/entries/${entryId}/self-release`,
        )
        .json<CallListEntry>(),
  })
}

export function useReassignEntry(campaignId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entryId, newCallerId }: { entryId: string; newCallerId: string }) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/entries/${entryId}/reassign`,
          { json: { new_caller_id: newCallerId } },
        )
        .json<CallListEntry>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: sessionKeys.progress(campaignId, sessionId) }),
  })
}

// --- Progress (polling) ---

export function useSessionProgress(campaignId: string, sessionId: string) {
  return useQuery({
    queryKey: sessionKeys.progress(campaignId, sessionId),
    queryFn: () =>
      api
        .get(
          `api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/progress`,
        )
        .json<SessionProgressResponse>(),
    refetchInterval: (query) => {
      const data = query.state.data as SessionProgressResponse | undefined
      // Stop polling when no work remains
      if (data && data.available === 0 && data.in_progress === 0) return false
      return 30_000
    },
    enabled: !!sessionId,
  })
}
