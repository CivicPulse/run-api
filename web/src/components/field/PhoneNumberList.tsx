import { useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Phone, Headphones } from "lucide-react"
import { toast } from "sonner"
import { formatPhoneDisplay, getPhoneStatus } from "@/types/calling"
import type { PhoneAttempt } from "@/types/calling"
import type { TwilioCallStatus, CallMode, DNCCheckResult, CallingHoursCheck } from "@/types/voice"
import { TooltipIcon } from "@/components/field/TooltipIcon"
import { CallStatusBar } from "@/components/field/CallStatusBar"
import { CallModeIndicator } from "@/components/field/CallModeIndicator"
import { DncBlockBanner } from "@/components/field/DncBlockBanner"
import { CallingHoursBanner } from "@/components/field/CallingHoursBanner"

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
  callMode: CallMode
  callStatus: TwilioCallStatus
  activeCallNumber: string | null
  isMuted: boolean
  duration: number
  onBrowserCall: (e164: string) => void
  onHangUp: () => void
  onToggleMute: () => void
  dncStatus: Record<string, DNCCheckResult>
  callingHoursCheck: CallingHoursCheck | null
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

/** Whether a call is currently active (not idle or closed) */
function isCallActive(status: TwilioCallStatus): boolean {
  return status !== "idle" && status !== "closed" && status !== "error"
}

export function PhoneNumberList({
  phones,
  attempts,
  voterName,
  onCallStarted,
  callMode,
  callStatus,
  activeCallNumber,
  isMuted,
  duration,
  onBrowserCall,
  onHangUp,
  onToggleMute,
  dncStatus,
  callingHoursCheck,
}: PhoneNumberListProps) {
  const callActive = isCallActive(callStatus)

  return (
    <div data-tour="phone-number-list" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <CallModeIndicator mode={callMode} />
        <TooltipIcon content="Tap a number to call. If your phone doesn't support tap-to-call, long-press to copy it." side="top" />
      </div>

      {/* Calling hours banner (shown once above the list) */}
      {callingHoursCheck && !callingHoursCheck.allowed && (
        <CallingHoursBanner callingHours={callingHoursCheck} />
      )}

      {phones.map((phone) => (
        <PhoneRow
          key={phone.phone_id}
          phone={phone}
          attempts={attempts}
          voterName={voterName}
          onCallStarted={onCallStarted}
          callMode={callMode}
          callStatus={callStatus}
          activeCallNumber={activeCallNumber}
          isMuted={isMuted}
          duration={duration}
          onBrowserCall={onBrowserCall}
          onHangUp={onHangUp}
          onToggleMute={onToggleMute}
          isDncBlocked={dncStatus[phone.value]?.blocked ?? false}
          callingHoursBlocked={callingHoursCheck ? !callingHoursCheck.allowed : false}
          callActive={callActive}
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
  callMode,
  callStatus,
  activeCallNumber,
  isMuted,
  duration,
  onBrowserCall,
  onHangUp,
  onToggleMute,
  isDncBlocked,
  callingHoursBlocked,
  callActive,
}: {
  phone: PhoneNumberListProps["phones"][number]
  attempts: Record<string, PhoneAttempt> | null
  voterName: string
  onCallStarted: (e164: string) => void
  callMode: CallMode
  callStatus: TwilioCallStatus
  activeCallNumber: string | null
  isMuted: boolean
  duration: number
  onBrowserCall: (e164: string) => void
  onHangUp: () => void
  onToggleMute: () => void
  isDncBlocked: boolean
  callingHoursBlocked: boolean
  callActive: boolean
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayNumber = formatPhoneDisplay(phone.value)
  const status = getPhoneStatus(phone.value, attempts)
  const isThisNumberActive = callActive && activeCallNumber === phone.value

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

  const handleBrowserCallClick = useCallback(async () => {
    // Probe microphone permission before connecting
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Stop tracks immediately -- we only needed the permission check
      stream.getTracks().forEach((t) => t.stop())
      onBrowserCall(phone.value)
    } catch {
      toast("Microphone access denied -- using phone dialer instead.")
      window.open(`tel:${phone.value}`, "_self")
    }
  }, [phone.value, onBrowserCall])

  // Terminal numbers (wrong number, disconnected)
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

  // DNC blocked
  if (isDncBlocked) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{getTypeLabel(phone.type)}</span>
          <span className="text-base font-normal line-through text-muted-foreground">
            {displayNumber}
          </span>
        </div>
        <DncBlockBanner />
      </div>
    )
  }

  // Active call on THIS number -- show CallStatusBar
  if (isThisNumberActive) {
    return (
      <div className="space-y-2">
        <div
          className="flex items-center gap-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
        >
          <span className="text-xs text-muted-foreground">{getTypeLabel(phone.type)}</span>
          <span className="text-base font-normal flex-1">{displayNumber}</span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 min-w-11"
            disabled
            aria-label="Call in progress"
          >
            <Phone className="h-4 w-4 mr-1" />
            Calling...
          </Button>
        </div>
        <CallStatusBar
          callStatus={callStatus}
          duration={duration}
          isMuted={isMuted}
          onHangUp={onHangUp}
          onToggleMute={onToggleMute}
        />
      </div>
    )
  }

  // Buttons disabled when: calling hours blocked, or another call is active
  const isDisabled = callingHoursBlocked || callActive

  // Browser call mode
  if (callMode === "browser") {
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
          disabled={isDisabled}
          onClick={handleBrowserCallClick}
          aria-label={`Browser call ${voterName} at ${displayNumber}`}
        >
          <Headphones className="h-4 w-4 mr-1" />
          Browser Call
        </Button>
      </div>
    )
  }

  // Tel: mode (default / fallback)
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
        disabled={isDisabled}
        asChild={!isDisabled}
      >
        {isDisabled ? (
          <span>
            <Phone className="h-4 w-4 mr-1" />
            Call
          </span>
        ) : (
          <a
            href={`tel:${phone.value}`}
            onClick={handleCallClick}
            aria-label={`Call ${voterName} at ${displayNumber}`}
          >
            <Phone className="h-4 w-4 mr-1" />
            Call
          </a>
        )}
      </Button>
    </div>
  )
}
