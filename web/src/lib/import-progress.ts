import type { ImportJob } from "@/types/import-job"

export interface ImportProgressMetrics {
  throughputRowsPerSecond: number | null
  etaSeconds: number | null
  etaLabel: string | null
  throughputLabel: string | null
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(Math.round(totalSeconds), 0)
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds === 0
      ? `${minutes}m`
      : `${minutes}m ${remainingSeconds}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`
}

export function deriveImportProgressMetrics(
  job: Pick<
    ImportJob,
    | "status"
    | "processing_started_at"
    | "last_progress_at"
    | "total_rows"
    | "imported_rows"
  >,
  now = Date.now(),
): ImportProgressMetrics {
  if (
    job.status === "queued"
    || job.status === "pending"
    || job.status === "uploaded"
    || !job.processing_started_at
  ) {
    return {
      throughputRowsPerSecond: null,
      etaSeconds: null,
      etaLabel: null,
      throughputLabel: null,
    }
  }

  const importedRows = Math.max(job.imported_rows ?? 0, 0)
  if (importedRows <= 0) {
    return {
      throughputRowsPerSecond: null,
      etaSeconds: null,
      etaLabel: null,
      throughputLabel: null,
    }
  }

  const processingStartedAt = new Date(job.processing_started_at).getTime()
  if (Number.isNaN(processingStartedAt)) {
    return {
      throughputRowsPerSecond: null,
      etaSeconds: null,
      etaLabel: null,
      throughputLabel: null,
    }
  }

  const elapsedSeconds = Math.max((now - processingStartedAt) / 1000, 1)
  const throughputRowsPerSecond = importedRows / elapsedSeconds
  const throughputLabel = `${throughputRowsPerSecond.toFixed(1)} rows/sec`

  const lastProgressAt = job.last_progress_at
    ? new Date(job.last_progress_at).getTime()
    : Number.NaN
  const canEstimateEta = Boolean(
    job.total_rows
      && job.total_rows > importedRows
      && Number.isFinite(lastProgressAt)
      && !Number.isNaN(lastProgressAt),
  )

  if (!canEstimateEta) {
    return {
      throughputRowsPerSecond,
      etaSeconds: null,
      etaLabel: null,
      throughputLabel,
    }
  }

  const remainingRows = Math.max((job.total_rows ?? 0) - importedRows, 0)
  const etaSeconds =
    throughputRowsPerSecond > 0 ? remainingRows / throughputRowsPerSecond : null

  return {
    throughputRowsPerSecond,
    etaSeconds,
    etaLabel: etaSeconds == null ? null : formatDuration(etaSeconds),
    throughputLabel,
  }
}
