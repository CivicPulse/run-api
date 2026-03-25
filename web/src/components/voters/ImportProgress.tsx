import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import type { ImportJob } from "@/types/import-job"

interface ImportProgressProps {
  job: ImportJob
  onComplete: () => void
  onFailed: () => void
}

export function ImportProgress({ job, onComplete, onFailed }: ImportProgressProps) {
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    if (job.status === "completed") {
      firedRef.current = true
      onComplete()
    } else if (job.status === "failed") {
      firedRef.current = true
      onFailed()
    }
  }, [job.status, onComplete, onFailed])

  const progressPercent = job.total_rows
    ? Math.round((job.imported_rows / job.total_rows) * 100)
    : 0

  return (
    <div className="space-y-4" aria-live="polite" aria-atomic="true">
      <div className="space-y-2">
        {(job.status === "queued" || job.status === "processing") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing...</span>
          </div>
        )}
        <Progress value={progressPercent} className="h-2" />
        <p className="text-xs text-muted-foreground">{progressPercent}%</p>
      </div>

      <div className="flex gap-6 text-sm">
        <span>
          <span className="font-medium text-status-success-foreground">{job.imported_rows}</span>{" "}
          imported
        </span>
        <span>
          <span className="font-medium text-status-warning-foreground">{job.skipped_rows}</span>{" "}
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
    </div>
  )
}
