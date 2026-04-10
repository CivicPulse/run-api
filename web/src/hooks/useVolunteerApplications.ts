import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type {
  PublicVolunteerApplicationStatus,
  VolunteerApplication,
  VolunteerApplicationCreate,
} from "@/types/volunteerApplication"

export function useCurrentVolunteerApplication(token: string, enabled = true) {
  return useQuery({
    queryKey: ["public-signup-link", token, "application"],
    queryFn: () =>
      api
        .get(`api/v1/public/signup-links/${token}/application`)
        .json<PublicVolunteerApplicationStatus>(),
    enabled: enabled && !!token,
    retry: false,
  })
}

export function useCreateVolunteerApplication(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: VolunteerApplicationCreate) =>
      api
        .post(`api/v1/public/signup-links/${token}/applications`, { json: data })
        .json<VolunteerApplication>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["public-signup-link", token, "application"],
      })
    },
  })
}

export function useVolunteerApplications(campaignId: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId, "volunteer-applications"],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/volunteer-applications`)
        .json<VolunteerApplication[]>(),
    enabled: !!campaignId,
  })
}

export function useApproveVolunteerApplication(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (applicationId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/volunteer-applications/${applicationId}/approve`,
        )
        .json<VolunteerApplication>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "volunteer-applications"],
      })
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "members"],
      })
    },
  })
}

export function useRejectVolunteerApplication(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      applicationId,
      rejectionReason,
    }: {
      applicationId: string
      rejectionReason?: string | null
    }) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/volunteer-applications/${applicationId}/reject`,
          { json: { rejection_reason: rejectionReason ?? null } },
        )
        .json<VolunteerApplication>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "volunteer-applications"],
      })
    },
  })
}
