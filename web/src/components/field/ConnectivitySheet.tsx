import { useState } from "react"
import { toast } from "sonner"
import {
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"
import {
  useOfflineQueueStore,
  type DeadLetterItem,
} from "@/stores/offlineQueueStore"
import { formatRelative } from "@/components/field/ConnectivityPill"
import type { DoorKnockCreate } from "@/types/walk-list"
import { cn } from "@/lib/utils"

interface ConnectivitySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Plan 110-05 / OFFLINE-02: expanded connectivity panel. Renders
 * the active queue summary, last-sync relative time, and per-item
 * dead-letter cards with Retry / Discard actions. `side="bottom"`
 * for mobile-field parity — the Sheet slides up from the bottom
 * edge so volunteers can operate it with one thumb.
 */
export function ConnectivitySheet({
  open,
  onOpenChange,
}: ConnectivitySheetProps) {
  const isOnline = useConnectivityStatus()
  const items = useOfflineQueueStore((s) => s.items)
  const deadLetter = useOfflineQueueStore((s) => s.deadLetter)
  const isSyncing = useOfflineQueueStore((s) => s.isSyncing)
  const isSlow = useOfflineQueueStore((s) => s.isSlow)
  const lastSyncAt = useOfflineQueueStore((s) => s.lastSyncAt)
  const retryDeadLetter = useOfflineQueueStore((s) => s.retryDeadLetter)
  const discardDeadLetter = useOfflineQueueStore((s) => s.discardDeadLetter)

  const header = deriveHeader({
    isOnline,
    itemCount: items.length,
    isSyncing,
    isSlow,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto"
        aria-describedby="connectivity-sheet-description"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-lg">
            <header.Icon
              className={cn(
                "h-5 w-5",
                header.iconClass,
                header.toneClass,
              )}
              aria-hidden="true"
            />
            {header.title}
          </SheetTitle>
          <SheetDescription id="connectivity-sheet-description">
            {header.description}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-4">
          {/* Queue summary */}
          <section aria-label="Sync queue summary" className="space-y-1">
            <p className="text-sm font-medium">
              {items.length} {items.length === 1 ? "outcome" : "outcomes"}{" "}
              pending
            </p>
            <p className="text-xs text-muted-foreground">
              {lastSyncAt !== null
                ? `Last sync ${formatRelative(lastSyncAt)}`
                : "No successful sync yet"}
            </p>
          </section>

          {/* Dead-letter list */}
          <section aria-label="Dead letter" className="space-y-2">
            <h3 className="text-sm font-semibold">Dead letter</h3>
            {deadLetter.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No failed syncs"
                description="Everything the server rejected shows up here for you to review."
              />
            ) : (
              <ul className="space-y-2">
                {deadLetter.map((dl) => (
                  <DeadLetterCard
                    key={dl.id}
                    item={dl}
                    onRetry={() => {
                      retryDeadLetter(dl.id)
                      toast.success(
                        "Retrying — item is back in the queue.",
                      )
                    }}
                    onDiscard={() => {
                      discardDeadLetter(dl.id)
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface DeadLetterCardProps {
  item: DeadLetterItem
  onRetry: () => void
  onDiscard: () => void
}

function DeadLetterCard({ item, onRetry, onDiscard }: DeadLetterCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const label = describeItem(item)

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <AlertCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.errorSummary}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            {item.errorCode} &middot; failed {formatRelative(item.failedAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9"
          aria-label={`Retry ${label}`}
          onClick={onRetry}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-9 text-destructive hover:text-destructive"
          aria-label={`Discard ${label}`}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Discard
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Discard this record?"
        description="This will permanently drop the queued outcome. You cannot recover it."
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          onDiscard()
          setConfirmOpen(false)
        }}
      />
    </li>
  )
}

interface HeaderArgs {
  isOnline: boolean
  itemCount: number
  isSyncing: boolean
  isSlow: boolean
}

interface HeaderView {
  title: string
  description: string
  toneClass: string
  iconClass?: string
  Icon: typeof Wifi
}

function deriveHeader(args: HeaderArgs): HeaderView {
  const { isOnline, itemCount, isSyncing, isSlow } = args
  if (!isOnline) {
    return {
      title: "Offline",
      description:
        itemCount > 0
          ? `${itemCount} outcomes saved locally. They’ll sync when you reconnect.`
          : "You’re offline. New outcomes will save locally.",
      toneClass: "text-status-warning-foreground",
      Icon: WifiOff,
    }
  }
  if (isSyncing) {
    return {
      title: isSlow ? "Syncing (slow)" : "Syncing",
      description: `Sending ${itemCount} outcomes to the server.`,
      toneClass: "text-status-info-foreground",
      iconClass: "animate-spin",
      Icon: Loader2,
    }
  }
  if (itemCount > 0) {
    return {
      title: "Waiting to sync",
      description: `${itemCount} outcomes are queued. We’ll retry automatically.`,
      toneClass: "text-status-warning-foreground",
      Icon: WifiOff,
    }
  }
  return {
    title: "Online",
    description: "All outcomes are synced with the server.",
    toneClass: "text-status-success-foreground",
    Icon: Wifi,
  }
}

function describeItem(item: DeadLetterItem): string {
  if (item.type === "door_knock") {
    const p = item.payload as DoorKnockCreate
    return `Door knock ${p.result_code ?? ""}`.trim()
  }
  return `Call record for session ${item.resourceId}`
}
