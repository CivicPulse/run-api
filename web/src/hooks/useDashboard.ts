import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type {
  OverviewResponse,
  CanvasserBreakdown,
  TurfBreakdown,
  CallerBreakdown,
  SessionBreakdown,
  VolunteerBreakdown,
  ShiftBreakdown,
} from "@/types/dashboard"

export function useDashboardOverview(campaignId: string) {
  return useQuery({
    queryKey: ["dashboard", campaignId, "overview"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dashboard/overview`).json<OverviewResponse>(),
    enabled: !!campaignId,
  })
}

export function useCanvasserBreakdown(campaignId: string) {
  return useQuery({
    queryKey: ["dashboard", campaignId, "canvassing", "canvassers"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dashboard/canvassing/canvassers`).json<CanvasserBreakdown[]>(),
    enabled: !!campaignId,
  })
}

export function useTurfBreakdown(campaignId: string) {
  return useQuery({
    queryKey: ["dashboard", campaignId, "canvassing", "turfs"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dashboard/canvassing/turfs`).json<TurfBreakdown[]>(),
    enabled: !!campaignId,
  })
}

export function useCallerBreakdown(campaignId: string) {
  return useQuery({
    queryKey: ["dashboard", campaignId, "phone-banking", "callers"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dashboard/phone-banking/callers`).json<CallerBreakdown[]>(),
    enabled: !!campaignId,
  })
}

export function useSessionBreakdown(campaignId: string) {
  return useQuery({
    queryKey: ["dashboard", campaignId, "phone-banking", "sessions"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dashboard/phone-banking/sessions`).json<SessionBreakdown[]>(),
    enabled: !!campaignId,
  })
}

export function useVolunteerBreakdown(campaignId: string) {
  return useQuery({
    queryKey: ["dashboard", campaignId, "volunteers", "volunteers"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dashboard/volunteers/volunteers`).json<VolunteerBreakdown[]>(),
    enabled: !!campaignId,
  })
}

export function useShiftBreakdown(campaignId: string) {
  return useQuery({
    queryKey: ["dashboard", campaignId, "volunteers", "shifts"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dashboard/volunteers/shifts`).json<ShiftBreakdown[]>(),
    enabled: !!campaignId,
  })
}
