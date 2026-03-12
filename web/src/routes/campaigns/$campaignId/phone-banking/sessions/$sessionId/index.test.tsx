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
  useParams: vi.fn(() => ({ campaignId: "campaign-1", sessionId: "session-1" })),
}))

vi.mock("@/hooks/usePhoneBankSessions", () => ({
  usePhoneBankSession: vi.fn(),
  useSessionCallers: vi.fn(),
  useUpdateSessionStatus: vi.fn(),
  useAssignCaller: vi.fn(),
  useRemoveCaller: vi.fn(),
  useCheckIn: vi.fn(),
  useCheckOut: vi.fn(),
  useSessionProgress: vi.fn(),
  useReassignEntry: vi.fn(),
}))

// RequireRole: by default render children (manager view)
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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import type { PhoneBankSession, SessionCaller, SessionProgressResponse } from "@/types/phone-bank-session"
import {
  usePhoneBankSession,
  useSessionCallers,
  useUpdateSessionStatus,
  useAssignCaller,
  useRemoveCaller,
  useCheckIn,
  useCheckOut,
  useSessionProgress,
  useReassignEntry,
} from "@/hooks/usePhoneBankSessions"

import "./index"

const mockUsePhoneBankSession = usePhoneBankSession as unknown as ReturnType<typeof vi.fn>
const mockUseSessionCallers = useSessionCallers as unknown as ReturnType<typeof vi.fn>
const mockUseUpdateSessionStatus = useUpdateSessionStatus as unknown as ReturnType<typeof vi.fn>
const mockUseAssignCaller = useAssignCaller as unknown as ReturnType<typeof vi.fn>
const mockUseRemoveCaller = useRemoveCaller as unknown as ReturnType<typeof vi.fn>
const mockUseCheckIn = useCheckIn as unknown as ReturnType<typeof vi.fn>
const mockUseCheckOut = useCheckOut as unknown as ReturnType<typeof vi.fn>
const mockUseSessionProgress = useSessionProgress as unknown as ReturnType<typeof vi.fn>
const mockUseReassignEntry = useReassignEntry as unknown as ReturnType<typeof vi.fn>

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
    scheduled_start: null,
    scheduled_end: null,
    created_by: "user-1",
    created_at: "2026-03-11T00:00:00Z",
    updated_at: "2026-03-11T00:00:00Z",
    caller_count: 0,
    ...overrides,
  }
}

function makeCaller(overrides: Partial<SessionCaller> = {}): SessionCaller {
  return {
    id: "caller-1",
    session_id: "session-1",
    user_id: "user-abc-123-def-456",
    check_in_at: null,
    check_out_at: null,
    created_at: "2026-03-11T00:00:00Z",
    ...overrides,
  }
}

function makeProgress(overrides: Partial<SessionProgressResponse> = {}): SessionProgressResponse {
  return {
    session_id: "session-1",
    total_entries: 100,
    completed: 42,
    in_progress: 3,
    available: 55,
    callers: [],
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("SessionDetailPage component not captured by createFileRoute mock")
  return render(<Component />)
}

describe("Session Detail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _roleStore.role = "manager"
    mockUsePhoneBankSession.mockReturnValue({ data: makeSession(), isLoading: false })
    mockUseSessionCallers.mockReturnValue({ data: [], isLoading: false })
    mockUseUpdateSessionStatus.mockReturnValue(makeMutation())
    mockUseAssignCaller.mockReturnValue(makeMutation())
    mockUseRemoveCaller.mockReturnValue(makeMutation())
    mockUseCheckIn.mockReturnValue(makeMutation())
    mockUseCheckOut.mockReturnValue(makeMutation())
    mockUseSessionProgress.mockReturnValue({ data: undefined, isLoading: false })
    mockUseReassignEntry.mockReturnValue(makeMutation())
  })

  describe("Status Transitions (PHON-02)", () => {
    it("shows Activate button only for draft sessions", () => {
      mockUsePhoneBankSession.mockReturnValue({
        data: makeSession({ status: "draft" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /resume/i })).not.toBeInTheDocument()
    })

    it("shows Pause and Complete buttons for active sessions", () => {
      mockUsePhoneBankSession.mockReturnValue({
        data: makeSession({ status: "active" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /complete/i })).toBeInTheDocument()
    })

    it("shows Resume and Complete buttons for paused sessions", () => {
      mockUsePhoneBankSession.mockReturnValue({
        data: makeSession({ status: "paused" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /complete/i })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument()
    })

    it("shows no transition buttons for completed sessions", () => {
      mockUsePhoneBankSession.mockReturnValue({
        data: makeSession({ status: "completed" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /resume/i })).not.toBeInTheDocument()
    })
  })

  describe("Caller Management (PHON-03)", () => {
    it("renders caller management table with assigned callers", () => {
      const caller = makeCaller({ user_id: "user-abc-123-def-456" })
      mockUseSessionCallers.mockReturnValue({ data: [caller], isLoading: false })

      renderPage()

      // Caller user_id is displayed (sliced to 12 chars + ellipsis)
      expect(screen.getByText(/user-abc-123/)).toBeInTheDocument()
    })

    it("Add Caller triggers assignCaller mutation with selected user", async () => {
      const mutateAsync = vi.fn().mockResolvedValue(makeCaller())
      mockUseAssignCaller.mockReturnValue(makeMutation(mutateAsync))

      renderPage()

      // Click Add Caller button
      const addCallerBtn = screen.getByRole("button", { name: /\+ add caller/i })
      fireEvent.click(addCallerBtn)

      // Dialog opens
      await waitFor(() => {
        expect(screen.getByText("Add Caller")).toBeInTheDocument()
      })

      // Fill in user ID
      const userIdInput = screen.getByLabelText(/user id/i)
      fireEvent.change(userIdInput, { target: { value: "new-user-123" } })

      // Submit
      const addBtn = screen.getByRole("button", { name: /^add$/i })
      fireEvent.click(addBtn)

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith("new-user-123")
      })
    })

    it("Remove Caller kebab action triggers removeCaller mutation", async () => {
      const removeAsync = vi.fn().mockResolvedValue(undefined)
      mockUseRemoveCaller.mockReturnValue(makeMutation(removeAsync))

      const caller = makeCaller({ user_id: "user-abc-123-def-456" })
      mockUseSessionCallers.mockReturnValue({ data: [caller], isLoading: false })

      renderPage()

      // Open kebab menu on caller row
      const moreButtons = screen.getAllByRole("button", { name: /actions/i })
      fireEvent.pointerDown(moreButtons[0])
      fireEvent.click(moreButtons[0])

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /remove caller/i })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole("menuitem", { name: /remove caller/i }))

      await waitFor(() => {
        expect(removeAsync).toHaveBeenCalledWith("user-abc-123-def-456")
      })
    })
  })

  describe("Check In / Check Out (PHON-04)", () => {
    it("Check In button visible to volunteer role when session is active", () => {
      _roleStore.role = "volunteer"
      mockUsePhoneBankSession.mockReturnValue({
        data: makeSession({ status: "active" }),
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /check in/i })).toBeInTheDocument()
    })

    it("Start Calling button visible after check-in", async () => {
      _roleStore.role = "volunteer"
      const checkInMutateAsync = vi.fn().mockResolvedValue(makeCaller({ check_in_at: "2026-03-11T10:00:00Z" }))
      mockUseCheckIn.mockReturnValue(makeMutation(checkInMutateAsync))
      mockUsePhoneBankSession.mockReturnValue({
        data: makeSession({ status: "active" }),
        isLoading: false,
      })

      renderPage()

      // Click Check In
      const checkInBtn = screen.getByRole("button", { name: /check in/i })
      fireEvent.click(checkInBtn)

      await waitFor(() => {
        expect(checkInMutateAsync).toHaveBeenCalled()
      })

      // After check-in, Start Calling link should appear
      await waitFor(() => {
        expect(screen.getByRole("link", { name: /start calling/i })).toBeInTheDocument()
      })
    })

    it("Check Out button visible to checked-in caller", async () => {
      _roleStore.role = "volunteer"
      const checkInMutateAsync = vi.fn().mockResolvedValue(makeCaller())
      mockUseCheckIn.mockReturnValue(makeMutation(checkInMutateAsync))
      mockUsePhoneBankSession.mockReturnValue({
        data: makeSession({ status: "active" }),
        isLoading: false,
      })

      renderPage()

      // Check in first
      fireEvent.click(screen.getByRole("button", { name: /check in/i }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /check out/i })).toBeInTheDocument()
      })
    })
  })

  describe("Progress Tab (PHON-09, PHON-10)", () => {
    beforeEach(() => {
      _roleStore.role = "manager"
    })

    function clickProgressTab() {
      // Radix Tabs requires mousedown + mouseup + click to activate
      const progressTab = screen.getByRole("tab", { name: /progress/i })
      fireEvent.mouseDown(progressTab)
      fireEvent.mouseUp(progressTab)
      fireEvent.click(progressTab)
    }

    it("progress bar shows completion percentage", async () => {
      const progress = makeProgress({ total_entries: 100, completed: 42 })
      mockUseSessionProgress.mockReturnValue({ data: progress, isLoading: false })

      renderPage()

      clickProgressTab()

      await waitFor(() => {
        // 42% completion shown in progress bar label
        expect(screen.getByText("42%")).toBeInTheDocument()
      })
    })

    it("stat chips show Total, Completed, In Progress, Available counts", async () => {
      const progress = makeProgress({
        total_entries: 100,
        completed: 42,
        in_progress: 3,
        available: 55,
      })
      mockUseSessionProgress.mockReturnValue({ data: progress, isLoading: false })

      renderPage()

      clickProgressTab()

      await waitFor(() => {
        expect(screen.getByText("Total")).toBeInTheDocument()
        expect(screen.getByText("Completed")).toBeInTheDocument()
        expect(screen.getByText("In Progress")).toBeInTheDocument()
        expect(screen.getByText("Available")).toBeInTheDocument()
        expect(screen.getByText("100")).toBeInTheDocument()
        expect(screen.getByText("42")).toBeInTheDocument()
        expect(screen.getByText("3")).toBeInTheDocument()
        expect(screen.getByText("55")).toBeInTheDocument()
      })
    })

    it("per-caller table renders with Reassign kebab menu for managers", async () => {
      const progress = makeProgress({
        callers: [
          {
            user_id: "caller-user-id-xyz",
            calls_made: 5,
            check_in_at: "2026-03-11T10:00:00Z",
            check_out_at: null,
          },
        ],
      })
      mockUseSessionProgress.mockReturnValue({ data: progress, isLoading: false })

      renderPage()

      clickProgressTab()

      await waitFor(() => {
        // Caller row renders (user_id sliced to 12 chars: "caller-user-i…")
        expect(screen.getByText(/caller-user/)).toBeInTheDocument()
        // Calls made
        expect(screen.getByText("5")).toBeInTheDocument()
      })

      // Reassign kebab (⋮ button) is present
      expect(screen.getByText("⋮")).toBeInTheDocument()
    })

    it("reassign action opens reassign dialog", async () => {
      const progress = makeProgress({
        callers: [
          {
            user_id: "caller-user-id-xyz",
            calls_made: 2,
            check_in_at: "2026-03-11T10:00:00Z",
            check_out_at: null,
          },
        ],
      })
      mockUseSessionProgress.mockReturnValue({ data: progress, isLoading: false })

      renderPage()

      clickProgressTab()

      await waitFor(() => {
        expect(screen.getByText("⋮")).toBeInTheDocument()
      })

      // Open kebab via the ⋮ button
      const reassignTrigger = screen.getByText("⋮").closest("button")!
      fireEvent.pointerDown(reassignTrigger)
      fireEvent.click(reassignTrigger)

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /reassign entries/i })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole("menuitem", { name: /reassign entries/i }))

      // Reassign info dialog opens
      await waitFor(() => {
        expect(screen.getByText("Reassign Entries")).toBeInTheDocument()
      })
    })
  })
})
