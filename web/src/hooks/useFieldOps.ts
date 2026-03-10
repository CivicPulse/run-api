import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { Turf, WalkList, CallList, PhoneBankSession, Volunteer, Shift } from "@/types/field-ops"
import type { PaginatedResponse } from "@/types/common"

export function useTurfs(campaignId: string) {
  return useQuery({
    queryKey: ["turfs", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/turfs`).json<PaginatedResponse<Turf>>(),
    enabled: !!campaignId,
  })
}

export function useWalkLists(campaignId: string) {
  return useQuery({
    queryKey: ["walk-lists", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/walk-lists`).json<PaginatedResponse<WalkList>>(),
    enabled: !!campaignId,
  })
}

export function useCallLists(campaignId: string) {
  return useQuery({
    queryKey: ["call-lists", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/call-lists`).json<PaginatedResponse<CallList>>(),
    enabled: !!campaignId,
  })
}

export function usePhoneBankSessions(campaignId: string) {
  return useQuery({
    queryKey: ["phone-bank-sessions", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/phone-bank-sessions`).json<PaginatedResponse<PhoneBankSession>>(),
    enabled: !!campaignId,
  })
}

export function useVolunteers(campaignId: string) {
  return useQuery({
    queryKey: ["volunteers", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/volunteers`).json<PaginatedResponse<Volunteer>>(),
    enabled: !!campaignId,
  })
}

export function useShifts(campaignId: string) {
  return useQuery({
    queryKey: ["shifts", campaignId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/shifts`).json<PaginatedResponse<Shift>>(),
    enabled: !!campaignId,
  })
}
