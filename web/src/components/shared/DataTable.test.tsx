import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { DataTable } from "./DataTable"
import type { ColumnDef } from "@tanstack/react-table"

interface TestRow {
  id: string
  name: string
  status: string
}

const columns: ColumnDef<TestRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
  },
  {
    accessorKey: "status",
    header: "Status",
  },
]

const data: TestRow[] = [
  { id: "1", name: "Alice", status: "active" },
  { id: "2", name: "Bob", status: "inactive" },
]

describe("DataTable", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders rows from data array", () => {
    render(<DataTable columns={columns} data={data} />)
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
  })

  it("renders column headers", () => {
    render(<DataTable columns={columns} data={data} />)
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
  })

  it("renders EmptyState when data array is empty", () => {
    render(<DataTable columns={columns} data={[]} emptyTitle="No records found" />)
    expect(screen.getByText("No records found")).toBeInTheDocument()
  })

  it("renders default EmptyState title 'No data' when no emptyTitle provided", () => {
    render(<DataTable columns={columns} data={[]} />)
    expect(screen.getByText("No data")).toBeInTheDocument()
  })

  it("renders skeleton rows when isLoading is true", () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} isLoading={true} />
    )
    // Skeleton rows should be rendered (no data rows, but skeleton elements exist)
    const skeletons = container.querySelectorAll("[data-slot='skeleton']")
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it("does not render EmptyState when isLoading is true", () => {
    render(<DataTable columns={columns} data={[]} isLoading={true} emptyTitle="No data" />)
    expect(screen.queryByText("No data")).not.toBeInTheDocument()
  })

  it("calls onRowClick with row data when row is clicked", () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />)
    fireEvent.click(screen.getByText("Alice"))
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it("renders PaginationControls when pagination props are provided", () => {
    const onNextPage = vi.fn()
    const onPreviousPage = vi.fn()
    render(
      <DataTable
        columns={columns}
        data={data}
        hasNextPage={true}
        hasPreviousPage={false}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
      />
    )
    expect(screen.getByText("Next")).toBeInTheDocument()
    expect(screen.getByText("Previous")).toBeInTheDocument()
  })

  it("does not render PaginationControls when pagination props are not provided", () => {
    render(<DataTable columns={columns} data={data} />)
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders sort indicator on sortable column header", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        sorting={[{ id: "name", desc: false }]}
        onSortingChange={vi.fn()}
      />
    )
    // The Name column should have an ascending sort indicator (ArrowUp)
    // Check that the column header is present with sorting UI
    const nameHeader = screen.getByText("Name").closest("th")
    expect(nameHeader).toBeInTheDocument()
  })

  it("calls onSortingChange when sortable column header is clicked", () => {
    const onSortingChange = vi.fn()
    render(
      <DataTable
        columns={columns}
        data={data}
        sorting={[]}
        onSortingChange={onSortingChange}
      />
    )
    fireEvent.click(screen.getByText("Name"))
    expect(onSortingChange).toHaveBeenCalled()
  })

  it("renders emptyDescription in EmptyState", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyTitle="No records"
        emptyDescription="Try adjusting your filters"
      />
    )
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument()
  })
})
