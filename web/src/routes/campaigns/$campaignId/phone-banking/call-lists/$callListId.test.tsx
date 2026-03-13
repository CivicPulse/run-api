import { render, screen } from "@testing-library/react"
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
  useParams: vi.fn(() => ({ campaignId: "campaign-1", callListId: "call-list-1" })),
}))

vi.mock("@/hooks/useCallLists", () => ({
  useCallList: vi.fn(),
  useCallListEntries: vi.fn(),
  useAppendFromList: vi.fn(),
}))

vi.mock("@/hooks/useMembers", () => ({
  useMembers: vi.fn(),
}))

vi.mock("@/hooks/useVoterLists", () => ({
  useVoterLists: vi.fn(),
}))

vi.mock("@/hooks/useFormGuard", () => ({
  useFormGuard: vi.fn(() => ({
    isDirty: false,
    isBlocked: false,
    proceed: vi.fn(),
    reset: vi.fn(),
  })),
}))

const _roleStore = vi.hoisted(() => ({ role: "manager" }))
vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({
    children,
    minimum,
    fallback,
  }: {
    children: React.ReactNode
    minimum: string
    fallback?: React.ReactNode
  }) => {
    const hierarchy: Record<string, number> = {
      viewer: 0, volunteer: 1, manager: 2, admin: 3, owner: 4,
    }
    const userLevel = hierarchy[_roleStore.role] ?? 0
    const required = hierarchy[minimum] ?? 0
    return userLevel >= required ? <>{children}</> : <>{fallback ?? null}</>
  },
}))

vi.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
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
      header?: React.ReactNode
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

import type { CallListEntry } from "@/types/call-list"
import type { CampaignMember } from "@/types/campaign"
import { useCallList, useCallListEntries, useAppendFromList } from "@/hooks/useCallLists"
import { useMembers } from "@/hooks/useMembers"
import { useVoterLists } from "@/hooks/useVoterLists"

import "./$callListId"

const mockUseCallList = useCallList as unknown as ReturnType<typeof vi.fn>
const mockUseCallListEntries = useCallListEntries as unknown as ReturnType<typeof vi.fn>
const mockUseAppendFromList = useAppendFromList as unknown as ReturnType<typeof vi.fn>
const mockUseMembers = useMembers as unknown as ReturnType<typeof vi.fn>
const mockUseVoterLists = useVoterLists as unknown as ReturnType<typeof vi.fn>

function makeEntry(overrides: Partial<CallListEntry> = {}): CallListEntry {
  return {
    id: "entry-1",
    voter_id: "voter-1",
    voter_name: "John Doe",
    priority_score: 50,
    phone_numbers: [{ phone_id: "ph-1", value: "555-1234", type: "mobile", is_primary: true }],
    status: "available",
    attempt_count: 0,
    claimed_by: null,
    claimed_at: null,
    last_attempt_at: null,
    ...overrides,
  }
}

function makeMember(overrides: Partial<CampaignMember> = {}): CampaignMember {
  return {
    user_id: "member-user-1",
    display_name: "Jane Smith",
    email: "jane@example.com",
    role: "manager",
    synced_at: "2026-03-11T00:00:00Z",
    ...overrides,
  }
}

function makeMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("CallListDetailPage component not captured by createFileRoute mock")
  return render(<Component />)
}

describe("CallListDetailPage - claimed_by display", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _roleStore.role = "manager"
    mockUseCallList.mockReturnValue({
      data: {
        id: "call-list-1",
        name: "Test Call List",
        status: "active",
        total_entries: 10,
        completed_entries: 2,
        created_at: "2026-01-01T00:00:00Z",
        max_attempts: 3,
        claim_timeout_minutes: 30,
        cooldown_minutes: 60,
        voter_list_id: null,
        script_id: null,
        created_by: "user-1",
        updated_at: "2026-01-01T00:00:00Z",
      },
      isLoading: false,
    })
    mockUseCallListEntries.mockReturnValue({
      data: { items: [], total: 0, page: 1, size: 50, pages: 0 },
      isLoading: false,
    })
    mockUseAppendFromList.mockReturnValue(makeMutation())
    mockUseMembers.mockReturnValue({
      data: { items: [], total: 0, page: 1, size: 50, pages: 0 },
      isLoading: false,
    })
    mockUseVoterLists.mockReturnValue({ data: [], isLoading: false })
  })

  it("shows member display_name and role badge when claimed_by matches a member", () => {
    const member = makeMember({ user_id: "user-abc-123", display_name: "Alice Admin", role: "admin" })
    const entry = makeEntry({ claimed_by: "user-abc-123", status: "in_progress" })

    mockUseCallListEntries.mockReturnValue({
      data: { items: [entry], total: 1, page: 1, size: 50, pages: 1 },
      isLoading: false,
    })
    mockUseMembers.mockReturnValue({
      data: { items: [member], total: 1, page: 1, size: 50, pages: 1 },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText("Alice Admin")).toBeInTheDocument()
    expect(screen.getByText("admin")).toBeInTheDocument()
  })

  it("shows truncated UUID (first 12 chars + '...') when claimed_by UUID not in members list", () => {
    const entry = makeEntry({
      claimed_by: "unknown-user-id-very-long-uuid",
      status: "in_progress",
    })

    mockUseCallListEntries.mockReturnValue({
      data: { items: [entry], total: 1, page: 1, size: 50, pages: 1 },
      isLoading: false,
    })
    // No members that match this UUID
    mockUseMembers.mockReturnValue({
      data: { items: [], total: 0, page: 1, size: 50, pages: 0 },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText("unknown-user...")).toBeInTheDocument()
  })

  it("shows '--' for unclaimed entries (claimed_by is null)", () => {
    const entry = makeEntry({ claimed_by: null, status: "available" })

    mockUseCallListEntries.mockReturnValue({
      data: { items: [entry], total: 1, page: 1, size: 50, pages: 1 },
      isLoading: false,
    })

    renderPage()

    // The assigned caller column should show "--"
    const rows = screen.getAllByTestId("table-row")
    expect(rows).toHaveLength(1)
    expect(screen.getByText("--")).toBeInTheDocument()
  })
})
