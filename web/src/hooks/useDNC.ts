import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { DNCEntry, DNCImportResult } from "@/types/dnc"

export const dncKeys = {
  all: (campaignId: string) =>
    ["campaigns", campaignId, "dnc"] as const,
}

export function useDNCEntries(campaignId: string) {
  return useQuery({
    queryKey: dncKeys.all(campaignId),
    // Backend returns DNCEntry[] directly (not paginated)
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/dnc`).json<DNCEntry[]>(),
  })
}

export function useAddDNCEntry(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { phone_number: string; reason?: string }) =>
      api.post(`api/v1/campaigns/${campaignId}/dnc`, { json: data }).json<DNCEntry>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: dncKeys.all(campaignId) }),
  })
}

export function useDeleteDNCEntry(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dncId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/dnc/${dncId}`).then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: dncKeys.all(campaignId) }),
  })
}

export function useImportDNC(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      // Use body: formData (NOT json:) — browser sets multipart/form-data boundary
      // ky interceptors adding Authorization header is fine for this endpoint (not MinIO)
      return api.post(`api/v1/campaigns/${campaignId}/dnc/import`, {
        body: formData,
      }).json<DNCImportResult>()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dncKeys.all(campaignId) }),
  })
}
