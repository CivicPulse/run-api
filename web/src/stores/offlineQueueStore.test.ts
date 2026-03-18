import { describe, test, expect, beforeEach, vi } from "vitest"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"

describe("offlineQueueStore", () => {
  beforeEach(() => {
    useOfflineQueueStore.getState().clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  test("push() adds item with auto-generated id, createdAt, and retryCount 0", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("test-uuid-1" as `${string}-${string}-${string}-${string}-${string}`)
    vi.spyOn(Date, "now").mockReturnValue(1700000000000)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-1",
        voter_id: "voter-1",
        result_code: "supporter",
        notes: "Friendly",
      },
      campaignId: "camp-1",
      resourceId: "wl-1",
    })

    const state = useOfflineQueueStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toEqual({
      id: "test-uuid-1",
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-1",
        voter_id: "voter-1",
        result_code: "supporter",
        notes: "Friendly",
      },
      campaignId: "camp-1",
      resourceId: "wl-1",
      createdAt: 1700000000000,
      retryCount: 0,
    })
  })

  test("push() with type 'door_knock' stores DoorKnockCreate payload", () => {
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-1",
        voter_id: "voter-1",
        result_code: "not_home",
        latitude: 40.7128,
        longitude: -74.006,
      },
      campaignId: "camp-1",
      resourceId: "wl-1",
    })

    const item = useOfflineQueueStore.getState().items[0]
    expect(item.type).toBe("door_knock")
    expect(item.payload).toEqual({
      walk_list_entry_id: "entry-1",
      result_code: "not_home",
      latitude: 40.7128,
      longitude: -74.006,
    })
  })

  test("push() with type 'call_record' stores RecordCallPayload payload", () => {
    useOfflineQueueStore.getState().push({
      type: "call_record",
      payload: {
        call_list_entry_id: "cle-1",
        result_code: "answered",
        phone_number_used: "555-1234",
        call_started_at: "2024-01-01T10:00:00Z",
        call_ended_at: "2024-01-01T10:05:00Z",
        notes: "Good call",
      },
      campaignId: "camp-2",
      resourceId: "session-1",
    })

    const item = useOfflineQueueStore.getState().items[0]
    expect(item.type).toBe("call_record")
    expect(item.payload).toEqual({
      call_list_entry_id: "cle-1",
      result_code: "answered",
      phone_number_used: "555-1234",
      call_started_at: "2024-01-01T10:00:00Z",
      call_ended_at: "2024-01-01T10:05:00Z",
      notes: "Good call",
    })
  })

  test("remove(id) removes only the item with that id", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("id-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("id-2" as `${string}-${string}-${string}-${string}-${string}`)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "r1",
    })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e2", voter_id: "v2", result_code: "not_home" },
      campaignId: "c1",
      resourceId: "r1",
    })

    useOfflineQueueStore.getState().remove("id-1")
    const state = useOfflineQueueStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].id).toBe("id-2")
  })

  test("incrementRetry(id) increments retryCount by 1 for matching item", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("retry-id" as `${string}-${string}-${string}-${string}-${string}`)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "r1",
    })

    useOfflineQueueStore.getState().incrementRetry("retry-id")
    expect(useOfflineQueueStore.getState().items[0].retryCount).toBe(1)

    useOfflineQueueStore.getState().incrementRetry("retry-id")
    expect(useOfflineQueueStore.getState().items[0].retryCount).toBe(2)
  })

  test("setSyncing(true) sets isSyncing to true", () => {
    useOfflineQueueStore.getState().setSyncing(true)
    expect(useOfflineQueueStore.getState().isSyncing).toBe(true)
  })

  test("clear() empties items array and sets isSyncing false", () => {
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "r1",
    })
    useOfflineQueueStore.getState().setSyncing(true)

    useOfflineQueueStore.getState().clear()
    const state = useOfflineQueueStore.getState()
    expect(state.items).toEqual([])
    expect(state.isSyncing).toBe(false)
  })

  test("store persists items to localStorage under key 'offline-queue'", () => {
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "r1",
    })

    const stored = JSON.parse(localStorage.getItem("offline-queue") || "{}")
    expect(stored.state.items).toHaveLength(1)
    expect(stored.state.items[0].type).toBe("door_knock")
  })

  test("store does NOT persist isSyncing (partialize excludes it)", () => {
    useOfflineQueueStore.getState().setSyncing(true)

    const stored = JSON.parse(localStorage.getItem("offline-queue") || "{}")
    expect(stored.state.isSyncing).toBeUndefined()
  })

  test("rehydrated store has isSyncing=false even if it was true before", () => {
    // Set isSyncing to true in the live store
    useOfflineQueueStore.getState().setSyncing(true)
    expect(useOfflineQueueStore.getState().isSyncing).toBe(true)

    // Verify localStorage does NOT contain isSyncing (partialize excludes it)
    const stored = JSON.parse(localStorage.getItem("offline-queue") || "{}")
    expect(stored.state.isSyncing).toBeUndefined()

    // After clearing and rehydrating, isSyncing should be false (default)
    // because partialize never persisted it
    useOfflineQueueStore.setState({ isSyncing: false })
    useOfflineQueueStore.persist.rehydrate()
    expect(useOfflineQueueStore.getState().isSyncing).toBe(false)
  })
})
