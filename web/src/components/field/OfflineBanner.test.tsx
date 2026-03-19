import { describe, test, expect, beforeEach, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { OfflineBanner } from "@/components/field/OfflineBanner"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"

// Mock useConnectivityStatus
vi.mock("@/hooks/useConnectivityStatus", () => ({
  useConnectivityStatus: vi.fn(() => true),
}))

import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"

const mockUseConnectivityStatus = vi.mocked(useConnectivityStatus)

describe("OfflineBanner", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ items: [], isSyncing: false })
    mockUseConnectivityStatus.mockReturnValue(true)
  })

  test("renders null when online and queue is empty", () => {
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe("")
  })

  test("renders 'Offline' text with WifiOff icon when offline and queue empty", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<OfflineBanner />)

    expect(screen.getByText("Offline")).toBeInTheDocument()
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  test("renders 'Offline . 3 outcomes saved' when offline and items.length=3", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
        { id: "2", type: "door_knock", payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" }, campaignId: "c1", resourceId: "r1", createdAt: 2, retryCount: 0 },
        { id: "3", type: "door_knock", payload: { walk_list_entry_id: "e3", voter_id: "v1", result_code: "refused" }, campaignId: "c1", resourceId: "r1", createdAt: 3, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    expect(screen.getByText(/outcomes saved/)).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  test("renders count with font-semibold when N > 0", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    const countEl = screen.getByText("1")
    expect(countEl.className).toContain("font-semibold")
  })

  test("renders 'Syncing 3 outcomes...' with Loader2 spinner when online and isSyncing=true", () => {
    mockUseConnectivityStatus.mockReturnValue(true)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
        { id: "2", type: "door_knock", payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" }, campaignId: "c1", resourceId: "r1", createdAt: 2, retryCount: 0 },
        { id: "3", type: "door_knock", payload: { walk_list_entry_id: "e3", voter_id: "v1", result_code: "refused" }, campaignId: "c1", resourceId: "r1", createdAt: 3, retryCount: 0 },
      ],
      isSyncing: true,
    })
    render(<OfflineBanner />)

    expect(screen.getByText(/Syncing/)).toBeInTheDocument()
    expect(screen.getByText(/outcomes\.\.\./)).toBeInTheDocument()
  })

  test("renders Loader2 with animate-spin class when syncing", () => {
    mockUseConnectivityStatus.mockReturnValue(true)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
      isSyncing: true,
    })
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    const svg = banner.querySelector("svg")
    expect(svg).toBeTruthy()
    expect(svg!.classList.toString()).toContain("animate-spin")
  })

  test("has role='status' attribute", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<OfflineBanner />)

    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  test("has aria-live='polite' attribute", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.getAttribute("aria-live")).toBe("polite")
  })

  test("has correct aria-label for offline state with items", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
        { id: "2", type: "door_knock", payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" }, campaignId: "c1", resourceId: "r1", createdAt: 2, retryCount: 0 },
        { id: "3", type: "door_knock", payload: { walk_list_entry_id: "e3", voter_id: "v1", result_code: "refused" }, campaignId: "c1", resourceId: "r1", createdAt: 3, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.getAttribute("aria-label")).toBe("You are offline. 3 outcomes saved locally.")
  })

  test("has correct aria-label for syncing state", () => {
    mockUseConnectivityStatus.mockReturnValue(true)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
        { id: "2", type: "door_knock", payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" }, campaignId: "c1", resourceId: "r1", createdAt: 2, retryCount: 0 },
        { id: "3", type: "door_knock", payload: { walk_list_entry_id: "e3", voter_id: "v1", result_code: "refused" }, campaignId: "c1", resourceId: "r1", createdAt: 3, retryCount: 0 },
      ],
      isSyncing: true,
    })
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.getAttribute("aria-label")).toBe("Syncing 3 outcomes to server.")
  })

  test("has h-8 height class", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.className).toContain("h-8")
  })

  test("has bg-muted background class", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.className).toContain("bg-muted")
  })

  test("has border-b border-border classes", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.className).toContain("border-b")
    expect(banner.className).toContain("border-border")
  })

  test("State 5: online, not syncing, items remain - shows banner with count", () => {
    mockUseConnectivityStatus.mockReturnValue(true)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 1 },
        { id: "2", type: "door_knock", payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" }, campaignId: "c1", resourceId: "r1", createdAt: 2, retryCount: 1 },
      ],
      isSyncing: false,
    })
    render(<OfflineBanner />)

    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText(/outcomes saved/)).toBeInTheDocument()
  })

  test("renders null when online, not syncing, queue empty (State 1)", () => {
    mockUseConnectivityStatus.mockReturnValue(true)
    useOfflineQueueStore.setState({ items: [], isSyncing: false })

    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe("")
  })
})
