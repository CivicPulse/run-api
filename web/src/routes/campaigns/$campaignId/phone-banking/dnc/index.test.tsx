import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

// vi.hoisted ensures this runs before vi.mock factories
const _store = vi.hoisted(() => ({
  component: null as React.ComponentType | null,
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    _store.component = opts.component
    return { options: opts }
  },
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode
    to?: string
    [key: string]: unknown
  }) => (
    <a href={to ?? "#"} {...(props as object)}>
      {children}
    </a>
  ),
  useParams: vi.fn(() => ({ campaignId: "campaign-1" })),
}))

vi.mock("@/hooks/useDNC", () => ({
  useDNCEntries: vi.fn(),
  useAddDNCEntry: vi.fn(),
  useDeleteDNCEntry: vi.fn(),
  useImportDNC: vi.fn(),
}))

vi.mock("@/hooks/useFormGuard", () => ({
  useFormGuard: vi.fn(() => ({
    isDirty: false,
    isBlocked: false,
    proceed: vi.fn(),
    reset: vi.fn(),
  })),
}))

vi.mock("@/components/shared/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({
    columns,
    data,
    emptyTitle,
    emptyDescription,
  }: {
    columns: Array<{
      id?: string
      accessorKey?: string
      header: React.ReactNode
      cell?: (ctx: { row: { original: unknown } }) => React.ReactNode
    }>
    data: unknown[]
    emptyTitle?: string
    emptyDescription?: string
  }) => {
    if (data.length === 0 && emptyTitle)
      return (
        <div>
          <div data-testid="empty-title">{emptyTitle}</div>
          {emptyDescription && <div>{emptyDescription}</div>}
        </div>
      )
    return (
      <table data-testid="data-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{typeof col.header === "string" ? col.header : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} data-testid="table-row">
              {columns.map((col, j) => (
                <td key={j}>
                  {col.cell
                    ? col.cell({ row: { original: row } })
                    : String(
                        (row as Record<string, unknown>)[
                          col.accessorKey ?? ""
                        ] ?? "",
                      )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  },
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import type { DNCEntry } from "@/types/dnc"
import {
  useDNCEntries,
  useAddDNCEntry,
  useDeleteDNCEntry,
  useImportDNC,
} from "@/hooks/useDNC"

// Import module to trigger component registration via createFileRoute mock
import "./index"

const mockUseDNCEntries = useDNCEntries as unknown as ReturnType<typeof vi.fn>
const mockUseAddDNCEntry = useAddDNCEntry as unknown as ReturnType<typeof vi.fn>
const mockUseDeleteDNCEntry = useDeleteDNCEntry as unknown as ReturnType<
  typeof vi.fn
>
const mockUseImportDNC = useImportDNC as unknown as ReturnType<typeof vi.fn>

function makeMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }
}

function makeEntry(overrides: Partial<DNCEntry> = {}): DNCEntry {
  return {
    id: "dnc-1",
    phone_number: "5551234567",
    reason: "Requested",
    added_by: "user-1",
    added_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component)
    throw new Error(
      "DNCListPage component not captured by createFileRoute mock",
    )
  return render(<Component />)
}

describe("DNCListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDNCEntries.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseAddDNCEntry.mockReturnValue(makeMutation())
    mockUseDeleteDNCEntry.mockReturnValue(makeMutation())
    mockUseImportDNC.mockReturnValue(makeMutation())
  })

  it("client-side search input filters DNC entries by phone_number substring", async () => {
    const entries = [
      makeEntry({ id: "dnc-1", phone_number: "5551234567" }),
      makeEntry({ id: "dnc-2", phone_number: "5559876543" }),
      makeEntry({ id: "dnc-3", phone_number: "5551112222" }),
    ]
    mockUseDNCEntries.mockReturnValue({ data: entries, isLoading: false })

    renderPage()

    // Type a partial phone number that matches only the first entry
    const searchInput = screen.getByPlaceholderText("Search phone numbers or reasons...")
    fireEvent.change(searchInput, { target: { value: "1234" } })

    await waitFor(() => {
      const rows = screen.getAllByTestId("table-row")
      expect(rows).toHaveLength(1)
    })
  })

  it("search with digits only strips non-digit characters before comparing", async () => {
    const entries = [
      makeEntry({ id: "dnc-1", phone_number: "5551234567" }),
      makeEntry({ id: "dnc-2", phone_number: "5559876543" }),
      makeEntry({ id: "dnc-3", phone_number: "5551112222" }),
    ]
    mockUseDNCEntries.mockReturnValue({ data: entries, isLoading: false })

    renderPage()

    // Type formatted phone number — non-digit characters should be stripped
    // "(555) 123" -> "555123" which matches "5551234567" and "5551232..." entries
    const searchInput = screen.getByPlaceholderText("Search phone numbers or reasons...")
    fireEvent.change(searchInput, { target: { value: "(555) 987" } })

    await waitFor(() => {
      const rows = screen.getAllByTestId("table-row")
      // Only "5559876543" matches "555987"
      expect(rows).toHaveLength(1)
    })
  })

  it("empty search string shows all entries", () => {
    const entries = [
      makeEntry({ id: "dnc-1", phone_number: "5551234567" }),
      makeEntry({ id: "dnc-2", phone_number: "5559876543" }),
      makeEntry({ id: "dnc-3", phone_number: "5551112222" }),
    ]
    mockUseDNCEntries.mockReturnValue({ data: entries, isLoading: false })

    renderPage()

    // No search input interaction — default empty string
    const rows = screen.getAllByTestId("table-row")
    expect(rows).toHaveLength(3)
  })

  it("search with no matching entries shows empty state message", async () => {
    const entries = [
      makeEntry({ id: "dnc-1", phone_number: "5551234567" }),
      makeEntry({ id: "dnc-2", phone_number: "5559876543" }),
    ]
    mockUseDNCEntries.mockReturnValue({ data: entries, isLoading: false })

    renderPage()

    const searchInput = screen.getByPlaceholderText("Search phone numbers or reasons...")
    fireEvent.change(searchInput, { target: { value: "0000000000" } })

    await waitFor(() => {
      expect(screen.getByTestId("empty-title")).toHaveTextContent(
        "No numbers match your search",
      )
    })
  })
})
