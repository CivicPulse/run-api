import { useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Phone } from "lucide-react"
import { toast } from "sonner"
import { formatPhoneDisplay, getPhoneStatus } from "@/types/calling"
import type { PhoneAttempt } from "@/types/calling"

interface PhoneNumberListProps {
  phones: Array<{
    phone_id: string
    value: string
    type: string
    is_primary: boolean
  }>
  attempts: Record<string, PhoneAttempt> | null
  voterName: string
  onCallStarted: (e164: string) => void
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    cell: "Cell",
    mobile: "Cell",
    home: "Home",
    work: "Work",
    landline: "Home",
  }
  return map[type.toLowerCase()] || type
}

function getTerminalLabel(result: string): string {
  if (result === "wrong_number") return "Wrong #"
  if (result === "disconnected") return "Disconnected"
  return result
}

export function PhoneNumberList({
  phones,
  attempts,
  voterName,
  onCallStarted,
}: PhoneNumberListProps) {
  return (
    <div className="flex flex-col gap-2">
      {phones.map((phone) => (
        <PhoneRow
          key={phone.phone_id}
          phone={phone}
          attempts={attempts}
          voterName={voterName}
          onCallStarted={onCallStarted}
        />
      ))}
    </div>
  )
}

function PhoneRow({
  phone,
  attempts,
  voterName,
  onCallStarted,
}: {
  phone: PhoneNumberListProps["phones"][number]
  attempts: Record<string, PhoneAttempt> | null
  voterName: string
  onCallStarted: (e164: string) => void
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayNumber = formatPhoneDisplay(phone.value)
  const status = getPhoneStatus(phone.value, attempts)

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      navigator.clipboard.writeText(phone.value).then(() => {
        toast("Copied")
      }).catch(() => {
        // Clipboard API may not be available
      })
    }, 500)
  }, [phone.value])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleCallClick = useCallback(() => {
    onCallStarted(phone.value)
  }, [phone.value, onCallStarted])

  if (status.isTerminal) {
    return (
      <div
        className="flex items-center gap-2"
        aria-label={`${displayNumber} -- ${getTerminalLabel(status.lastResult || "")}`}
      >
        <span className="text-xs text-muted-foreground">{getTypeLabel(phone.type)}</span>
        <span className="text-base font-normal line-through text-muted-foreground">
          {displayNumber}
        </span>
        <span className="text-xs text-muted-foreground">
          {getTerminalLabel(status.lastResult || "")}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <span className="text-xs text-muted-foreground">{getTypeLabel(phone.type)}</span>
      <span className="text-base font-normal flex-1">{displayNumber}</span>
      {status.priorTries > 0 && (
        <span className="text-xs text-muted-foreground">
          {status.priorTries === 1
            ? "1 prior try"
            : `${status.priorTries} prior tries`}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 min-w-11"
        asChild
      >
        <a
          href={`tel:${phone.value}`}
          onClick={handleCallClick}
          aria-label={`Call ${voterName} at ${displayNumber}`}
        >
          <Phone className="h-4 w-4 mr-1" />
          Call
        </a>
      </Button>
    </div>
  )
}
