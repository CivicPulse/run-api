import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/api/client"
import type { Voter, VoterInteraction, VoterCreate, VoterUpdate, VoterSearchBody } from "@/types/voter"
import type { PaginatedResponse } from "@/types/common"

export function useVoterSearch(campaignId: string, body: VoterSearchBody) {
  return useQuery({
    queryKey: ["voters", campaignId, "search", body],
    queryFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/search`, { json: body })
        .json<PaginatedResponse<Voter>>(),
    placeholderData: keepPreviousData,
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

export function useDeleteVoter(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (voterId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/voters/${voterId}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voters", campaignId] })
      toast.success("Voter deleted")
    },
    onError: () => toast.error("Failed to delete voter"),
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

