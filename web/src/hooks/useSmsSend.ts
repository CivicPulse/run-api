import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/api/client"
import type {
  SmsBulkSendPayload,
  SmsBulkSendResponse,
  SmsConversationDetail,
  SmsComposePayload,
  SmsSendResponse,
} from "@/types/sms"

const smsInboxKeys = {
  list: (campaignId: string) => ["campaigns", campaignId, "sms", "conversations"] as const,
  detail: (campaignId: string, conversationId: string) =>
    ["campaigns", campaignId, "sms", "conversations", conversationId] as const,
}

export function useSmsSend(campaignId: string) {
  const queryClient = useQueryClient()

  const sendMessage = useMutation({
    mutationFn: (payload: SmsComposePayload) =>
      api
        .post(`api/v1/campaigns/${campaignId}/sms/send`, { json: payload })
        .json<SmsSendResponse>(),
    onSuccess: (result) => {
      toast.success("SMS sent")
      void queryClient.invalidateQueries({ queryKey: smsInboxKeys.list(campaignId) })
      queryClient.setQueryData<SmsConversationDetail | undefined>(
        smsInboxKeys.detail(campaignId, result.conversation.id),
        (current) => ({
          conversation: result.conversation,
          messages: [...(current?.messages ?? []), result.message],
          eligibility: result.eligibility,
          budget: result.budget ?? current?.budget ?? null,
        }),
      )
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to send SMS"
      toast.error(message)
    },
  })

  const bulkSend = useMutation({
    mutationFn: (payload: SmsBulkSendPayload) =>
      api
        .post(`api/v1/campaigns/${campaignId}/sms/bulk-send`, { json: payload })
        .json<SmsBulkSendResponse>(),
    onSuccess: (result) => {
      toast.success(`Queued ${result.queued_count} SMS${result.queued_count === 1 ? "" : " messages"}`)
      void queryClient.invalidateQueries({ queryKey: smsInboxKeys.list(campaignId) })
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to queue bulk SMS"
      toast.error(message)
    },
  })

  return { sendMessage, bulkSend }
}
