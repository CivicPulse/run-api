import { useState, useEffect } from "react"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { RequireRole } from "@/components/shared/RequireRole"
import { TooltipIcon } from "@/components/shared/TooltipIcon"
import { DropZone } from "@/components/voters/DropZone"
import { ColumnMappingTable } from "@/components/voters/ColumnMappingTable"
import { MappingPreview } from "@/components/voters/MappingPreview"
import { ImportProgress } from "@/components/voters/ImportProgress"
import {
  getImportStatusLabel,
  useInitiateImport,
  useDetectColumns,
  useConfirmMapping,
  useCancelImport,
  useImportJob,
  deriveStep,
} from "@/hooks/useImports"
import { uploadToMinIO } from "@/lib/uploadToMinIO"
import type { FieldMapping } from "@/types/import-job"

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------
export const Route = createFileRoute(
  "/campaigns/$campaignId/voters/imports/new",
)({
  component: ImportWizardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    jobId: (search.jobId as string) ?? "",
    step: Number(search.step ?? 1),
  }),
})

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------
const STEP_LABELS = ["Upload", "Map Columns", "Preview", "Progress"]

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Import wizard steps">
      <ol className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const isActive = stepNum === currentStep
          const isDone = stepNum < currentStep
          return (
            <li key={stepNum} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/30 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {stepNum}
              </span>
              <span
                className={`text-sm ${isActive ? "font-medium" : "text-muted-foreground"} ${!isActive ? "hidden sm:inline" : ""}`}
              >
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <span className="mx-1 text-muted-foreground">›</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Wizard page
// ---------------------------------------------------------------------------
export function ImportWizardPage() {
  const { campaignId } = useParams({ strict: false }) as { campaignId: string }
  const { jobId, step } = Route.useSearch()
  const navigate = Route.useNavigate()

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | undefined>()

  // Mapping state
  const [detectedColumns, setDetectedColumns] = useState<string[]>([])
  const [suggestedMapping, setSuggestedMapping] = useState<
    Record<string, FieldMapping>
  >({})
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [formatDetected, setFormatDetected] = useState<"l2" | "generic" | null>(null)

  // Hooks
  const initiateImport = useInitiateImport(campaignId)
  const detectColumns = useDetectColumns(campaignId, jobId)
  const confirmMapping = useConfirmMapping(campaignId, jobId)
  const cancelImport = useCancelImport(campaignId, jobId)
  const jobQuery = useImportJob(campaignId, jobId)

  // Auto-restore step from job status when jobId is in URL
  useEffect(() => {
    if (!jobId || !jobQuery.data) return
    const correctStep = deriveStep(jobQuery.data.status)
    // Don't let stale query data navigate backwards — status only moves forward
    if (correctStep < step) return
    if (correctStep !== step) {
      navigate({
        search: { jobId, step: correctStep },
        replace: true,
      })
    }
  }, [jobId, jobQuery.data, step, navigate])

  // Polling job for step 3
  const pollingJob = useImportJob(campaignId, jobId, step === 3)

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  async function handleFileSelect(file: File) {
    setUploadError(undefined)
    setUploading(true)
    setUploadProgress(0)

    try {
      const { job_id, upload_url } = await initiateImport.mutateAsync({
        filename: file.name,
      })

      // Update jobId in URL immediately
      await navigate({
        search: { jobId: job_id, step },
        replace: true,
      })

      // XHR upload to MinIO
      await uploadToMinIO(upload_url, file, (percent) => {
        setUploadProgress(percent)
      })

      // Upload done — detect columns
      const detected = await detectColumns.mutateAsync(job_id)
      const { detected_columns, suggested_mapping, format_detected } = detected

      setDetectedColumns(detected_columns)
      setSuggestedMapping(suggested_mapping)
      setFormatDetected(format_detected)
      // Initialize mapping: extract field from new shape, replace null with ""
      const initialMapping: Record<string, string> = {}
      for (const col of detected_columns) {
        initialMapping[col] = suggested_mapping[col]?.field ?? ""
      }
      setMapping(initialMapping)

      setUploading(false)
      setUploadProgress(100)

      // 1-second flash then advance to step 2
      setTimeout(() => {
        navigate({
          search: { jobId: job_id, step: 2 },
        })
      }, 1000)
    } catch (err) {
      setUploading(false)
      setUploadProgress(0)
      const message =
        err instanceof Error ? err.message : "Upload failed. Please try again."
      setUploadError(message)
      toast.error(message)
    }
  }

  function handleMappingChange(col: string, field: string) {
    setMapping((prev) => ({ ...prev, [col]: field }))
  }

  async function handleConfirm() {
    const field_mapping = Object.fromEntries(
      Object.entries(mapping).filter(([, v]) => !!v),
    )
    try {
      await confirmMapping.mutateAsync({ field_mapping })
      navigate({ search: { jobId, step: 3 } })
    } catch {
      toast.error("Failed to confirm mapping. Please try again.")
    }
  }

  function handleImportComplete() {
    navigate({ search: { jobId, step: 4 } })
  }

  function handleImportFailed() {
    navigate({ search: { jobId, step: 4 } })
  }

  function handleImportCancelled() {
    navigate({ search: { jobId, step: 4 } })
  }

  async function handleCancel() {
    try {
      await cancelImport.mutateAsync()
    } catch {
      toast.error("Failed to cancel import.")
    }
  }

  function handleImportAnother() {
    navigate({
      search: { jobId: "", step: 1 },
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  // Effective step: use URL step but fall back to 1 for initial load
  const currentStep = step || 1

  return (
    <RequireRole minimum="admin">
      <div className="mx-auto max-w-3xl space-y-8 py-8">
        <div>
          <h1 className="text-2xl font-bold">Import Voters</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a CSV file to import voter records into your campaign.
          </p>
        </div>

        <StepIndicator currentStep={currentStep} />

        <div>
          {/* Step 1: Upload */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Step 1 of 4: Upload File</h2>
              <DropZone
                onFileSelect={handleFileSelect}
                uploading={uploading}
                progress={uploadProgress}
                error={uploadError}
              />
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center">
                <h2 className="text-lg font-semibold">
                  Step 2 of 4: Column Mapping
                </h2>
                <TooltipIcon content="Map each column from your CSV to a voter field. Required: at least first_name and last_name. Optional fields like address, phone, and email improve voter matching." />
              </div>
              <ColumnMappingTable
                columns={detectedColumns}
                suggestedMapping={suggestedMapping}
                mapping={mapping}
                onMappingChange={handleMappingChange}
                formatDetected={formatDetected}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={() =>
                    navigate({ search: { jobId, step: 2.5 } })
                  }
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 2.5: Preview */}
          {currentStep === 2.5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Preview: Mapping Summary</h2>
              <p className="text-sm text-muted-foreground">
                Review your column mapping before importing.
              </p>
              <MappingPreview columns={detectedColumns} mapping={mapping} />
              <div className="flex justify-between">
                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                  onClick={() =>
                    navigate({ search: { jobId, step: 2 } })
                  }
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  disabled={confirmMapping.isPending}
                  onClick={handleConfirm}
                >
                  {confirmMapping.isPending ? "Confirming..." : "Confirm Import →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Progress */}
          {currentStep === 3 && pollingJob.data && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">
                Step 3 of 4: Importing...
              </h2>
              <ImportProgress
                job={pollingJob.data}
                onComplete={handleImportComplete}
                onFailed={handleImportFailed}
                onCancelled={handleImportCancelled}
                onCancel={handleCancel}
                cancelPending={cancelImport.isPending}
              />
            </div>
          )}

          {/* Step 4: Completion */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">
                {jobQuery.data?.status === "cancelled"
                  ? "Import Cancelled"
                  : jobQuery.data?.status === "completed_with_errors"
                    ? "Import Completed with Errors"
                    : "Import Complete"}
              </h2>
              {jobQuery.data && (
                <div
                  className={`rounded-md border p-4 space-y-2 ${
                    jobQuery.data.status === "completed_with_errors"
                      ? "border-status-warning/40 bg-status-warning/10"
                      : ""
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {getImportStatusLabel(jobQuery.data.status)}
                  </p>
                  <p className="text-sm">
                    <span
                      className={`font-medium ${
                        jobQuery.data.status === "completed_with_errors"
                          ? "text-status-warning-foreground"
                          : "text-status-success-foreground"
                      }`}
                    >
                      {jobQuery.data.imported_rows ?? 0}
                    </span>{" "}
                    rows imported
                    {jobQuery.data.status === "cancelled"
                      ? " before cancellation"
                      : " successfully"}
                  </p>
                  {jobQuery.data.phones_created != null && jobQuery.data.phones_created > 0 && (
                    <p className="text-sm">
                      <span className="font-medium text-status-success-foreground">
                        {jobQuery.data.phones_created.toLocaleString()}
                      </span>{" "}
                      phones created
                    </p>
                  )}
                  {jobQuery.data.status === "completed_with_errors" && (
                    <p className="text-sm text-muted-foreground">
                      Some rows were skipped or failed validation. Successful rows were kept.
                    </p>
                  )}
                  {jobQuery.data.error_report_url && (
                    <a
                      href={jobQuery.data.error_report_url}
                      className="text-sm text-primary underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download error report
                    </a>
                  )}
                </div>
              )}
              <button
                type="button"
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                onClick={handleImportAnother}
              >
                Import another file
              </button>
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  )
}
