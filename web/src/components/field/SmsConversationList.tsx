import { formatDistanceToNow } from "date-fns"
import { MessageSquare } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { SmsConversation } from "@/types/sms"

interface SmsConversationListProps {
  conversations: SmsConversation[]
  selectedConversationId: string | null
  isLoading?: boolean
  onSelect: (conversationId: string) => void
}

function formatLastMessageAt(value?: string | null) {
  if (!value) return "No messages yet"
  return `${formatDistanceToNow(new Date(value))} ago`
}

export function SmsConversationList({
  conversations,
  selectedConversationId,
  isLoading = false,
  onSelect,
}: SmsConversationListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="rounded-xl border p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">No SMS conversations yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Replies will appear here once staff start texting from the campaign inbox.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {conversations.map((conversation) => {
        const isSelected = conversation.id === selectedConversationId
        return (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition-colors",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:bg-muted/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {conversation.normalized_to_number}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {conversation.last_message_preview ?? "No message preview yet"}
                </p>
              </div>
              {conversation.unread_count > 0 ? (
                <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                  {conversation.unread_count}
                </Badge>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {formatLastMessageAt(conversation.last_message_at)}
              </span>
              <Badge
                variant={
                  conversation.last_message_status === "delivered"
                    ? "outline"
                    : conversation.last_message_status === "failed"
                      ? "destructive"
                      : "secondary"
                }
              >
                {conversation.last_message_status}
              </Badge>
            </div>
          </button>
        )
      })}
    </div>
  )
}
