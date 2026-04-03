import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import React from "react"

const store = vi.hoisted(() => ({
  component: null as React.ComponentType | null,
  search: { jobId: "old-job", step: 1 },
  jobData: null as null | {
    status: string
    imported_rows: number
    phones_created: number | null
    error_report_url: string | null
  },
}))

const mockNavigate = vi.hoisted(() => vi.fn())
const mockInitiateImport = vi.hoisted(() => vi.fn())
const mockDetectColumns = vi.hoisted(() => vi.fn())
const mockConfirmMapping = vi.hoisted(() => vi.fn())
const mockCancelImport = vi.hoisted(() => vi.fn())
const mockUploadToMinIO = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    store.component = opts.component
    return {
      options: opts,
      useSearch: () => store.search,
      useNavigate: () => mockNavigate,
    }
  },
  useParams: () => ({ campaignId: "campaign-123" }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shared/TooltipIcon", () => ({
  TooltipIcon: () => null,
}))

vi.mock("@/components/voters/DropZone", () => ({
  DropZone: ({ onFileSelect }: { onFileSelect: (file: File) => Promise<void> }) => (
    <button
      type="button"
      onClick={() =>
        onFileSelect(new File(["first,last"], "voters.csv", { type: "text/csv" }))
      }
    >
      Select file
    </button>
  ),
}))

vi.mock("@/components/voters/ColumnMappingTable", () => ({
  ColumnMappingTable: () => <div>Column mapping</div>,
}))

vi.mock("@/components/voters/MappingPreview", () => ({
  MappingPreview: () => <div>Mapping preview</div>,
}))

vi.mock("@/components/voters/ImportProgress", () => ({
  ImportProgress: () => <div>Import progress</div>,
}))

vi.mock("@/lib/uploadToMinIO", () => ({
  uploadToMinIO: (...args: unknown[]) => mockUploadToMinIO(...args),
}))

vi.mock("@/hooks/useImports", () => ({
  deriveStep: (status: string | undefined) =>
    status === "completed_with_errors" ? 4 : 1,
  getImportStatusLabel: (status: string) =>
    status === "completed_with_errors" ? "Completed with errors" : status,
  useInitiateImport: () => ({
    mutateAsync: mockInitiateImport,
    isPending: false,
  }),
  useDetectColumns: () => ({
    mutateAsync: mockDetectColumns,
    isPending: false,
  }),
  useConfirmMapping: () => ({
    mutateAsync: mockConfirmMapping,
    isPending: false,
  }),
  useCancelImport: () => ({
    mutateAsync: mockCancelImport,
    isPending: false,
  }),
  useImportJob: () => ({
    data: store.jobData,
  }),
}))

import "./new"

function renderPage() {
  const Component = store.component
  if (!Component) {
    throw new Error("ImportWizardPage component was not captured")
  }
  return render(<Component />)
}

describe("Import Wizard Page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.search = { jobId: "old-job", step: 1 }
    store.jobData = null
    mockNavigate.mockResolvedValue(undefined)
    mockInitiateImport.mockResolvedValue({
      job_id: "job-new",
      upload_url: "https://example.com/upload",
    })
    mockDetectColumns.mockResolvedValue({
      detected_columns: ["First Name"],
      suggested_mapping: {
        "First Name": { field: "first_name", match_type: "exact" },
      },
      format_detected: "generic",
    })
    mockConfirmMapping.mockResolvedValue({})
    mockCancelImport.mockResolvedValue({})
    mockUploadToMinIO.mockResolvedValue(undefined)
  })

  it("runs detect-columns against the newly created import job id", async () => {
    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Select file" }))

    await waitFor(() => {
      expect(mockDetectColumns).toHaveBeenCalledWith("job-new")
    })

    expect(mockNavigate).toHaveBeenCalledWith({
      search: { jobId: "job-new", step: 1 },
      replace: true,
    })
  })

  it("shows the partial-success completion state for completed_with_errors imports", () => {
    store.search = { jobId: "job-new", step: 4 }
    store.jobData = {
      status: "completed_with_errors",
      imported_rows: 42,
      phones_created: 5,
      error_report_url: "https://example.com/errors.csv",
    }

    renderPage()

    expect(screen.getByText("Import Completed with Errors")).toBeInTheDocument()
    expect(screen.getByText("Completed with errors")).toBeInTheDocument()
    expect(screen.getByText(/42/)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Download error report" }),
    ).toHaveAttribute("href", "https://example.com/errors.csv")
  })
})
