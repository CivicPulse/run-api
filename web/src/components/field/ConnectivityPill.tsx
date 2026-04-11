import { Wifi, WifiOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import { cn } from "@/lib/utils"

interface ConnectivityPillProps {
  onClick: () => void
}

/**
 * Plan 110-05 / OFFLINE-02: glanceable connectivity indicator for the
 * field-mode header. Derives its state from useConnectivityStatus +
 * offlineQueueStore (items, deadLetter, isSyncing, isSlow, lastSyncAt)
 * and delegates Sheet open to a parent-supplied onClick. Keep the label
 * terse so it fits on narrow mobile headers.
 *
 * Derivation order (most urgent first):
 *   1. !isOnline                    → "Offline"
 *   2. isSyncing && !isSlow         → "Syncing N"
 *   3. isSyncing && isSlow          → "Syncing N (slow)"
 *   4. items.length > 0             → "N pending"
 *   5. lastSyncAt != null           → "Synced Nm ago"
 *   6. default                      → "Online"
 *
 * A red dead-letter overlay renders on top of any primary state when
 * deadLetter.length > 0.
 */
export function ConnectivityPill({ onClick }: ConnectivityPillProps) {
  const isOnline = useConnectivityStatus()
  const items = useOfflineQueueStore((s) => s.items)
  const deadLetter = useOfflineQueueStore((s) => s.deadLetter)
  const isSyncing = useOfflineQueueStore((s) => s.isSyncing)
  const isSlow = useOfflineQueueStore((s) => s.isSlow)
  const lastSyncAt = useOfflineQueueStore((s) => s.lastSyncAt)

  const view = deriveView({
    isOnline,
    itemCount: items.length,
    isSyncing,
    isSlow,
    lastSyncAt,
  })

  const hasDeadLetter = deadLetter.length > 0

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={view.ariaLabel}
      className={cn(
        // 44×44 touch target + visual padding
        "relative inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        view.toneClass,
        view.dim && "opacity-70",
      )}
      data-tour="connectivity-pill"
    >
      <view.Icon
        className={cn("h-4 w-4 shrink-0", view.iconClass)}
        aria-hidden="true"
      />
      <span className="truncate">{view.label}</span>
      {hasDeadLetter && (
        <span
          data-testid="dead-letter-overlay"
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-destructive ring-2 ring-background"
        >
          <AlertCircle className="h-2.5 w-2.5 text-white" aria-hidden="true" />
        </span>
      )}
    </button>
  )
}

interface DerivedView {
  label: string
  ariaLabel: string
  toneClass: string
  iconClass?: string
  dim?: boolean
  Icon: typeof Wifi
}

interface DeriveArgs {
  isOnline: boolean
  itemCount: number
  isSyncing: boolean
  isSlow: boolean
  lastSyncAt: number | null
}

function deriveView(args: DeriveArgs): DerivedView {
  const { isOnline, itemCount, isSyncing, isSlow, lastSyncAt } = args

  if (!isOnline) {
    return {
      label: "Offline",
      ariaLabel: `Offline${itemCount > 0 ? `, ${itemCount} pending` : ""}`,
      toneClass: "text-status-warning-foreground bg-status-warning-muted",
      Icon: WifiOff,
    }
  }

  if (isSyncing) {
    if (isSlow) {
      return {
        label: `Syncing ${itemCount} (slow)`,
        ariaLabel: `Syncing ${itemCount} outcomes, slow connection`,
        toneClass: "text-status-info-foreground bg-status-info-muted",
        iconClass: "animate-spin",
        dim: true,
        Icon: Loader2,
      }
    }
    return {
      label: `Syncing ${itemCount}`,
      ariaLabel: `Syncing ${itemCount} outcomes`,
      toneClass: "text-status-info-foreground bg-status-info-muted",
      iconClass: "animate-spin",
      Icon: Loader2,
    }
  }

  if (itemCount > 0) {
    return {
      label: `${itemCount} pending`,
      ariaLabel: `${itemCount} outcomes pending sync`,
      toneClass: "text-status-warning-foreground bg-status-warning-muted",
      Icon: WifiOff,
    }
  }

  if (lastSyncAt !== null) {
    const rel = formatRelative(lastSyncAt)
    return {
      label: `Synced ${rel}`,
      ariaLabel: `All synced. Last sync ${rel}.`,
      toneClass: "text-status-success-foreground",
      Icon: CheckCircle2,
    }
  }

  return {
    label: "Online",
    ariaLabel: "Online, all synced",
    toneClass: "text-status-success-foreground",
    Icon: Wifi,
  }
}

/**
 * Produce a compact relative-time label (e.g. "just now", "30s",
 * "2m ago", "3h ago", "2d ago"). Kept small on purpose so the pill
 * fits narrow mobile headers. Exported for unit testing; kept in this
 * file because it's a single-purpose formatter tightly coupled to the
 * pill's copy — moving it to its own module would be premature.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function formatRelative(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return "just now"
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
