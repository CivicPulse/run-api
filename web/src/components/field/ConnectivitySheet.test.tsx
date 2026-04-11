import { describe, test, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ConnectivitySheet } from "@/components/field/ConnectivitySheet"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"

vi.mock("@/hooks/useConnectivityStatus", () => ({
  useConnectivityStatus: vi.fn(() => true),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"
import { toast } from "sonner"

const mockUseConnectivityStatus = vi.mocked(useConnectivityStatus)

function makeItem(id: string) {
  return {
    id,
    type: "door_knock" as const,
    payload: {
      walk_list_entry_id: "e1",
      voter_id: "v1",
      result_code: "supporter",
    },
    campaignId: "c1",
    resourceId: "r1",
    createdAt: Date.now() - 60_000,
    retryCount: 0,
  }
}

function makeDeadLetter(
  id: string,
  errorSummary = "Validation failed: voter_id required",
) {
  return {
    id,
    originalId: `orig-${id}`,
    type: "door_knock" as const,
    payload: {
      walk_list_entry_id: "e1",
      voter_id: "v1",
      result_code: "supporter",
    },
    campaignId: "c1",
    resourceId: `walk-list-${id}`,
    addedAt: Date.now() - 120_000,
    failedAt: Date.now() - 30_000,
    errorSummary,
    errorCode: "http_422",
  }
}

describe("ConnectivitySheet", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({
      items: [],
      deadLetter: [],
      isSyncing: false,
      syncStartedAt: null,
      isSlow: false,
      lastSyncAt: null,
    })
    mockUseConnectivityStatus.mockReturnValue(true)
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  test("Test 1: renders queue count + lastSyncAt relative + Dead letter section", () => {
    useOfflineQueueStore.setState({
      items: [makeItem("a"), makeItem("b")],
      lastSyncAt: Date.now() - 2 * 60_000,
    })
    render(<ConnectivitySheet open={true} onOpenChange={() => {}} />)
    expect(screen.getByText(/2 outcomes pending/i)).toBeInTheDocument()
    expect(screen.getByText(/2m ago/i)).toBeInTheDocument()
    expect(screen.getByText(/dead letter/i)).toBeInTheDocument()
  })

  test("Test 2: empty dead-letter shows EmptyState 'No failed syncs'", () => {
    render(<ConnectivitySheet open={true} onOpenChange={() => {}} />)
    expect(screen.getByText(/no failed syncs/i)).toBeInTheDocument()
  })

  test("Test 3: deadLetter with 2 items renders 2 cards with error + Retry + Discard", () => {
    useOfflineQueueStore.setState({
      deadLetter: [
        makeDeadLetter("dl1", "Validation failed: voter_id required"),
        makeDeadLetter("dl2", "HTTP 403 forbidden"),
      ],
    })
    render(<ConnectivitySheet open={true} onOpenChange={() => {}} />)

    expect(
      screen.getByText(/validation failed: voter_id required/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/http 403 forbidden/i)).toBeInTheDocument()

    const retryButtons = screen.getAllByRole("button", { name: /retry/i })
    expect(retryButtons.length).toBe(2)
    const discardButtons = screen.getAllByRole("button", { name: /discard/i })
    expect(discardButtons.length).toBe(2)
  })

  test("Test 4: clicking Retry calls retryDeadLetter(id) + toast + has aria-label", () => {
    const retrySpy = vi.spyOn(useOfflineQueueStore.getState(), "retryDeadLetter")
    useOfflineQueueStore.setState({
      deadLetter: [makeDeadLetter("dl1")],
    })
    render(<ConnectivitySheet open={true} onOpenChange={() => {}} />)

    const retryBtn = screen.getByRole("button", { name: /retry/i })
    expect(retryBtn.getAttribute("aria-label")).toMatch(/retry/i)
    fireEvent.click(retryBtn)
    expect(retrySpy).toHaveBeenCalledWith("dl1")
    expect(toast.success).toHaveBeenCalled()
    retrySpy.mockRestore()
  })

  test("Test 5: clicking Discard opens confirm dialog and calls discardDeadLetter on confirm", () => {
    const discardSpy = vi.spyOn(
      useOfflineQueueStore.getState(),
      "discardDeadLetter",
    )
    useOfflineQueueStore.setState({
      deadLetter: [makeDeadLetter("dl1")],
    })
    render(<ConnectivitySheet open={true} onOpenChange={() => {}} />)

    const discardBtn = screen.getByRole("button", { name: /discard/i })
    expect(discardBtn.getAttribute("aria-label")).toMatch(/discard/i)
    fireEvent.click(discardBtn)

    // ConfirmDialog opens with alertdialog role
    const confirmBtn = screen.getByRole("button", { name: /^confirm$/i })
    fireEvent.click(confirmBtn)

    expect(discardSpy).toHaveBeenCalledWith("dl1")
    discardSpy.mockRestore()
  })

  test("Test 6: uses shadcn Sheet primitive (data-slot=sheet-content)", () => {
    render(<ConnectivitySheet open={true} onOpenChange={() => {}} />)
    // The shadcn Sheet renders a portal element with data-slot="sheet-content"
    const content = document.querySelector('[data-slot="sheet-content"]')
    expect(content).toBeTruthy()
  })

  test("header reflects current connectivity state (Offline)", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<ConnectivitySheet open={true} onOpenChange={() => {}} />)
    expect(
      screen.getByRole("heading", { name: /offline/i }),
    ).toBeInTheDocument()
  })
})
