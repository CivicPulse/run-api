import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { PaginatedResponse } from "@/types/common"
import type {
  ImportJob,
  ImportStatus,
  ImportUploadResponse,
  ImportDetectResponse,
  ImportConfirmRequest,
  ImportTemplate,
} from "@/types/import-job"

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
const importKeys = {
  all: (campaignId: string) =>
    ["campaigns", campaignId, "imports"] as const,
  detail: (campaignId: string, jobId: string) =>
    ["campaigns", campaignId, "imports", jobId] as const,
  templates: (campaignId: string) =>
    ["campaigns", campaignId, "imports", "templates"] as const,
}

// ---------------------------------------------------------------------------
// deriveStep — pure function: maps backend ImportStatus → wizard step number
//
//   1  Upload     (pending)
//   2  Detect     (uploaded)
//   3  Map        (queued | processing)
//   4  Done       (completed | failed)
// ---------------------------------------------------------------------------
export function deriveStep(status: ImportStatus | string | undefined): number {
  switch (status) {
    case "pending":
      return 1
    case "uploaded":
      return 2
    case "queued":
    case "processing":
      return 3
    case "completed":
    case "failed":
      return 4
    default:
      return 1
  }
}

// ---------------------------------------------------------------------------
// useInitiateImport — POST /api/v1/campaigns/{campaignId}/imports
// Returns ImportUploadResponse { job_id, upload_url, expires_in }
// ---------------------------------------------------------------------------
export function useInitiateImport(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { filename: string }) =>
      api
        .post(`api/v1/campaigns/${campaignId}/imports`, {
          searchParams: { original_filename: data.filename },
        })
        .json<ImportUploadResponse>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: importKeys.all(campaignId) }),
  })
}

// ---------------------------------------------------------------------------
// useDetectColumns — POST /api/v1/campaigns/{campaignId}/imports/{jobId}/detect
// Returns ImportDetectResponse { detected_columns, suggested_mapping }
// ---------------------------------------------------------------------------
export function useDetectColumns(campaignId: string, jobId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/imports/${jobId}/detect`)
        .json<ImportDetectResponse>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: importKeys.detail(campaignId, jobId) }),
  })
}

// ---------------------------------------------------------------------------
// useConfirmMapping — POST /api/v1/campaigns/{campaignId}/imports/{jobId}/confirm
// Body: ImportConfirmRequest { field_mapping, save_as_template? }
// ---------------------------------------------------------------------------
export function useConfirmMapping(campaignId: string, jobId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ImportConfirmRequest) =>
      api
        .post(`api/v1/campaigns/${campaignId}/imports/${jobId}/confirm`, {
          json: data,
        })
        .json<{ job_id: string; status: ImportStatus }>(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: importKeys.detail(campaignId, jobId) }),
  })
}

// ---------------------------------------------------------------------------
// useImportJob — GET /api/v1/campaigns/{campaignId}/imports/{jobId}
// Polls every 3 s while status is not completed/failed.
// ---------------------------------------------------------------------------
export function useImportJob(
  campaignId: string,
  jobId: string,
  polling = false,
) {
  return useQuery({
    queryKey: importKeys.detail(campaignId, jobId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/imports/${jobId}`)
        .json<ImportJob>(),
    enabled: !!campaignId && !!jobId,
    refetchInterval: polling
      ? (query) => {
          const status = query.state.data?.status
          return status === "completed" || status === "failed" ? false : 3000
        }
      : false,
  })
}

// ---------------------------------------------------------------------------
// useImports — GET /api/v1/campaigns/{campaignId}/imports
// Returns PaginatedResponse<ImportJob>.
// Polls every 3 s when any job is queued or processing.
// ---------------------------------------------------------------------------
export function useImports(campaignId: string) {
  return useQuery({
    queryKey: importKeys.all(campaignId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/imports`)
        .json<PaginatedResponse<ImportJob>>(),
    enabled: !!campaignId,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? []
      const hasActive = items.some(
        (j) => j.status !== "completed" && j.status !== "failed",
      )
      return hasActive ? 3000 : false
    },
  })
}

// ---------------------------------------------------------------------------
// useImportTemplates — GET /api/v1/campaigns/{campaignId}/imports/templates
// Returns ImportTemplate[]
// ---------------------------------------------------------------------------
export function useImportTemplates(campaignId: string) {
  return useQuery({
    queryKey: importKeys.templates(campaignId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/imports/templates`)
        .json<ImportTemplate[]>(),
    enabled: !!campaignId,
  })
}
