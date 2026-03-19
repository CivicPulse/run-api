import { describe, test, expect, beforeEach, vi, type Mock } from "vitest"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import { useCanvassingStore } from "@/stores/canvassingStore"
import type { QueueItem } from "@/stores/offlineQueueStore"
import type { QueryClient } from "@tanstack/react-query"

// Mock api
vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn(),
  },
}))

// Mock sonner
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

import { api } from "@/api/client"
import { toast } from "sonner"

// Import after mocks
import {
  drainQueue,
  replayMutation,
  isNetworkError,
  isConflict,
} from "@/hooks/useSyncEngine"

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "item-1",
    type: "door_knock",
    payload: { walk_list_entry_id: "entry-A", voter_id: "v1", result_code: "supporter" },
    campaignId: "camp-1",
    resourceId: "wl-1",
    createdAt: Date.now(),
    retryCount: 0,
    ...overrides,
  }
}

// Fake queryClient
function makeQueryClient() {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    getQueryData: vi.fn().mockReturnValue(undefined),
  }
}

describe("useSyncEngine helpers", () => {
  test("isNetworkError returns true for TypeError", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true)
  })

  test("isNetworkError returns false for other errors", () => {
    expect(isNetworkError(new Error("server error"))).toBe(false)
  })

  test("isConflict returns true for error with response.status 409", () => {
    const err = { response: { status: 409 } }
    expect(isConflict(err)).toBe(true)
  })

  test("isConflict returns false for other status codes", () => {
    const err = { response: { status: 500 } }
    expect(isConflict(err)).toBe(false)
  })

  test("isConflict returns false for non-response errors", () => {
    expect(isConflict(new Error("oops"))).toBe(false)
  })
})

describe("replayMutation", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("calls correct API endpoint for door_knock type", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    const item = makeItem({
      type: "door_knock",
      campaignId: "c1",
      resourceId: "wl-1",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
    })

    await replayMutation(item)

    expect(api.post).toHaveBeenCalledWith(
      "api/v1/campaigns/c1/walk-lists/wl-1/door-knocks",
      { json: item.payload }
    )
  })

  test("calls correct API endpoint for call_record type", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    const item = makeItem({
      type: "call_record",
      campaignId: "c2",
      resourceId: "sess-1",
      payload: {
        call_list_entry_id: "cle-1",
        result_code: "answered",
        phone_number_used: "555-1234",
        call_started_at: "2024-01-01T10:00:00Z",
        call_ended_at: "2024-01-01T10:05:00Z",
      },
    })

    await replayMutation(item)

    expect(api.post).toHaveBeenCalledWith(
      "api/v1/campaigns/c2/phone-bank-sessions/sess-1/calls",
      { json: item.payload }
    )
  })
})

describe("drainQueue", () => {
  let queryClient: ReturnType<typeof makeQueryClient>

  beforeEach(() => {
    vi.restoreAllMocks()
    useOfflineQueueStore.getState().clear()
    useCanvassingStore.getState().reset()
    queryClient = makeQueryClient()
    // Default: navigator.onLine = true
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true })
  })

  test("skips if items.length === 0", async () => {
    await drainQueue(queryClient as unknown as QueryClient)
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  test("skips if isSyncing is already true (race condition guard)", async () => {
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().setSyncing(true)

    await drainQueue(queryClient as unknown as QueryClient)

    // Items still there (drain was skipped)
    expect(useOfflineQueueStore.getState().items).toHaveLength(1)
  })

  test("sets isSyncing=true at start, isSyncing=false at end", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    const syncStates: boolean[] = [];
    (api.post as Mock).mockImplementation(() => {
      syncStates.push(useOfflineQueueStore.getState().isSyncing)
      return { json: vi.fn().mockResolvedValue({}) }
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(syncStates[0]).toBe(true)
    expect(useOfflineQueueStore.getState().isSyncing).toBe(false)
  })

  test("processes items in FIFO order (items[0] first)", async () => {
    const callOrder: string[] = [];
    (api.post as Mock).mockImplementation((url: string) => {
      callOrder.push(url)
      return { json: vi.fn().mockResolvedValue({}) }
    })

    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("id-1" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("id-2" as ReturnType<typeof crypto.randomUUID>)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().push({
      type: "call_record",
      payload: {
        call_list_entry_id: "cle-1",
        result_code: "answered",
        phone_number_used: "555",
        call_started_at: "2024-01-01T10:00:00Z",
        call_ended_at: "2024-01-01T10:05:00Z",
      },
      campaignId: "c1",
      resourceId: "sess-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(callOrder[0]).toContain("door-knocks")
    expect(callOrder[1]).toContain("calls")
  })

  test("removes item from store after successful replay", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(useOfflineQueueStore.getState().items).toHaveLength(0)
  })

  test("discards item (removes) on 409 Conflict response", async () => {
    (api.post as Mock).mockReturnValue({
      json: vi.fn().mockRejectedValue({ response: { status: 409 } }),
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(useOfflineQueueStore.getState().items).toHaveLength(0)
  })

  test("increments retryCount on network error (TypeError)", async () => {
    (api.post as Mock).mockReturnValue({
      json: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(useOfflineQueueStore.getState().items[0].retryCount).toBe(1)
  })

  test("stops drain (breaks loop) on network error after incrementing retry", async () => {
    let callCount = 0;
    (api.post as Mock).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return { json: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }
      }
      return { json: vi.fn().mockResolvedValue({}) }
    })

    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("id-1" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("id-2" as ReturnType<typeof crypto.randomUUID>)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    // First item retried, second item untouched
    expect(callCount).toBe(1)
    expect(useOfflineQueueStore.getState().items).toHaveLength(2)
  })

  test("skips item when retryCount >= 2 (already attempted 3 times)", async () => {
    let callCount = 0;
    (api.post as Mock).mockImplementation(() => {
      callCount++
      return { json: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }
    })

    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("id-1" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("id-2" as ReturnType<typeof crypto.randomUUID>)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    // Set retryCount to 2 (already attempted 3 times)
    useOfflineQueueStore.getState().incrementRetry("id-1")
    useOfflineQueueStore.getState().incrementRetry("id-1")

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    // First item skipped (retryCount >= 2), second item attempted then breaks on error
    expect(callCount).toBe(2)
  })

  test("after drain with items synced, invalidateQueries is called for walk-list-entries-enriched", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["walk-list-entries-enriched", "c1", "wl-1"],
    })
  })

  test("after drain with items synced, invalidateQueries is called for phone-bank-sessions detail", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    useOfflineQueueStore.getState().push({
      type: "call_record",
      payload: {
        call_list_entry_id: "cle-1",
        result_code: "answered",
        phone_number_used: "555",
        call_started_at: "2024-01-01T10:00:00Z",
        call_ended_at: "2024-01-01T10:05:00Z",
      },
      campaignId: "c1",
      resourceId: "sess-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["campaigns", "c1", "phone-bank-sessions", "sess-1"],
    })
  })

  test("after drain with items synced, invalidateQueries is called for field-me", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    await drainQueue(queryClient as unknown as QueryClient)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["field-me", "c1"],
    })
  })

  test("after drain with items from multiple campaigns, invalidates field-me for each", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" },
      campaignId: "c2",
      resourceId: "wl-2",
    })
    await drainQueue(queryClient as unknown as QueryClient)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["field-me", "c1"],
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["field-me", "c2"],
    })
  })

  test("after drain with call_record items, invalidates field-me for campaign", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })
    useOfflineQueueStore.getState().push({
      type: "call_record",
      payload: {
        call_list_entry_id: "cle-1",
        result_code: "answered",
        phone_number_used: "555",
        call_started_at: "2024-01-01T10:00:00Z",
        call_ended_at: "2024-01-01T10:05:00Z",
      },
      campaignId: "c1",
      resourceId: "sess-1",
    })
    await drainQueue(queryClient as unknown as QueryClient)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["field-me", "c1"],
    })
  })

  test('toast "All caught up!" fires when queue drains to empty', async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(toast.success).toHaveBeenCalledWith("All caught up!")
  })

  test("after drain with door_knock items synced, if current canvassing entry was completed by another volunteer, calls advanceAddress and fires toast", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    vi.spyOn(crypto, "randomUUID").mockReturnValue("item-id" as ReturnType<typeof crypto.randomUUID>)

    // Push a door_knock for entry-A (this is what WE synced)
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "entry-A", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    // Set up canvassingStore: walkListId matches resourceId, currentAddressIndex: 2
    useCanvassingStore.setState({
      walkListId: "wl-1",
      currentAddressIndex: 2,
    })

    // Mock queryClient.getQueryData to return enriched entries where index 2 is
    // entry "entry-B" with status "visited" (completed by another volunteer)
    queryClient.getQueryData.mockReturnValue([
      { id: "entry-0", status: "pending" },
      { id: "entry-1", status: "pending" },
      { id: "entry-B", status: "visited" }, // index 2 - completed by ANOTHER volunteer
      { id: "entry-3", status: "pending" },
    ])

    const advanceSpy = vi.fn()
    useCanvassingStore.setState({ advanceAddress: advanceSpy })

    await drainQueue(queryClient as unknown as QueryClient)

    expect(advanceSpy).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("This door was visited"))
  })

  test("after drain, if current canvassing entry was synced by US, does NOT auto-skip", async () => {
    const mockJson = vi.fn().mockResolvedValue({});
    (api.post as Mock).mockReturnValue({ json: mockJson })

    vi.spyOn(crypto, "randomUUID").mockReturnValue("item-id" as ReturnType<typeof crypto.randomUUID>)

    // Push a door_knock for entry-B (this is what WE synced)
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "entry-B", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    // Set up canvassingStore: walkListId matches, currentAddressIndex: 2
    useCanvassingStore.setState({
      walkListId: "wl-1",
      currentAddressIndex: 2,
    })

    // Mock enriched entries: entry-B at index 2 is "visited" but by US
    queryClient.getQueryData.mockReturnValue([
      { id: "entry-0", status: "pending" },
      { id: "entry-1", status: "pending" },
      { id: "entry-B", status: "visited" }, // index 2 - completed by US
      { id: "entry-3", status: "pending" },
    ])

    const advanceSpy = vi.fn()
    useCanvassingStore.setState({ advanceAddress: advanceSpy })

    await drainQueue(queryClient as unknown as QueryClient)

    // Should NOT advance because entry-B was synced by us
    expect(advanceSpy).not.toHaveBeenCalled()
  })
})
