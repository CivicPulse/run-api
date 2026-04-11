import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"
import { WifiOff } from "lucide-react"

/**
 * Plan 110-05 / OFFLINE-02: after the ConnectivityPill ships, the
 * OfflineBanner scope is narrowed to the critical prolonged-offline
 * state only — user is actively offline AND has unsynced outcomes.
 * The glanceable pill in FieldHeader now carries the syncing /
 * all-clear / N-pending indicators so the banner can recede.
 */
export function OfflineBanner() {
  const isOnline = useConnectivityStatus()
  const items = useOfflineQueueStore((s) => s.items)
  const count = items.length

  // Only render for the critical case: offline AND unsynced work.
  if (isOnline || count === 0) {
    return null
  }

  const ariaLabel = `You are offline. ${count} outcomes saved locally.`

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="flex h-8 items-center justify-center gap-2 border-b border-border bg-muted px-4"
    >
      <WifiOff className="h-3.5 w-3.5 text-status-warning-foreground" aria-hidden="true" />
      <span className="text-sm text-foreground">
        Offline <span className="text-muted-foreground">&middot;</span>{" "}
        <span className="font-semibold">{count}</span> outcomes saved
      </span>
    </div>
  )
}
