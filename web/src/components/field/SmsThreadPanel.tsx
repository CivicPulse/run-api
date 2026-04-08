import { formatDistanceToNow } from "date-fns"
import { MessageSquareText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { SmsConversationDetail } from "@/types/sms"

interface SmsThreadPanelProps {
  detail?: SmsConversationDetail
  isLoading?: boolean
  children?: React.ReactNode
}

function formatTimestamp(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

export function SmsThreadPanel({
  detail,
  isLoading = false,
  children,
}: SmsThreadPanelProps) {
  if (isLoading) {
    return (
      <Card className="min-h-[420px]">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!detail) {
    return (
      <Card className="min-h-[420px] border-dashed">
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center text-center">
          <MessageSquareText className="h-8 w-8 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">Select a conversation</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Choose a thread from the inbox to review the message history and continue the conversation.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex min-h-[420px] flex-col">
      <CardHeader className="border-b">
        <CardTitle className="text-base">
          {detail.conversation.normalized_to_number}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {detail.messages.length} message{detail.messages.length === 1 ? "" : "s"} in this thread
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {detail.messages.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              This conversation does not have any messages yet.
            </div>
          ) : (
            detail.messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                  message.direction === "outbound"
                    ? "ml-auto bg-slate-900 text-white"
                    : "mr-auto border bg-slate-50 text-slate-900",
                )}
              >
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                <div
                  className={cn(
                    "mt-2 flex items-center justify-between gap-3 text-[11px]",
                    message.direction === "outbound"
                      ? "text-slate-200"
                      : "text-muted-foreground",
                  )}
                >
                  <span>{formatTimestamp(message.created_at)}</span>
                  <span>{message.provider_status}</span>
                </div>
              </div>
            ))
          )}
        </div>
        {children ? (
          <div className="border-t bg-background p-4">{children}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}
