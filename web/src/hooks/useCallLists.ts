import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { CallListSummary, CallListDetail, CallListEntry, CallListCreate, CallListUpdate } from "@/types/call-list"

interface PaginatedResponse<T> {
  items: T[]
  pagination: { next_cursor: string | null; has_more: boolean }
}

export const callListKeys = {
  all: (campaignId: string) =>
    ["campaigns", campaignId, "call-lists"] as const,
  detail: (campaignId: string, callListId: string) =>
    ["campaigns", campaignId, "call-lists", callListId] as const,
  entries: (campaignId: string, callListId: string, status?: string) =>
    ["campaigns", campaignId, "call-lists", callListId, "entries", status ?? "all"] as const,
}

export function useCallLists(campaignId: string) {
  return useQuery({
    queryKey: callListKeys.all(campaignId),
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/call-lists`)
        .json<PaginatedResponse<CallListSummary>>(),
  })
}

export function useCallList(campaignId: string, callListId: string) {
  return useQuery({
    queryKey: callListKeys.detail(campaignId, callListId),
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/call-lists/${callListId}`)
        .json<CallListDetail>(),
    enabled: !!callListId,
  })
}

export function useCallListEntries(
  campaignId: string,
  callListId: string,
  status?: string,
) {
  return useQuery({
    queryKey: callListKeys.entries(campaignId, callListId, status),
    queryFn: () => {
      const url = status
        ? `api/v1/campaigns/${campaignId}/call-lists/${callListId}/entries?status=${status}`
        : `api/v1/campaigns/${campaignId}/call-lists/${callListId}/entries`
      return api.get(url).json<PaginatedResponse<CallListEntry>>()
    },
    enabled: !!callListId,
  })
}

export function useCreateCallList(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CallListCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/call-lists`, { json: data })
        .json<CallListDetail>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: callListKeys.all(campaignId) }),
  })
}

export function useUpdateCallList(campaignId: string, callListId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CallListUpdate) =>
      api.patch(`api/v1/campaigns/${campaignId}/call-lists/${callListId}`, { json: data })
        .json<CallListDetail>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: callListKeys.all(campaignId) })
      qc.invalidateQueries({ queryKey: callListKeys.detail(campaignId, callListId) })
    },
  })
}

export function useUpdateCallListStatus(campaignId: string, callListId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (newStatus: string) =>
      api.patch(`api/v1/campaigns/${campaignId}/call-lists/${callListId}?new_status=${encodeURIComponent(newStatus)}`)
        .json<CallListDetail>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: callListKeys.all(campaignId) })
      qc.invalidateQueries({ queryKey: callListKeys.detail(campaignId, callListId) })
    },
  })
}

export function useDeleteCallList(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (callListId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/call-lists/${callListId}`).then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: callListKeys.all(campaignId) }),
  })
}

interface AppendFromListResult {
  added: number
  skipped: number
}

export function useAppendFromList(campaignId: string, callListId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (voter_list_id: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/call-lists/${callListId}/append-from-list`,
          { json: { voter_list_id } },
        )
        .json<AppendFromListResult>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: callListKeys.detail(campaignId, callListId) })
      qc.invalidateQueries({ queryKey: callListKeys.entries(campaignId, callListId) })
    },
  })
}
