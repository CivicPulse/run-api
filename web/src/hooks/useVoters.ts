import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { Voter, VoterFilter, VoterInteraction, VoterCreate, VoterUpdate, VoterSearchRequest } from "@/types/voter"
import type { PaginatedResponse } from "@/types/common"

export function useVoters(campaignId: string, filters?: VoterFilter) {
  const searchParams = new URLSearchParams()
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value)) {
          for (const v of value) {
            searchParams.append(key, v)
          }
        } else {
          searchParams.set(key, String(value))
        }
      }
    }
  }
  const queryString = searchParams.toString()

  return useInfiniteQuery({
    queryKey: ["voters", campaignId, filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams(queryString)
      if (pageParam) {
        params.set("cursor", pageParam)
      }
      const qs = params.toString()
      return api
        .get(`api/v1/campaigns/${campaignId}/voters${qs ? `?${qs}` : ""}`)
        .json<PaginatedResponse<Voter>>()
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor ?? undefined : undefined,
    enabled: !!campaignId,
  })
}

export function useVoter(campaignId: string, voterId: string) {
  return useQuery({
    queryKey: ["voters", campaignId, voterId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/voters/${voterId}`).json<Voter>(),
    enabled: !!campaignId && !!voterId,
  })
}

export function useVoterInteractions(campaignId: string, voterId: string) {
  return useQuery({
    queryKey: ["voters", campaignId, voterId, "interactions"],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/voters/${voterId}/interactions`)
        .json<PaginatedResponse<VoterInteraction>>(),
    enabled: !!campaignId && !!voterId,
  })
}

export function useCreateInteraction(campaignId: string, voterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { type: string; payload: Record<string, unknown> }) =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/${voterId}/interactions`, { json: data })
        .json<VoterInteraction>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["voters", campaignId, voterId, "interactions"],
      })
    },
  })
}

export function useCreateVoter(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/voters`, { json: data }).json<Voter>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voters", campaignId] })
    },
  })
}

export function useUpdateVoter(campaignId: string, voterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterUpdate) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/voters/${voterId}`, { json: data })
        .json<Voter>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voters", campaignId] })
      queryClient.invalidateQueries({ queryKey: ["voters", campaignId, voterId] })
    },
  })
}

export interface VotersPaginatedOptions {
  cursor?: string
  pageSize?: number
  sortBy?: string
  sortDir?: "asc" | "desc"
  filters?: VoterFilter
}

/**
 * Cursor-based paginated voter query (replaces useInfiniteQuery pattern for DataTable).
 * Uses GET /voters when no filters are active, or includes filter params in query string.
 */
export function useVotersQuery(campaignId: string, options: VotersPaginatedOptions = {}) {
  const { cursor, pageSize = 50, sortBy, sortDir, filters } = options
  return useQuery({
    queryKey: ["voters", campaignId, "paginated", cursor, pageSize, sortBy, sortDir, filters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (cursor) params.set("cursor", cursor)
      if (pageSize) params.set("page_size", String(pageSize))
      if (sortBy) params.set("sort_by", sortBy)
      if (sortDir) params.set("sort_dir", sortDir)
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null && value !== "") {
            if (Array.isArray(value)) {
              for (const v of value) params.append(key, v)
            } else {
              params.set(key, String(value))
            }
          }
        }
      }
      const qs = params.toString()
      return api
        .get(`api/v1/campaigns/${campaignId}/voters${qs ? `?${qs}` : ""}`)
        .json<PaginatedResponse<Voter>>()
    },
    enabled: !!campaignId,
  })
}

// ─── Distinct Values ─────────────────────────────────────────────────────────

interface DistinctValueEntry {
  value: string
  count: number
}

type DistinctValuesResponse = Record<string, DistinctValueEntry[]>

export function useDistinctValues(campaignId: string, fields: string[]) {
  return useQuery({
    queryKey: ["voters", campaignId, "distinct-values", fields],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/voters/distinct-values`, {
          searchParams: { fields: fields.join(",") },
        })
        .json<DistinctValuesResponse>(),
    enabled: !!campaignId && fields.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSearchVoters(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: VoterSearchRequest) =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/search`, { json: data })
        .json<PaginatedResponse<Voter>>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voters", campaignId] })
    },
  })
}
