import { render, screen } from "@testing-library/react"
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

vi.mock("@/hooks/useShifts", () => ({
  useShiftList: vi.fn(),
  useCreateShift: vi.fn(),
  useUpdateShift: vi.fn(),
  useDeleteShift: vi.fn(),
  useSelfSignup: vi.fn(),
  useCancelSignup: vi.fn(),
  useUpdateShiftStatus: vi.fn(),
}))

vi.mock("@/components/shifts/ShiftDialog", () => ({
  ShiftDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? (
      <div data-testid="shift-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}))

vi.mock("@/components/shifts/ShiftCard", () => ({
  ShiftCard: ({ shift }: { shift: { name: string; id: string } }) => (
    <div data-testid={`shift-card-${shift.id}`}>{shift.name}</div>
  ),
}))

// RequireRole renders children unconditionally (simulates manager role)
vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shared/EmptyState", () => ({
  EmptyState: ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
      {action}
    </div>
  ),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import type { Shift } from "@/types/field-ops"
import { useShiftList } from "@/hooks/useShifts"

// Import the module to trigger component registration via createFileRoute mock
import "./index"

const mockUseShiftList = useShiftList as unknown as ReturnType<typeof vi.fn>

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    campaign_id: "campaign-1",
    name: "Saturday Canvass",
    description: null,
    type: "canvassing",
    status: "scheduled",
    start_at: new Date().toISOString(), // defaults to today
    end_at: new Date(Date.now() + 3 * 3600000).toISOString(),
    max_volunteers: 10,
    location_name: "City Hall",
    street: null,
    city: null,
    state: null,
    zip_code: null,
    latitude: null,
    longitude: null,
    turf_id: null,
    phone_bank_session_id: null,
    created_by: "user-1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    signed_up_count: 0,
    waitlist_count: 0,
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("ShiftListPage component not captured by createFileRoute mock")
  return render(<Component />)
}

describe("Shift List Page (SHFT-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseShiftList.mockReturnValue({
      data: { items: [], total: 0, has_more: false, next_cursor: null },
      isLoading: false,
    })
  })

  it("renders empty state with correct title when no shifts exist", () => {
    renderPage()

    expect(screen.getByTestId("empty-state")).toBeInTheDocument()
    expect(screen.getByText("No shifts yet")).toBeInTheDocument()
    expect(
      screen.getByText("Create your first shift to start scheduling volunteers"),
    ).toBeInTheDocument()
  })

  it("renders the Shifts heading", () => {
    renderPage()

    expect(screen.getByText("Shifts")).toBeInTheDocument()
  })

  it("renders Create Shift button for managers", () => {
    renderPage()

    // The manager button in the header
    const createButtons = screen.getAllByRole("button", {
      name: /create shift/i,
    })
    expect(createButtons.length).toBeGreaterThan(0)
  })

  it("renders status and type filter controls", () => {
    renderPage()

    // Filter selects render as role=combobox in Radix UI
    const comboboxes = screen.getAllByRole("combobox")
    expect(comboboxes.length).toBeGreaterThanOrEqual(2)
  })

  it("renders a shift card when shifts are returned", () => {
    const shift = makeShift({ id: "shift-1", name: "Saturday Canvass" })
    mockUseShiftList.mockReturnValue({
      data: { items: [shift], total: 1, has_more: false, next_cursor: null },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByTestId("shift-card-shift-1")).toBeInTheDocument()
    expect(screen.getByText("Saturday Canvass")).toBeInTheDocument()
  })

  it("groups shifts into Today section when start_at is today", () => {
    const todayShift = makeShift({
      id: "shift-today",
      name: "Today Shift",
      start_at: new Date().toISOString(),
    })

    mockUseShiftList.mockReturnValue({
      data: { items: [todayShift], total: 1, has_more: false, next_cursor: null },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText("Today")).toBeInTheDocument()
    expect(screen.getByText("Today Shift")).toBeInTheDocument()
  })

  it("groups shifts into Past section when start_at is before today", () => {
    const pastDate = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const pastShift = makeShift({
      id: "shift-past",
      name: "Past Shift",
      start_at: pastDate,
      end_at: new Date(new Date(pastDate).getTime() + 3 * 3600000).toISOString(),
    })

    mockUseShiftList.mockReturnValue({
      data: { items: [pastShift], total: 1, has_more: false, next_cursor: null },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText("Past")).toBeInTheDocument()
    expect(screen.getByText("Past Shift")).toBeInTheDocument()
  })

  it("groups shifts into Upcoming section when start_at is after this week", () => {
    // Use a date clearly in the future (30 days out) to avoid edge cases with current week
    const futureDate = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const upcomingShift = makeShift({
      id: "shift-upcoming",
      name: "Upcoming Shift",
      start_at: futureDate,
      end_at: new Date(new Date(futureDate).getTime() + 3 * 3600000).toISOString(),
    })

    mockUseShiftList.mockReturnValue({
      data: { items: [upcomingShift], total: 1, has_more: false, next_cursor: null },
      isLoading: false,
    })

    renderPage()

    expect(screen.getByText("Upcoming")).toBeInTheDocument()
    expect(screen.getByText("Upcoming Shift")).toBeInTheDocument()
  })

  it("shows loading indicator when data is loading", () => {
    mockUseShiftList.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    renderPage()

    // Loader2 spinner rendered in loading state
    const container = renderPage()
    expect(container.container.querySelector("svg")).toBeInTheDocument()
  })

  it("only returns non-empty date groups in display order", () => {
    const todayShift = makeShift({
      id: "shift-today",
      name: "Today Shift",
      start_at: new Date().toISOString(),
    })
    const pastDate = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const pastShift = makeShift({
      id: "shift-past",
      name: "Past Shift",
      start_at: pastDate,
      end_at: new Date(new Date(pastDate).getTime() + 3 * 3600000).toISOString(),
    })

    mockUseShiftList.mockReturnValue({
      data: {
        items: [todayShift, pastShift],
        total: 2,
        has_more: false,
        next_cursor: null,
      },
      isLoading: false,
    })

    renderPage()

    // Both groups appear
    expect(screen.getByText("Today")).toBeInTheDocument()
    expect(screen.getByText("Past")).toBeInTheDocument()
    // "This Week" and "Upcoming" groups do not appear (no shifts in those buckets)
    expect(screen.queryByText("This Week")).not.toBeInTheDocument()
    expect(screen.queryByText("Upcoming")).not.toBeInTheDocument()
  })
})
