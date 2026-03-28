import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"
import { WifiOff, Loader2 } from "lucide-react"

export function OfflineBanner() {
  const isOnline = useConnectivityStatus()
  const items = useOfflineQueueStore((s) => s.items)
  const isSyncing = useOfflineQueueStore((s) => s.isSyncing)
  const count = items.length

  // State 1: Online, empty queue, not syncing — hidden
  if (isOnline && count === 0 && !isSyncing) {
    return null
  }

  // State 3: Online, syncing
  if (isOnline && isSyncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={`Syncing ${count} outcomes to server.`}
        className="flex h-8 items-center justify-center gap-2 border-b border-border bg-status-info-muted px-4"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-status-info-foreground" aria-hidden="true" />
        <span className="text-sm text-status-info-foreground">
          Syncing <span className="font-semibold">{count}</span> outcomes...
        </span>
      </div>
    )
  }

  // State 2 (Offline) or State 5 (Online, not syncing, items remain)
  const ariaLabel = count > 0
    ? `You are offline. ${count} outcomes saved locally.`
    : "You are offline."

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="flex h-8 items-center justify-center gap-2 border-b border-border bg-muted px-4"
    >
      <WifiOff className="h-3.5 w-3.5 text-status-warning-foreground" aria-hidden="true" />
      <span className="text-sm text-foreground">
        {count > 0 ? (
          <>
            Offline <span className="text-muted-foreground">&middot;</span>{" "}
            <span className="font-semibold">{count}</span> outcomes saved
          </>
        ) : (
          "Offline"
        )}
      </span>
    </div>
  )
}
