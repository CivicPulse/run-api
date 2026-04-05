import { useState, useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { deriveImportProgressMetrics } from "@/lib/import-progress"
import type { ImportJob } from "@/types/import-job"

interface ImportProgressProps {
  job: ImportJob
  onComplete: () => void
  onFailed: () => void
  onCancelled: () => void
  onCancel: () => void
  cancelPending: boolean
}

export function ImportProgress({
  job,
  onComplete,
  onFailed,
  onCancelled,
  onCancel,
  cancelPending,
}: ImportProgressProps) {
  const firedRef = useRef(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  useEffect(() => {
    if (firedRef.current) return
    if (job.status === "completed") {
      firedRef.current = true
      onComplete()
    } else if (job.status === "completed_with_errors") {
      firedRef.current = true
      onComplete()
    } else if (job.status === "failed") {
      firedRef.current = true
      onFailed()
    } else if (job.status === "cancelled") {
      firedRef.current = true
      onCancelled()
    }
  }, [job.status, onComplete, onFailed, onCancelled])

  const progressPercent = job.total_rows
    ? Math.round(((job.imported_rows ?? 0) / job.total_rows) * 100)
    : 0
  const metrics = deriveImportProgressMetrics(job)
  const showProcessingState = job.status === "queued" || job.status === "processing"

  return (
    <div className="space-y-4" aria-live="polite" aria-atomic="true">
      <div className="space-y-2">
        <Progress value={progressPercent} className="h-2" />
        <p className="text-xs text-muted-foreground">{progressPercent}%</p>
      </div>

      {showProcessingState && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{job.status === "queued" ? "Queued..." : "Processing..."}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCancelDialog(true)}
          >
            Cancel Import
          </Button>
        </div>
      )}

      {job.status === "cancelling" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Cancelling...</span>
        </div>
      )}

      {showProcessingState && (
        <div className="grid gap-3 rounded-md border border-border/70 bg-muted/30 p-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Throughput
            </p>
            <p className="mt-1 text-sm font-medium">
              {metrics.throughputLabel ?? "Calculating..."}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              ETA
            </p>
            <p className="mt-1 text-sm font-medium">
              {job.status === "queued"
                ? "Waiting to start"
                : metrics.etaLabel ?? "Calculating..."}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-6 text-sm">
        <span>
          <span className="font-medium text-status-success-foreground">
            {job.imported_rows ?? 0}
          </span>{" "}
          imported
        </span>
        <span>
          <span className="font-medium text-status-warning-foreground">
            {job.skipped_rows}
          </span>{" "}
          skipped
        </span>
        {job.phones_created != null && job.phones_created > 0 && (
          <span>
            <span className="font-medium text-status-info-foreground">
              {job.phones_created.toLocaleString()}
            </span>{" "}
            phones
          </span>
        )}
      </div>

      {job.status === "failed" && (
        <div className="rounded-md bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">Import failed</p>
        </div>
      )}

      {job.status === "completed_with_errors" && (
        <div className="rounded-md bg-status-warning/15 p-3">
          <p className="text-sm font-medium text-status-warning-foreground">
            Import completed with errors
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Successful rows were kept. Review the merged error report for skipped rows.
          </p>
        </div>
      )}

      {job.status === "cancelled" && (
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm font-medium">Import cancelled</p>
          <p className="text-xs text-muted-foreground mt-1">
            {job.imported_rows ?? 0} rows were imported before cancellation.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title="Cancel Import"
        description="Cancel this import? Already-imported rows will be kept."
        confirmLabel="Cancel Import"
        variant="destructive"
        onConfirm={() => {
          setShowCancelDialog(false)
          onCancel()
        }}
        isPending={cancelPending}
      />
    </div>
  )
}
