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

// Plan 110-05 / OFFLINE-02: OfflineBanner scope narrowed to the
// critical prolonged-offline state — banner only renders when the
// user is offline AND has unsynced outcomes. All other surfacing
// (syncing, pending, last-sync) has moved to ConnectivityPill.
describe("OfflineBanner (110-05 narrowed scope)", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ items: [], isSyncing: false })
    mockUseConnectivityStatus.mockReturnValue(true)
  })

  test("renders null when online and queue empty", () => {
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe("")
  })

  test("renders null when online even if items are queued (pill handles it)", () => {
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
    })
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe("")
  })

  test("renders null when offline but queue empty (not critical yet)", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe("")
  })

  test("renders 'Offline . 3 outcomes saved' when offline AND queue non-empty (critical state)", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
        { id: "2", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" }, campaignId: "c1", resourceId: "r1", createdAt: 2, retryCount: 0 },
        { id: "3", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e3", voter_id: "v1", result_code: "refused" }, campaignId: "c1", resourceId: "r1", createdAt: 3, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    expect(screen.getByText(/outcomes saved/)).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  test("renders count with font-semibold", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    const countEl = screen.getByText("1")
    expect(countEl.className).toContain("font-semibold")
  })

  test("has role='status' attribute", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  test("has aria-live='polite' attribute", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.getAttribute("aria-live")).toBe("polite")
  })

  test("aria-label describes offline + count of saved outcomes", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
        { id: "2", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" }, campaignId: "c1", resourceId: "r1", createdAt: 2, retryCount: 0 },
        { id: "3", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e3", voter_id: "v1", result_code: "refused" }, campaignId: "c1", resourceId: "r1", createdAt: 3, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.getAttribute("aria-label")).toBe("You are offline. 3 outcomes saved locally.")
  })

  test("has layout classes: h-8, bg-muted, border-b", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
    })
    render(<OfflineBanner />)

    const banner = screen.getByRole("status")
    expect(banner.className).toContain("h-8")
    expect(banner.className).toContain("bg-muted")
    expect(banner.className).toContain("border-b")
    expect(banner.className).toContain("border-border")
  })

  test("is hidden when online+syncing (pill handles syncing surfacing)", () => {
    mockUseConnectivityStatus.mockReturnValue(true)
    useOfflineQueueStore.setState({
      items: [
        { id: "1", type: "door_knock", payload: { client_uuid: "", walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" }, campaignId: "c1", resourceId: "r1", createdAt: 1, retryCount: 0 },
      ],
      isSyncing: true,
    })
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe("")
  })
})
