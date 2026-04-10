import { useEffect, useMemo, useState } from "react"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { AlertTriangle, MessageSquare, Send, Wallet } from "lucide-react"
import { SmsBulkSendSheet } from "@/components/field/SmsBulkSendSheet"
import { SmsComposer } from "@/components/field/SmsComposer"
import { SmsConversationList } from "@/components/field/SmsConversationList"
import { SmsThreadPanel } from "@/components/field/SmsThreadPanel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSmsInbox } from "@/hooks/useSmsInbox"
import { useSmsSend } from "@/hooks/useSmsSend"
import type { SmsBulkSendResponse } from "@/types/sms"

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking/messages")({
  component: MessagesPage,
})

function MessagesPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/messages",
  })
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    null,
  )
  const [bulkOpen, setBulkOpen] = useState(false)
  const [lastBulkResult, setLastBulkResult] = useState<SmsBulkSendResponse | null>(
    null,
  )

  // First call just loads the conversation list so we can derive a default
  // selection. The list query is keyed by campaign only, so TanStack Query
  // dedupes the network request with the second call below.
  const { conversations, isListLoading } = useSmsInbox(campaignId, null)

  // Fall back to the first conversation until the user makes an explicit
  // selection. Derived during render to avoid a setState-in-effect.
  const effectiveConversationId =
    selectedConversationId ?? conversations[0]?.id ?? null

  const {
    selectedConversation,
    isDetailLoading,
    markRead,
  } = useSmsInbox(campaignId, effectiveConversationId)
  const { sendMessage, bulkSend } = useSmsSend(campaignId)

  useEffect(() => {
    if (
      selectedConversation?.conversation.id &&
      selectedConversation.conversation.unread_count > 0
    ) {
      markRead.mutate(selectedConversation.conversation.id)
    }
  }, [markRead, selectedConversation])

  const recipientCount = useMemo(
    () => conversations.filter((conversation) => conversation.opt_out_status !== "opted_out").length,
    [conversations],
  )

  async function handleSend(body: string) {
    if (!selectedConversation?.eligibility.voter_phone_id) {
      return
    }
    await sendMessage.mutateAsync({
      voter_id: selectedConversation.conversation.voter_id,
      voter_phone_id: selectedConversation.eligibility.voter_phone_id,
      body,
    })
  }

  async function handleBulkQueue(body: string) {
    const voterPhoneIds = conversations
      .map((conversation) => conversation.voter_phone_id)
      .filter((value): value is string => value !== null && value !== undefined)

    const result = await bulkSend.mutateAsync({
      voter_phone_ids: voterPhoneIds,
      body,
    })
    setLastBulkResult(result)
    setBulkOpen(false)
  }

  const budget = selectedConversation?.budget ?? lastBulkResult?.budget ?? null
  const budgetState = budget?.state ?? "healthy"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Messages</h2>
          <p className="text-sm text-muted-foreground">
            Work reply conversations and queue campaign SMS without leaving phone
            banking.
          </p>
        </div>
        <Button type="button" onClick={() => setBulkOpen(true)}>
          <Send className="mr-2 h-4 w-4" />
          Send Bulk SMS
        </Button>
      </div>

      {budget && budgetState !== "healthy" ? (
        <Alert
          variant={budgetState === "over_limit" ? "destructive" : "default"}
          data-testid="messages-budget-banner"
        >
          {budgetState === "over_limit" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          <AlertTitle>
            {budgetState === "over_limit"
              ? "SMS sending is paused by the org soft budget"
              : budgetState === "near_limit"
                ? "SMS spend is nearing the org soft budget"
                : "Some SMS costs are still pending"}
          </AlertTitle>
          <AlertDescription>
            {budgetState === "over_limit"
              ? "New messages cannot start until an org owner raises the Twilio spend limit."
              : budgetState === "near_limit"
                ? "You can still send messages, but Twilio spend is close to the configured threshold."
                : "Some recently sent messages do not have final Twilio pricing yet."}
          </AlertDescription>
        </Alert>
      ) : null}

      {lastBulkResult ? (
        <Card data-testid="bulk-send-status-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bulk SMS in progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">
              Queued: {lastBulkResult.queued_count}
            </span>
            <span className="font-mono tabular-nums">
              Blocked: {lastBulkResult.blocked_count}
            </span>
            <span className="font-mono text-xs">
              Job: {lastBulkResult.job_id}
            </span>
          </CardContent>
        </Card>
      ) : null}

      <div
        data-testid="messages-layout"
        className="flex flex-col gap-4 xl:grid xl:grid-cols-[320px_minmax(0,1fr)]"
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <SmsConversationList
              conversations={conversations}
              selectedConversationId={effectiveConversationId}
              isLoading={isListLoading}
              onSelect={setSelectedConversationId}
            />
          </CardContent>
        </Card>

        <SmsThreadPanel detail={selectedConversation} isLoading={isDetailLoading}>
          {selectedConversation ? (
            <SmsComposer
              eligibility={selectedConversation.eligibility}
              conversationId={selectedConversation.conversation.id}
              isPending={sendMessage.isPending}
              onSend={handleSend}
            />
          ) : conversations.length === 0 && !isListLoading ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No SMS conversations yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Replies and sent texts will appear here once the campaign sends a
                message or a voter replies.
              </p>
            </div>
          ) : null}
        </SmsThreadPanel>
      </div>

      <SmsBulkSendSheet
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        recipientCount={recipientCount}
        isPending={bulkSend.isPending}
        onSubmit={handleBulkQueue}
      />
    </div>
  )
}
