import { describe, test, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ConnectivityPill } from "@/components/field/ConnectivityPill"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"

vi.mock("@/hooks/useConnectivityStatus", () => ({
  useConnectivityStatus: vi.fn(() => true),
}))

import { useConnectivityStatus } from "@/hooks/useConnectivityStatus"

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
    createdAt: 1,
    retryCount: 0,
  }
}

function makeDeadLetter(id: string, errorSummary = "Validation failed") {
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
    resourceId: "r1",
    addedAt: 1,
    failedAt: 2,
    errorSummary,
    errorCode: "http_422",
  }
}

describe("ConnectivityPill", () => {
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
  })

  test("Test 1: online + empty queue + no dead-letter renders Online with Wifi icon", () => {
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    expect(button).toHaveTextContent(/online/i)
    // Wifi icon is lucide svg — check by data-lucide-like class marker or tag name
    const svg = button.querySelector("svg")
    expect(svg).toBeTruthy()
    // Green status dot token class present on the state wrapper
    expect(button.className).toContain("text-status-success-foreground")
  })

  test("Test 2: offline renders Offline with WifiOff icon and warning tone", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    expect(button).toHaveTextContent(/offline/i)
    expect(button.className).toContain("text-status-warning-foreground")
  })

  test("Test 3: online + syncing + !isSlow renders Syncing N with animate-spin", () => {
    useOfflineQueueStore.setState({
      items: [makeItem("a"), makeItem("b")],
      isSyncing: true,
      syncStartedAt: Date.now(),
      isSlow: false,
    })
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    expect(button).toHaveTextContent(/syncing/i)
    expect(button).toHaveTextContent("2")
    const svg = button.querySelector("svg")
    expect(svg).toBeTruthy()
    expect(svg!.classList.toString()).toContain("animate-spin")
  })

  test("Test 4: online + syncing + isSlow renders Syncing N (slow) dim", () => {
    useOfflineQueueStore.setState({
      items: [makeItem("a")],
      isSyncing: true,
      syncStartedAt: Date.now() - 31_000,
      isSlow: true,
    })
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    expect(button).toHaveTextContent(/slow/i)
    // "dim" = opacity utility class
    expect(button.className).toMatch(/opacity-/)
  })

  test("Test 5: online + not syncing + items.length > 0 renders N pending with warning dot", () => {
    useOfflineQueueStore.setState({
      items: [makeItem("a"), makeItem("b"), makeItem("c")],
      isSyncing: false,
    })
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    expect(button).toHaveTextContent(/pending/i)
    expect(button).toHaveTextContent("3")
    expect(button.className).toContain("text-status-warning-foreground")
  })

  test("Test 6: online + idle + lastSyncAt set renders Synced N min ago", () => {
    const twoMinAgo = Date.now() - 2 * 60_000
    useOfflineQueueStore.setState({
      items: [],
      isSyncing: false,
      lastSyncAt: twoMinAgo,
    })
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    expect(button).toHaveTextContent(/2\s*m/i)
    expect(button).toHaveTextContent(/synced/i)
  })

  test("Test 7: deadLetter.length > 0 shows AlertCircle warning overlay", () => {
    useOfflineQueueStore.setState({
      items: [],
      deadLetter: [makeDeadLetter("dl1")],
    })
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    // Overlay dot element carries data-testid
    const overlay = button.querySelector('[data-testid="dead-letter-overlay"]')
    expect(overlay).toBeTruthy()
    expect(overlay!.className).toContain("bg-destructive")
  })

  test("Test 8: is a button with descriptive aria-label and 44px touch target", () => {
    mockUseConnectivityStatus.mockReturnValue(false)
    render(<ConnectivityPill onClick={() => {}} />)
    const button = screen.getByRole("button")
    expect(button.tagName.toLowerCase()).toBe("button")
    expect(button.getAttribute("aria-label")).toMatch(/offline/i)
    expect(button.className).toContain("min-h-11")
    expect(button.className).toContain("min-w-11")
  })

  test("Test 9: onClick fires the callback prop", () => {
    const onClick = vi.fn()
    render(<ConnectivityPill onClick={onClick} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  test("Test 10: uses AAA-contrast status foreground tokens", () => {
    // Online → success-foreground; offline/pending → warning-foreground
    render(<ConnectivityPill onClick={() => {}} />)
    const onlineBtn = screen.getByRole("button")
    expect(onlineBtn.className).toContain("status-success-foreground")
  })
})
