import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, PhoneOff } from "lucide-react"
import type { TwilioCallStatus } from "@/types/voice"

interface CallStatusBarProps {
  callStatus: TwilioCallStatus
  duration: number
  isMuted: boolean
  onHangUp: () => void
  onToggleMute: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function statusLabel(status: TwilioCallStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting"
    case "ringing":
      return "Ringing"
    case "open":
      return "Connected"
    case "closed":
      return "Ending..."
    default:
      return ""
  }
}

function statusVariant(
  status: TwilioCallStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "open":
      return "default"
    case "ringing":
    case "connecting":
      return "secondary"
    case "closed":
      return "outline"
    default:
      return "secondary"
  }
}

export function CallStatusBar({
  callStatus,
  duration,
  isMuted,
  onHangUp,
  onToggleMute,
}: CallStatusBarProps) {
  const hangUpRef = useRef<HTMLButtonElement>(null)

  // Debounced aria-live text (update every 2 seconds)
  const [ariaTime, setAriaTime] = useState(formatDuration(duration))
  useEffect(() => {
    const interval = setInterval(() => {
      setAriaTime(formatDuration(duration))
    }, 2000)
    return () => clearInterval(interval)
  }, [duration])

  // Focus hang-up button on mount
  useEffect(() => {
    hangUpRef.current?.focus()
  }, [])

  const label = statusLabel(callStatus)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 p-3 motion-safe:transition-opacity">
      {/* Duration */}
      <span className="font-mono tabular-nums text-base font-semibold">
        {formatDuration(duration)}
      </span>
      {/* Accessible duration (debounced) */}
      <span className="sr-only" aria-live="polite">
        {ariaTime}
      </span>

      {/* Status badge */}
      {label && <Badge variant={statusVariant(callStatus)}>{label}</Badge>}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Controls */}
      <div className="flex gap-2">
        {/* Mute toggle */}
        <Button
          variant={isMuted ? "default" : "outline"}
          size="sm"
          className="min-h-11 min-w-11 flex-1 sm:flex-none"
          onClick={onToggleMute}
          aria-label={isMuted ? "Unmute call" : "Mute call"}
          aria-pressed={isMuted}
        >
          {isMuted ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        {/* Hang up */}
        <Button
          ref={hangUpRef}
          variant="destructive"
          size="sm"
          className="min-h-11 min-w-11 flex-1 sm:flex-none"
          onClick={onHangUp}
          aria-label="End call"
        >
          <PhoneOff className="h-4 w-4 mr-1" />
          Hang Up
        </Button>
      </div>
    </div>
  )
}
