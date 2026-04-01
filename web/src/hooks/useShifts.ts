import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { PaginatedResponse } from "@/types/common"
import type { Shift } from "@/types/field-ops"
import type {
  ShiftCreate,
  ShiftUpdate,
  ShiftSignupResponse,
  CheckInResponse,
  HoursAdjustment,
  ShiftStatusUpdate,
} from "@/types/shift"

export const shiftKeys = {
  all: (campaignId: string) => ["shifts", campaignId] as const,
  detail: (campaignId: string, shiftId: string) =>
    ["shifts", campaignId, shiftId] as const,
  volunteers: (campaignId: string, shiftId: string) =>
    ["shifts", campaignId, shiftId, "volunteers"] as const,
  list: (
    campaignId: string,
    filters?: Record<string, string | undefined>,
  ) => ["shifts", campaignId, "list", filters] as const,
}

// --- Shift queries ---

export function useShiftList(
  campaignId: string,
  filters?: { status?: string; type?: string },
) {
  return useQuery({
    queryKey: shiftKeys.list(campaignId, filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set("status", filters.status)
      if (filters?.type) params.set("type", filters.type)
      const qs = params.toString()
      return api
        .get(`api/v1/campaigns/${campaignId}/shifts${qs ? "?" + qs : ""}`)
        .json<PaginatedResponse<Shift>>()
    },
    enabled: !!campaignId,
  })
}

export function useShiftDetail(campaignId: string, shiftId: string) {
  return useQuery({
    queryKey: shiftKeys.detail(campaignId, shiftId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/shifts/${shiftId}`)
        .json<Shift>(),
    enabled: !!campaignId && !!shiftId,
  })
}

export function useShiftVolunteers(campaignId: string, shiftId: string) {
  return useQuery({
    queryKey: shiftKeys.volunteers(campaignId, shiftId),
    // API returns a raw array (not paginated) — response_model=list[ShiftSignupResponse]
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/shifts/${shiftId}/volunteers`)
        .json<ShiftSignupResponse[]>(),
    enabled: !!campaignId && !!shiftId,
  })
}

// --- Shift mutations ---

export function useCreateShift(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ShiftCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/shifts`, { json: data })
        .json<Shift>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) }),
  })
}

export function useUpdateShift(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ShiftUpdate) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/shifts/${shiftId}`, {
          json: data,
        })
        .json<Shift>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
    },
  })
}

export function useUpdateShiftStatus(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ShiftStatusUpdate) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/shifts/${shiftId}/status`, {
          json: data,
        })
        .json<Shift>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
    },
  })
}

export function useDeleteShift(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (shiftId: string) =>
      api
        .delete(`api/v1/campaigns/${campaignId}/shifts/${shiftId}`)
        .then(() => undefined),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) }),
  })
}

// --- Volunteer signup mutations ---

export function useSelfSignup(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/shifts/${shiftId}/signup`)
        .json<ShiftSignupResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
      qc.invalidateQueries({
        queryKey: shiftKeys.volunteers(campaignId, shiftId),
      })
    },
  })
}

export function useCancelSignup(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .delete(`api/v1/campaigns/${campaignId}/shifts/${shiftId}/signup`)
        .then(() => undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
      qc.invalidateQueries({
        queryKey: shiftKeys.volunteers(campaignId, shiftId),
      })
    },
  })
}

// --- Manager volunteer management mutations ---

export function useAssignVolunteer(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (volunteerId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/shifts/${shiftId}/assign/${volunteerId}`,
        )
        .json<ShiftSignupResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
      qc.invalidateQueries({
        queryKey: shiftKeys.volunteers(campaignId, shiftId),
      })
    },
  })
}

export function useRemoveVolunteer(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (volunteerId: string) =>
      api
        .delete(
          `api/v1/campaigns/${campaignId}/shifts/${shiftId}/volunteers/${volunteerId}`,
        )
        .then(() => undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shiftKeys.all(campaignId) })
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
      qc.invalidateQueries({
        queryKey: shiftKeys.volunteers(campaignId, shiftId),
      })
    },
  })
}

// --- Check-in/out mutations ---

export function useCheckInVolunteer(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (volunteerId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/shifts/${shiftId}/check-in/${volunteerId}`,
        )
        .json<CheckInResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
      qc.invalidateQueries({
        queryKey: shiftKeys.volunteers(campaignId, shiftId),
      })
    },
  })
}

export function useCheckOutVolunteer(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (volunteerId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/shifts/${shiftId}/check-out/${volunteerId}`,
        )
        .json<CheckInResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
      qc.invalidateQueries({
        queryKey: shiftKeys.volunteers(campaignId, shiftId),
      })
    },
  })
}

// --- Hours adjustment ---

export function useAdjustHours(campaignId: string, shiftId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      volunteerId,
      data,
    }: {
      volunteerId: string
      data: HoursAdjustment
    }) =>
      api
        .patch(
          `api/v1/campaigns/${campaignId}/shifts/${shiftId}/volunteers/${volunteerId}/hours`,
          { json: data },
        )
        .json<CheckInResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: shiftKeys.detail(campaignId, shiftId),
      })
      qc.invalidateQueries({
        queryKey: shiftKeys.volunteers(campaignId, shiftId),
      })
    },
  })
}
