import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SmsEligibilityBanner } from "@/components/field/SmsEligibilityBanner"
import { SmsEligibilitySummary } from "@/components/field/SmsEligibilitySummary"
import type { SmsEligibility } from "@/types/sms"

interface SmsComposerProps {
  eligibility: SmsEligibility | null | undefined
  conversationId: string | null
  isPending?: boolean
  onSend: (body: string) => Promise<void> | void
}

export function SmsComposer({
  eligibility,
  conversationId,
  isPending = false,
  onSend,
}: SmsComposerProps) {
  const [body, setBody] = useState("")
  const [lastConversationId, setLastConversationId] = useState(conversationId)
  const isBlocked = !eligibility?.allowed

  // Reset the composer when the active conversation changes. Updating state
  // during render is the React-recommended pattern for deriving state from
  // props — see https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (conversationId !== lastConversationId) {
    setLastConversationId(conversationId)
    setBody("")
  }

  async function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || isBlocked || isPending) {
      return
    }
    await onSend(trimmed)
    setBody("")
  }

  return (
    <div className="space-y-3" data-testid="sms-composer">
      <SmsEligibilitySummary eligibility={eligibility} />
      <SmsEligibilityBanner eligibility={eligibility} />
      <div className="space-y-2">
        <Textarea
          aria-label="SMS message body"
          placeholder="Write your reply..."
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          disabled={isBlocked || isPending}
          className="min-h-28 resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isBlocked
              ? "Sending is disabled until the SMS eligibility issue is resolved."
              : "Press Cmd/Ctrl+Enter to send quickly."}
          </p>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isBlocked || isPending || body.trim().length === 0}
          >
            {isPending ? "Sending..." : "Send SMS"}
          </Button>
        </div>
      </div>
    </div>
  )
}
