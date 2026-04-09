import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { SignupLink, SignupLinkCreate } from "@/types/signupLink"

export function useSignupLinks(campaignId: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId, "signup-links"],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/signup-links`).json<SignupLink[]>(),
    enabled: !!campaignId,
  })
}

export function useCreateSignupLink(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SignupLinkCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/signup-links`, { json: data })
        .json<SignupLink>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "signup-links"],
      })
    },
  })
}

export function useDisableSignupLink(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) =>
      api
        .post(`api/v1/campaigns/${campaignId}/signup-links/${linkId}/disable`)
        .json<SignupLink>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "signup-links"],
      })
    },
  })
}

export function useRegenerateSignupLink(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) =>
      api
        .post(`api/v1/campaigns/${campaignId}/signup-links/${linkId}/regenerate`)
        .json<SignupLink>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaigns", campaignId, "signup-links"],
      })
    },
  })
}
