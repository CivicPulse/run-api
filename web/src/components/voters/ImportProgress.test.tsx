import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { ImportProgress } from "./ImportProgress"
import { deriveImportProgressMetrics } from "@/lib/import-progress"
import type { ImportJob } from "@/types/import-job"

function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    campaign_id: "campaign-1",
    original_filename: "voters.csv",
    status: "processing",
    total_rows: 100,
    imported_rows: 40,
    skipped_rows: 2,
    error_report_key: null,
    error_report_url: null,
    error_message: null,
    cancelled_at: null,
    phones_created: 10,
    source_type: "csv",
    field_mapping: null,
    created_by: "user-1",
    last_committed_row: 40,
    processing_started_at: "2026-04-03T19:05:00Z",
    last_progress_at: "2026-04-03T19:09:00Z",
    created_at: "2026-04-03T19:00:00Z",
    updated_at: "2026-04-03T19:09:00Z",
    ...overrides,
  }
}

describe("ImportProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-03T19:10:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("derives throughput and ETA from durable job timestamps", () => {
    const metrics = deriveImportProgressMetrics(makeJob())

    expect(metrics.throughputLabel).toBe("0.1 rows/sec")
    expect(metrics.etaLabel).toBe("7m 30s")
  })

  it("shows throughput and ETA while processing", () => {
    render(
      <ImportProgress
        job={makeJob()}
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onCancelled={vi.fn()}
        onCancel={vi.fn()}
        cancelPending={false}
      />,
    )

    expect(screen.getByText("Throughput")).toBeInTheDocument()
    expect(screen.getByText("0.1 rows/sec")).toBeInTheDocument()
    expect(screen.getByText("7m 30s")).toBeInTheDocument()
  })

  it("suppresses metrics when processing start is unavailable", () => {
    const metrics = deriveImportProgressMetrics(
      makeJob({ processing_started_at: null }),
    )

    expect(metrics.throughputLabel).toBeNull()
    expect(metrics.etaLabel).toBeNull()
  })

  it("shows waiting copy while queued", () => {
    render(
      <ImportProgress
        job={makeJob({
          status: "queued",
          imported_rows: 0,
          phones_created: 0,
          last_progress_at: null,
        })}
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onCancelled={vi.fn()}
        onCancel={vi.fn()}
        cancelPending={false}
      />,
    )

    expect(screen.getByText("Queued...")).toBeInTheDocument()
    expect(screen.getByText("Waiting to start")).toBeInTheDocument()
  })

  it("renders partial-success messaging", () => {
    render(
      <ImportProgress
        job={makeJob({
          status: "completed_with_errors",
          error_report_url: "https://example.com/errors.csv",
        })}
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onCancelled={vi.fn()}
        onCancel={vi.fn()}
        cancelPending={false}
      />,
    )

    expect(screen.getByText("Import completed with errors")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Successful rows were kept. Review the merged error report for skipped rows.",
      ),
    ).toBeInTheDocument()
  })
})
