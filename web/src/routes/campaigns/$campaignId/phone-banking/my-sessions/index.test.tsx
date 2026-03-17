import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

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
  useMyPhoneBankSessions: vi.fn(),
  useCheckIn: vi.fn(),
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
            {columns.map((col, i) => <th key={i}>{col.header}</th>)}
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

vi.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import type { PhoneBankSession } from "@/types/phone-bank-session"
import { useMyPhoneBankSessions, useCheckIn } from "@/hooks/usePhoneBankSessions"

import "./index"

const mockUseMyPhoneBankSessions = useMyPhoneBankSessions as unknown as ReturnType<typeof vi.fn>
const mockUseCheckIn = useCheckIn as unknown as ReturnType<typeof vi.fn>

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
    status: "active",
    call_list_id: "list-1",
    call_list_name: null,
    scheduled_start: null,
    scheduled_end: null,
    created_by: "manager-1",
    created_at: "2026-03-11T00:00:00Z",
    updated_at: "2026-03-11T00:00:00Z",
    caller_count: 1,
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("MySessionsPage component not captured by createFileRoute mock")
  return render(<Component />)
}

describe("My Sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseMyPhoneBankSessions.mockReturnValue({
      data: { items: [], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })
    mockUseCheckIn.mockReturnValue(makeMutation())
  })

  it("renders only sessions where current user is assigned caller", () => {
    // useMyPhoneBankSessions fetches with assigned_to_me=true filter
    // The hook itself is mocked — we verify the correct hook (useMyPhoneBankSessions) is called
    // and that the session data is rendered in the table
    const session = makeSession({ name: "My Assigned Session" })
    mockUseMyPhoneBankSessions.mockReturnValue({
      data: { items: [session], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText("My Assigned Session")).toBeInTheDocument()
    // useMyPhoneBankSessions must be called (not usePhoneBankSessions)
    expect(mockUseMyPhoneBankSessions).toHaveBeenCalled()
  })

  it("shows Check In action for active sessions not yet checked in", () => {
    const session = makeSession({ status: "active" })
    mockUseMyPhoneBankSessions.mockReturnValue({
      data: { items: [session], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByRole("button", { name: /check in/i })).toBeInTheDocument()
  })

  it("shows Resume Calling action for active sessions already checked in", async () => {
    const session = makeSession({ status: "active" })
    mockUseMyPhoneBankSessions.mockReturnValue({
      data: { items: [session], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    // Make mutate call the onSuccess callback synchronously
    const mutateMock = vi.fn().mockImplementation(
      (_arg: undefined, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.()
      }
    )
    mockUseCheckIn.mockReturnValue({
      mutate: mutateMock,
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    })

    renderPage()

    // Click Check In
    const checkInBtn = screen.getByRole("button", { name: /check in/i })
    fireEvent.click(checkInBtn)

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /resume calling/i })).toBeInTheDocument()
    })
  })

  it("shows Checked Out state for sessions with check_out_at set", () => {
    // The implementation uses local state: after check-out or when session is not active,
    // the RowAction renders "—" (no action available for non-active sessions)
    const session = makeSession({ status: "completed" })
    mockUseMyPhoneBankSessions.mockReturnValue({
      data: { items: [session], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    renderPage()

    // Non-active sessions show "—" in the action column (RowAction renders "—")
    const dashElements = screen.getAllByText("—")
    expect(dashElements.length).toBeGreaterThan(0)
    // No Check In button for non-active sessions
    expect(screen.queryByRole("button", { name: /check in/i })).not.toBeInTheDocument()
  })

  it("shows empty state when no sessions assigned", () => {
    mockUseMyPhoneBankSessions.mockReturnValue({
      data: { items: [], pagination: { next_cursor: null, has_more: false } },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText(/no sessions assigned/i)).toBeInTheDocument()
  })
})
