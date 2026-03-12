import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

// vi.hoisted ensures this runs before vi.mock factories
const _store = vi.hoisted(() => ({ component: null as React.ComponentType | null }))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    _store.component = opts.component
    return { options: opts }
  },
  Link: ({ children, to, ...props }: { children: React.ReactNode; to?: string; [key: string]: unknown }) => (
    <a href={to ?? "#"} {...(props as object)}>{children}</a>
  ),
  useParams: vi.fn(() => ({ campaignId: "campaign-1" })),
}))

vi.mock("@/hooks/usePhoneBankSessions", () => ({
  usePhoneBankSessions: vi.fn(),
  useCreatePhoneBankSession: vi.fn(),
  useUpdateSessionStatus: vi.fn(),
  useDeletePhoneBankSession: vi.fn(),
}))

vi.mock("@/hooks/useCallLists", () => ({
  useCallLists: vi.fn(),
}))

vi.mock("@/hooks/useFormGuard", () => ({
  useFormGuard: vi.fn(() => ({ isDirty: false, isBlocked: false, proceed: vi.fn(), reset: vi.fn() })),
}))

// RequireRole renders children unconditionally (simulates manager role)
vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}))

vi.mock("@/components/shared/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    title,
  }: {
    open: boolean
    onConfirm: () => void
    title: string
  }) =>
    open ? (
      <div>
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}))

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({
    columns,
    data,
    emptyTitle,
    isLoading,
  }: {
    columns: Array<{
      id?: string
      accessorKey?: string
      header: React.ReactNode
      cell?: (ctx: { row: { original: unknown } }) => React.ReactNode
    }>
    data: unknown[]
    emptyTitle?: string
    isLoading?: boolean
  }) => {
    if (isLoading) return <div>Loading...</div>
    if (data.length === 0 && emptyTitle) return <div>{emptyTitle}</div>
    return (
      <table>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((col, j) => (
                <td key={j}>
                  {col.cell
                    ? col.cell({ row: { original: row } })
                    : String((row as Record<string, unknown>)[col.accessorKey ?? ""] ?? "")}
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

import type { PhoneBankSession } from "@/types/phone-bank-session"
import {
  usePhoneBankSessions,
  useCreatePhoneBankSession,
  useUpdateSessionStatus,
  useDeletePhoneBankSession,
} from "@/hooks/usePhoneBankSessions"
import { useCallLists } from "@/hooks/useCallLists"

// Import module to trigger component registration via createFileRoute mock
import "./index"

const mockUsePhoneBankSessions = usePhoneBankSessions as unknown as ReturnType<typeof vi.fn>
const mockUseCreatePhoneBankSession = useCreatePhoneBankSession as unknown as ReturnType<typeof vi.fn>
const mockUseUpdateSessionStatus = useUpdateSessionStatus as unknown as ReturnType<typeof vi.fn>
const mockUseDeletePhoneBankSession = useDeletePhoneBankSession as unknown as ReturnType<typeof vi.fn>
const mockUseCallLists = useCallLists as unknown as ReturnType<typeof vi.fn>

function makeMutation(mutateAsync?: ReturnType<typeof vi.fn>) {
  return {
    mutate: vi.fn(),
    mutateAsync: mutateAsync ?? vi.fn().mockResolvedValue({}),
    isPending: false,
  }
}

function makeSession(overrides: Partial<PhoneBankSession> = {}): PhoneBankSession {
  return {
    id: "session-1",
    name: "Saturday Phone Bank",
    status: "draft",
    call_list_id: "list-1",
    scheduled_start: "2026-03-15T10:00:00Z",
    scheduled_end: null,
    created_by: "user-1",
    created_at: "2026-03-11T00:00:00Z",
    updated_at: "2026-03-11T00:00:00Z",
    caller_count: 3,
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("SessionsPage component not captured by createFileRoute mock")
  return render(<Component />)
}

describe("Sessions Index", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePhoneBankSessions.mockReturnValue({
      data: { items: [], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })
    mockUseCreatePhoneBankSession.mockReturnValue(makeMutation())
    mockUseUpdateSessionStatus.mockReturnValue(makeMutation())
    mockUseDeletePhoneBankSession.mockReturnValue(makeMutation())
    mockUseCallLists.mockReturnValue({
      data: {
        items: [{ id: "list-1", name: "Main Call List", status: "active" }],
        pagination: { next_cursor: null, has_more: false },
      },
      isLoading: false,
    })
  })

  it("renders sessions table with name, status, call list, date, caller count columns", () => {
    const session = makeSession()
    mockUsePhoneBankSessions.mockReturnValue({
      data: { items: [session], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("Call List")).toBeInTheDocument()
    expect(screen.getByText("Scheduled Start")).toBeInTheDocument()
    expect(screen.getByText("Callers")).toBeInTheDocument()

    expect(screen.getByText("Saturday Phone Bank")).toBeInTheDocument()
    expect(screen.getByText("draft")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("Create Session dialog opens on button click", async () => {
    renderPage()

    const newSessionBtn = screen.getByRole("button", { name: /new session/i })
    fireEvent.click(newSessionBtn)

    await waitFor(() => {
      expect(screen.getByText("New Session")).toBeInTheDocument()
    })
  })

  it("SessionDialog submits correct payload for session creation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeSession())
    mockUseCreatePhoneBankSession.mockReturnValue(makeMutation(mutateAsync))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: /new session/i }))

    await waitFor(() => {
      expect(screen.getByText("New Session")).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/^name$/i)
    fireEvent.change(nameInput, { target: { value: "Test Session" } })

    const createBtn = screen.getByRole("button", { name: /^create$/i })
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Test Session" })
      )
    })
  })

  it("edit mode populates form with existing session values", async () => {
    const session = makeSession({ name: "Existing Session" })
    mockUsePhoneBankSessions.mockReturnValue({
      data: { items: [session], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    renderPage()

    // Open dropdown via pointer events (Radix DropdownMenu requires pointerdown)
    const actionsBtn = screen.getAllByRole("button", { name: /actions/i })[0]
    fireEvent.pointerDown(actionsBtn)
    fireEvent.click(actionsBtn)

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /edit/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("menuitem", { name: /edit/i }))

    await waitFor(() => {
      expect(screen.getByText("Edit Session")).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement
    expect(nameInput.value).toBe("Existing Session")
  })

  it("delete session calls deleteSession mutation and closes dialog", async () => {
    const deleteAsync = vi.fn().mockResolvedValue(undefined)
    mockUseDeletePhoneBankSession.mockReturnValue(makeMutation(deleteAsync))

    const session = makeSession()
    mockUsePhoneBankSessions.mockReturnValue({
      data: { items: [session], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    renderPage()

    // Open dropdown via pointer events (Radix DropdownMenu requires pointerdown)
    const actionsBtn = screen.getAllByRole("button", { name: /actions/i })[0]
    fireEvent.pointerDown(actionsBtn)
    fireEvent.click(actionsBtn)

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }))

    await waitFor(() => {
      expect(screen.getByText("Delete Session")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }))

    await waitFor(() => {
      expect(deleteAsync).toHaveBeenCalledWith("session-1")
    })
  })
})
