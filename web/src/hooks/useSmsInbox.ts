import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type {
  SmsConversation,
  SmsConversationDetail,
} from "@/types/sms"

const smsInboxKeys = {
  list: (campaignId: string) => ["campaigns", campaignId, "sms", "conversations"] as const,
  detail: (campaignId: string, conversationId: string) =>
    ["campaigns", campaignId, "sms", "conversations", conversationId] as const,
}

export function useSmsInbox(
  campaignId: string,
  selectedConversationId: string | null,
) {
  const queryClient = useQueryClient()

  const conversations = useQuery({
    queryKey: smsInboxKeys.list(campaignId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/sms/conversations`)
        .json<SmsConversation[]>(),
    enabled: !!campaignId,
  })

  const selectedConversation = useQuery({
    queryKey:
      selectedConversationId === null
        ? ["campaigns", campaignId, "sms", "conversations", "none"]
        : smsInboxKeys.detail(campaignId, selectedConversationId),
    queryFn: () =>
      api
        .get(
          `api/v1/campaigns/${campaignId}/sms/conversations/${selectedConversationId}`,
        )
        .json<SmsConversationDetail>(),
    enabled: !!campaignId && !!selectedConversationId,
  })

  const markRead = useMutation({
    mutationFn: (conversationId: string) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/sms/conversations/${conversationId}/read`,
        )
        .json<SmsConversation>(),
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData<SmsConversation[] | undefined>(
        smsInboxKeys.list(campaignId),
        (current) =>
          current?.map((conversation) =>
            conversation.id === updatedConversation.id
              ? { ...conversation, unread_count: 0 }
              : conversation,
          ) ?? current,
      )

      queryClient.setQueryData<SmsConversationDetail | undefined>(
        smsInboxKeys.detail(campaignId, updatedConversation.id),
        (current) =>
          current
            ? {
                ...current,
                conversation: {
                  ...current.conversation,
                  unread_count: 0,
                },
              }
            : current,
      )
    },
  })

  return {
    conversations: conversations.data ?? [],
    isListLoading: conversations.isLoading,
    selectedConversation: selectedConversation.data,
    isDetailLoading: selectedConversation.isLoading,
    markRead,
  }
}
