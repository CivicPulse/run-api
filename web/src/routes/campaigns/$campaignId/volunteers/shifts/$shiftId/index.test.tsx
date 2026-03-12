import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

const _store = vi.hoisted(() => ({ component: null as React.ComponentType | null }))

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
  useParams: vi.fn(() => ({
    campaignId: "campaign-1",
    shiftId: "shift-1",
  })),
}))

vi.mock("@/hooks/useShifts", () => ({
  useShiftDetail: vi.fn(),
  useShiftVolunteers: vi.fn(),
  useUpdateShiftStatus: vi.fn(),
  useCheckInVolunteer: vi.fn(),
  useCheckOutVolunteer: vi.fn(),
  useRemoveVolunteer: vi.fn(),
  useSelfSignup: vi.fn(),
  useCancelSignup: vi.fn(),
}))

vi.mock("@/hooks/useVolunteers", () => ({
  useVolunteerList: vi.fn(),
}))

vi.mock("@/components/shifts/ShiftDialog", () => ({
  ShiftDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="shift-dialog">
        <button onClick={() => onOpenChange(false)}>Close Dialog</button>
      </div>
    ) : null,
}))

vi.mock("@/components/shifts/AssignVolunteerDialog", () => ({
  AssignVolunteerDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="assign-volunteer-dialog">
        <button onClick={() => onOpenChange(false)}>Close Assign</button>
      </div>
    ) : null,
}))

vi.mock("@/components/shifts/AdjustHoursDialog", () => ({
  AdjustHoursDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="adjust-hours-dialog">
        <button onClick={() => onOpenChange(false)}>Close Adjust</button>
      </div>
    ) : null,
}))

// RequireRole: by default renders children (manager view)
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
      viewer: 0,
      volunteer: 1,
      manager: 2,
      admin: 3,
      owner: 4,
    }
    const userLevel = hierarchy[_roleStore.role] ?? 0
    const required = hierarchy[minimum] ?? 0
    return userLevel >= required ? <>{children}</> : <>{fallback ?? null}</>
  },
}))

vi.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
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
    if (isLoading) return <div>Loading roster...</div>
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
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}))

vi.mock("@/components/shared/EmptyState", () => ({
  EmptyState: ({
    title,
    description,
  }: {
    title: string
    description: string
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import type { Shift } from "@/types/field-ops"
import type { ShiftSignupResponse } from "@/types/shift"
import {
  useShiftDetail,
  useShiftVolunteers,
  useUpdateShiftStatus,
  useCheckInVolunteer,
  useCheckOutVolunteer,
  useRemoveVolunteer,
  useSelfSignup,
  useCancelSignup,
} from "@/hooks/useShifts"
import { useVolunteerList } from "@/hooks/useVolunteers"

// Import module to trigger component registration
import "./index"

const mockUseShiftDetail = useShiftDetail as unknown as ReturnType<typeof vi.fn>
const mockUseShiftVolunteers = useShiftVolunteers as unknown as ReturnType<typeof vi.fn>
const mockUseUpdateShiftStatus = useUpdateShiftStatus as unknown as ReturnType<typeof vi.fn>
const mockUseCheckInVolunteer = useCheckInVolunteer as unknown as ReturnType<typeof vi.fn>
const mockUseCheckOutVolunteer = useCheckOutVolunteer as unknown as ReturnType<typeof vi.fn>
const mockUseRemoveVolunteer = useRemoveVolunteer as unknown as ReturnType<typeof vi.fn>
const mockUseSelfSignup = useSelfSignup as unknown as ReturnType<typeof vi.fn>
const mockUseCancelSignup = useCancelSignup as unknown as ReturnType<typeof vi.fn>
const mockUseVolunteerList = useVolunteerList as unknown as ReturnType<typeof vi.fn>

function makeMutation(mutateAsync?: ReturnType<typeof vi.fn>) {
  return {
    mutate: vi.fn(),
    mutateAsync: mutateAsync ?? vi.fn().mockResolvedValue({}),
    isPending: false,
  }
}

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    campaign_id: "campaign-1",
    name: "Saturday Canvass",
    description: null,
    type: "canvassing",
    status: "scheduled",
    start_at: "2026-03-15T09:00:00Z",
    end_at: "2026-03-15T12:00:00Z",
    max_volunteers: 10,
    location_name: "City Hall",
    street: "100 Main St",
    city: "Springfield",
    state: "IL",
    zip_code: "62701",
    latitude: null,
    longitude: null,
    turf_id: null,
    phone_bank_session_id: null,
    created_by: "user-1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    signed_up_count: 2,
    waitlist_count: 0,
    ...overrides,
  }
}

function makeSignup(overrides: Partial<ShiftSignupResponse> = {}): ShiftSignupResponse {
  return {
    id: "signup-1",
    shift_id: "shift-1",
    volunteer_id: "vol-1",
    status: "signed_up",
    waitlist_position: null,
    check_in_at: null,
    check_out_at: null,
    signed_up_at: "2026-03-10T00:00:00Z",
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component)
    throw new Error("ShiftDetailPage component not captured by createFileRoute mock")
  return render(<Component />)
}

describe("Shift Detail Page (SHFT-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _roleStore.role = "manager"
    mockUseShiftDetail.mockReturnValue({ data: makeShift(), isLoading: false })
    mockUseShiftVolunteers.mockReturnValue({
      data: { items: [], total: 0, has_more: false, next_cursor: null },
      isLoading: false,
    })
    mockUseVolunteerList.mockReturnValue({
      data: { items: [], total: 0, has_more: false, next_cursor: null },
      isLoading: false,
    })
    mockUseUpdateShiftStatus.mockReturnValue(makeMutation())
    mockUseCheckInVolunteer.mockReturnValue(makeMutation())
    mockUseCheckOutVolunteer.mockReturnValue(makeMutation())
    mockUseRemoveVolunteer.mockReturnValue(makeMutation())
    mockUseSelfSignup.mockReturnValue(makeMutation())
    mockUseCancelSignup.mockReturnValue(makeMutation())
  })

  describe("Overview Tab", () => {
    it("renders shift name in the page heading", () => {
      renderPage()

      expect(screen.getByText("Saturday Canvass")).toBeInTheDocument()
    })

    it("renders shift status badge", () => {
      renderPage()

      // The status badge shows "Scheduled" (capitalized in impl)
      const badges = screen.getAllByTestId("status-badge")
      const statusBadge = badges.find((b) => b.textContent?.match(/scheduled/i))
      expect(statusBadge).toBeInTheDocument()
    })

    it("renders shift type badge in overview", () => {
      renderPage()

      const badges = screen.getAllByTestId("status-badge")
      const typeBadge = badges.find((b) => b.textContent === "Canvassing")
      expect(typeBadge).toBeInTheDocument()
    })

    it("renders capacity info showing signed_up_count / max_volunteers", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ signed_up_count: 3, max_volunteers: 10 }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByText(/3\/10 signed up/i)).toBeInTheDocument()
    })

    it("renders waitlist count when > 0", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ signed_up_count: 10, waitlist_count: 2 }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByText(/2 waitlisted/i)).toBeInTheDocument()
    })

    it("renders description when present", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ description: "Bring comfortable shoes." }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByText("Bring comfortable shoes.")).toBeInTheDocument()
    })

    it("shows Back to Shifts navigation link", () => {
      renderPage()

      expect(screen.getByText("Back to Shifts")).toBeInTheDocument()
    })

    it("shows Edit button for scheduled shifts (manager role)", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "scheduled" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument()
    })

    it("does not show Edit button for active shifts", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "active" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument()
    })

    it("shows Activate and Cancel Shift buttons for scheduled shifts (manager)", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "scheduled" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /cancel shift/i })).toBeInTheDocument()
    })

    it("shows Mark Complete button for active shifts (manager)", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "active" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /mark complete/i })).toBeInTheDocument()
    })

    it("shows no transition buttons for completed shifts", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "completed" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /mark complete/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /cancel shift/i })).not.toBeInTheDocument()
    })

    it("shows Sign Up and Cancel Signup buttons for scheduled shifts", () => {
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "scheduled" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /cancel signup/i })).toBeInTheDocument()
    })

    it("renders loading skeleton when shift is loading", () => {
      mockUseShiftDetail.mockReturnValue({ data: undefined, isLoading: true })

      const { container } = renderPage()

      // Skeleton elements are rendered
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
    })

    it("renders empty state when shift not found", () => {
      mockUseShiftDetail.mockReturnValue({ data: undefined, isLoading: false })

      renderPage()

      expect(screen.getByText("Shift not found")).toBeInTheDocument()
    })
  })

  describe("Roster Tab", () => {
    function clickRosterTab() {
      const rosterTab = screen.getByRole("tab", { name: /roster/i })
      fireEvent.mouseDown(rosterTab)
      fireEvent.mouseUp(rosterTab)
      fireEvent.click(rosterTab)
    }

    it("renders Roster tab", () => {
      renderPage()

      expect(screen.getByRole("tab", { name: /roster/i })).toBeInTheDocument()
    })

    it("renders empty roster state when no volunteers are signed up", async () => {
      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(screen.getByText("No volunteers signed up")).toBeInTheDocument()
      })
    })

    it("renders volunteer name resolved from volunteersById lookup", async () => {
      mockUseVolunteerList.mockReturnValue({
        data: {
          items: [
            {
              id: "vol-1",
              first_name: "Alice",
              last_name: "Smith",
              campaign_id: "campaign-1",
              user_id: null,
              status: "active",
              skills: [],
              phone: null,
              email: null,
              street: null,
              city: null,
              state: null,
              zip_code: null,
              emergency_contact_name: null,
              emergency_contact_phone: null,
              notes: null,
              created_by: "user-1",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          total: 1,
          has_more: false,
          next_cursor: null,
        },
        isLoading: false,
      })

      mockUseShiftVolunteers.mockReturnValue({
        data: {
          items: [makeSignup({ volunteer_id: "vol-1" })],
          total: 1,
          has_more: false,
          next_cursor: null,
        },
        isLoading: false,
      })

      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(screen.getByText("Alice Smith")).toBeInTheDocument()
      })
    })

    it("falls back to ID substring when volunteer not in lookup", async () => {
      // No volunteers in useVolunteerList
      mockUseVolunteerList.mockReturnValue({
        data: { items: [], total: 0, has_more: false, next_cursor: null },
        isLoading: false,
      })

      mockUseShiftVolunteers.mockReturnValue({
        data: {
          items: [makeSignup({ volunteer_id: "vol-unknown-uuid-xyz" })],
          total: 1,
          has_more: false,
          next_cursor: null,
        },
        isLoading: false,
      })

      renderPage()

      clickRosterTab()

      await waitFor(() => {
        // Should show first 8 chars of the ID as fallback
        expect(screen.getByText("vol-unkn")).toBeInTheDocument()
      })
    })

    it("renders roster columns: Name, Status, Check In, Check Out, Hours", async () => {
      mockUseShiftVolunteers.mockReturnValue({
        data: {
          items: [makeSignup()],
          total: 1,
          has_more: false,
          next_cursor: null,
        },
        isLoading: false,
      })

      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(screen.getByText("Name")).toBeInTheDocument()
      })

      expect(screen.getByText("Status")).toBeInTheDocument()
      expect(screen.getByText("Check In")).toBeInTheDocument()
      expect(screen.getByText("Check Out")).toBeInTheDocument()
      expect(screen.getByText("Hours")).toBeInTheDocument()
    })

    it("renders Assign Volunteer button for managers", async () => {
      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /assign volunteer/i }),
        ).toBeInTheDocument()
      })
    })

    it("does not render Assign Volunteer button for volunteers", async () => {
      _roleStore.role = "volunteer"

      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /assign volunteer/i }),
        ).not.toBeInTheDocument()
      })
    })

    it("shows Check In button for signed_up volunteer when shift is active (manager)", async () => {
      _roleStore.role = "manager"
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "active" }),
        isLoading: false,
      })

      mockUseShiftVolunteers.mockReturnValue({
        data: {
          items: [makeSignup({ status: "signed_up" })],
          total: 1,
          has_more: false,
          next_cursor: null,
        },
        isLoading: false,
      })

      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /check in/i }),
        ).toBeInTheDocument()
      })
    })

    it("shows Check Out button for checked_in volunteer when shift is active (manager)", async () => {
      _roleStore.role = "manager"
      mockUseShiftDetail.mockReturnValue({
        data: makeShift({ status: "active" }),
        isLoading: false,
      })

      mockUseShiftVolunteers.mockReturnValue({
        data: {
          items: [
            makeSignup({
              status: "checked_in",
              check_in_at: "2026-03-15T09:00:00Z",
            }),
          ],
          total: 1,
          has_more: false,
          next_cursor: null,
        },
        isLoading: false,
      })

      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /check out/i }),
        ).toBeInTheDocument()
      })
    })

    it("Assign Volunteer button opens AssignVolunteerDialog", async () => {
      renderPage()

      clickRosterTab()

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /assign volunteer/i }),
        ).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /assign volunteer/i }))

      await waitFor(() => {
        expect(screen.getByTestId("assign-volunteer-dialog")).toBeInTheDocument()
      })
    })
  })
})
