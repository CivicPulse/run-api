import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { OrgPhoneNumber } from "@/types/org"

export function useOrgNumbers() {
  return useQuery({
    queryKey: ["org", "numbers"],
    queryFn: () => api.get("api/v1/org/numbers").json<OrgPhoneNumber[]>(),
  })
}

export function useRegisterOrgNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { phone_number: string }) =>
      api.post("api/v1/org/numbers", { json: data }).json<OrgPhoneNumber>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
    },
  })
}

export function useDeleteOrgNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`api/v1/org/numbers/${id}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
      queryClient.invalidateQueries({ queryKey: ["org"] })
    },
  })
}

export function useSyncOrgNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`api/v1/org/numbers/${id}/sync`).json<OrgPhoneNumber>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
    },
  })
}

export function useSetDefaultNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      capability,
    }: {
      id: string
      capability: "voice" | "sms"
    }) =>
      api
        .patch(`api/v1/org/numbers/${id}/set-default`, {
          json: { capability },
        })
        .json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
      queryClient.invalidateQueries({ queryKey: ["org"] })
    },
  })
}
