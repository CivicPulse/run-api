import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type {
  VolunteerResponse,
  VolunteerDetailResponse,
  VolunteerCreate,
  VolunteerUpdate,
} from "@/types/volunteer"
import type { PaginatedResponse } from "@/types/common"

export const volunteerKeys = {
  all: (campaignId: string) => ["volunteers", campaignId] as const,
  detail: (campaignId: string, volunteerId: string) =>
    ["volunteers", campaignId, volunteerId] as const,
  list: (campaignId: string, filters?: Record<string, string | undefined>) =>
    ["volunteers", campaignId, "list", filters] as const,
}

export function useVolunteerList(
  campaignId: string,
  filters?: { status?: string; skills?: string; name?: string },
) {
  return useQuery({
    queryKey: volunteerKeys.list(campaignId, filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set("status", filters.status)
      if (filters?.skills) params.set("skills", filters.skills)
      if (filters?.name) params.set("name", filters.name)
      const qs = params.toString()
      return api
        .get(`api/v1/campaigns/${campaignId}/volunteers${qs ? "?" + qs : ""}`)
        .json<PaginatedResponse<VolunteerResponse>>()
    },
    enabled: !!campaignId,
  })
}

export function useVolunteerDetail(campaignId: string, volunteerId: string) {
  return useQuery({
    queryKey: volunteerKeys.detail(campaignId, volunteerId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/volunteers/${volunteerId}`)
        .json<VolunteerDetailResponse>(),
    enabled: !!campaignId && !!volunteerId,
  })
}

export function useCreateVolunteer(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VolunteerCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/volunteers`, { json: data })
        .json<VolunteerResponse>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: volunteerKeys.all(campaignId) }),
  })
}

export function useUpdateVolunteer(campaignId: string, volunteerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VolunteerUpdate) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/volunteers/${volunteerId}`, {
          json: data,
        })
        .json<VolunteerResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: volunteerKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: volunteerKeys.detail(campaignId, volunteerId),
      })
    },
  })
}

export function useUpdateVolunteerStatus(
  campaignId: string,
  volunteerId: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: string) =>
      api
        .patch(
          `api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/status`,
          { json: { status } },
        )
        .json<VolunteerResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: volunteerKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: volunteerKeys.detail(campaignId, volunteerId),
      })
    },
  })
}

export function useSelfRegister(campaignId: string) {
  return useMutation({
    mutationFn: (data: VolunteerCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/volunteers/register`, {
          json: data,
        })
        .then((res) => res.json()),
  })
}
