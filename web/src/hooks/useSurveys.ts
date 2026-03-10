import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type {
  ScriptResponse,
  ScriptDetailResponse,
  ScriptCreate,
  ScriptUpdate,
  QuestionResponse,
  QuestionCreate,
  QuestionUpdate,
  BatchResponseCreate,
  SurveyResponseOut,
} from "@/types/survey"
import type { PaginatedResponse } from "@/types/common"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Script hooks
// ---------------------------------------------------------------------------

export function useSurveyScripts(campaignId: string, statusFilter?: string) {
  const searchParams = new URLSearchParams()
  if (statusFilter) searchParams.set("status_filter", statusFilter)
  const qs = searchParams.toString()
  const url = `api/v1/campaigns/${campaignId}/surveys${qs ? `?${qs}` : ""}`

  return useQuery({
    queryKey: ["surveys", campaignId, statusFilter],
    queryFn: () => api.get(url).json<PaginatedResponse<ScriptResponse>>(),
    enabled: !!campaignId,
  })
}

export function useSurveyScript(campaignId: string, scriptId: string) {
  return useQuery({
    queryKey: ["surveys", campaignId, scriptId],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/surveys/${scriptId}`)
        .json<ScriptDetailResponse>(),
    enabled: !!campaignId && !!scriptId,
  })
}

export function useCreateScript(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ScriptCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/surveys`, { json: data })
        .json<ScriptResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surveys", campaignId] })
      toast.success("Survey script created")
    },
    onError: () => toast.error("Failed to create survey script"),
  })
}

export function useUpdateScript(campaignId: string, scriptId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ScriptUpdate) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/surveys/${scriptId}`, {
          json: data,
        })
        .json<ScriptResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surveys", campaignId] })
      toast.success("Survey script updated")
    },
    onError: () => toast.error("Failed to update survey script"),
  })
}

export function useDeleteScript(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scriptId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/surveys/${scriptId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surveys", campaignId] })
      toast.success("Survey script deleted")
    },
    onError: () => toast.error("Failed to delete survey script"),
  })
}

// ---------------------------------------------------------------------------
// Question hooks
// ---------------------------------------------------------------------------

export function useAddQuestion(campaignId: string, scriptId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: QuestionCreate) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/surveys/${scriptId}/questions`,
          { json: data },
        )
        .json<QuestionResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["surveys", campaignId, scriptId],
      })
      toast.success("Question added")
    },
    onError: () => toast.error("Failed to add question"),
  })
}

export function useUpdateQuestion(
  campaignId: string,
  scriptId: string,
  questionId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: QuestionUpdate) =>
      api
        .patch(
          `api/v1/campaigns/${campaignId}/surveys/${scriptId}/questions/${questionId}`,
          { json: data },
        )
        .json<QuestionResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["surveys", campaignId, scriptId],
      })
      toast.success("Question updated")
    },
    onError: () => toast.error("Failed to update question"),
  })
}

export function useDeleteQuestion(campaignId: string, scriptId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (questionId: string) =>
      api.delete(
        `api/v1/campaigns/${campaignId}/surveys/${scriptId}/questions/${questionId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["surveys", campaignId, scriptId],
      })
      toast.success("Question deleted")
    },
    onError: () => toast.error("Failed to delete question"),
  })
}

export function useReorderQuestions(campaignId: string, scriptId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (questionIds: string[]) =>
      api
        .put(
          `api/v1/campaigns/${campaignId}/surveys/${scriptId}/questions/order`,
          { json: questionIds },
        )
        .json<QuestionResponse[]>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["surveys", campaignId, scriptId],
      })
    },
    onError: () => toast.error("Failed to reorder questions"),
  })
}

// ---------------------------------------------------------------------------
// Response hooks
// ---------------------------------------------------------------------------

export function useRecordResponses(campaignId: string, scriptId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: BatchResponseCreate) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/surveys/${scriptId}/responses`,
          { json: data },
        )
        .json<SurveyResponseOut[]>(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          "survey-responses",
          campaignId,
          scriptId,
          variables.voter_id,
        ],
      })
      toast.success("Responses recorded")
    },
    onError: () => toast.error("Failed to record responses"),
  })
}

export function useVoterResponses(
  campaignId: string,
  scriptId: string,
  voterId: string,
) {
  return useQuery({
    queryKey: ["survey-responses", campaignId, scriptId, voterId],
    queryFn: () =>
      api
        .get(
          `api/v1/campaigns/${campaignId}/surveys/${scriptId}/voters/${voterId}/responses`,
        )
        .json<SurveyResponseOut[]>(),
    enabled: !!campaignId && !!scriptId && !!voterId,
  })
}
