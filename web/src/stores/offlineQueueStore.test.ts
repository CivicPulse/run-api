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
      } as unknown as import("@/types/walk-list").DoorKnockCreate,
      campaignId: "camp-1",
      resourceId: "wl-1",
    })

    const state = useOfflineQueueStore.getState()
    expect(state.items).toHaveLength(1)
    // Plan 110-02 / OFFLINE-01: payload.client_uuid is stamped at push
    // time with the same UUID as item.id, so duplicate server replays
    // 409 against the partial unique index.
    expect(state.items[0]).toEqual({
      id: "test-uuid-1",
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-1",
        voter_id: "voter-1",
        result_code: "supporter",
        notes: "Friendly",
        client_uuid: "test-uuid-1",
      },
      campaignId: "camp-1",
      resourceId: "wl-1",
      createdAt: 1700000000000,
      retryCount: 0,
    })
  })

  test("push() stamps client_uuid on door_knock payload matching item.id (OFFLINE-01)", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("dk-uuid" as `${string}-${string}-${string}-${string}-${string}`)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-a",
        voter_id: "voter-a",
        result_code: "supporter",
      } as unknown as import("@/types/walk-list").DoorKnockCreate,
      campaignId: "camp-1",
      resourceId: "wl-1",
    })

    const item = useOfflineQueueStore.getState().items[0]
    expect(item.id).toBe("dk-uuid")
    expect((item.payload as import("@/types/walk-list").DoorKnockCreate).client_uuid).toBe("dk-uuid")
  })

  test("push() skips duplicate door_knock for same (entry, voter, result) triple (OFFLINE-01 double-enqueue guard)", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("first-uuid" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("second-uuid" as `${string}-${string}-${string}-${string}-${string}`)

    const base = {
      walk_list_entry_id: "entry-x",
      voter_id: "voter-x",
      result_code: "not_home",
    } as unknown as import("@/types/walk-list").DoorKnockCreate

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: base,
      campaignId: "camp-1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: base,
      campaignId: "camp-1",
      resourceId: "wl-1",
    })

    const state = useOfflineQueueStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].id).toBe("first-uuid")
  })

  test("push() allows different door_knock triples to coexist", () => {
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-1",
        voter_id: "voter-1",
        result_code: "supporter",
      } as unknown as import("@/types/walk-list").DoorKnockCreate,
      campaignId: "camp-1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-1",
        voter_id: "voter-1",
        result_code: "not_home", // different result_code
      } as unknown as import("@/types/walk-list").DoorKnockCreate,
      campaignId: "camp-1",
      resourceId: "wl-1",
    })

    expect(useOfflineQueueStore.getState().items).toHaveLength(2)
  })

  test("push() with type 'door_knock' stores DoorKnockCreate payload", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("store-uuid" as `${string}-${string}-${string}-${string}-${string}`)
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: {
        walk_list_entry_id: "entry-1",
        voter_id: "voter-1",
        result_code: "not_home",
        latitude: 40.7128,
        longitude: -74.006,
      } as unknown as import("@/types/walk-list").DoorKnockCreate,
      campaignId: "camp-1",
      resourceId: "wl-1",
    })

    const item = useOfflineQueueStore.getState().items[0]
    expect(item.type).toBe("door_knock")
    // Plan 110-02 / OFFLINE-01: push() stamps client_uuid matching item.id
    expect(item.payload).toEqual({
      walk_list_entry_id: "entry-1",
      voter_id: "voter-1",
      result_code: "not_home",
      latitude: 40.7128,
      longitude: -74.006,
      client_uuid: "store-uuid",
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

// =============================================================================
// Plan 110-04 / OFFLINE-03 — dead-letter slice, backoff fields, sync budget
// =============================================================================

describe("offlineQueueStore — dead-letter slice (plan 110-04)", () => {
  beforeEach(() => {
    useOfflineQueueStore.getState().clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  test("store initial state exposes deadLetter: [], syncStartedAt: null, isSlow: false, lastSyncAt: null", () => {
    const s = useOfflineQueueStore.getState()
    expect(s.deadLetter).toEqual([])
    expect(s.syncStartedAt).toBeNull()
    expect(s.isSlow).toBe(false)
    expect(s.lastSyncAt).toBeNull()
  })

  test("moveToDeadLetter removes from items and pushes to deadLetter with failure context", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("item-abc" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("dl-xyz" as `${string}-${string}-${string}-${string}-${string}`)
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_700_000_000_000) // push createdAt
      .mockReturnValueOnce(1_700_000_100_000) // failedAt

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    useOfflineQueueStore.getState().moveToDeadLetter("item-abc", {
      errorSummary: "Validation failed: voter_id required",
      errorCode: "http_422",
    })

    const state = useOfflineQueueStore.getState()
    expect(state.items).toHaveLength(0)
    expect(state.deadLetter).toHaveLength(1)
    expect(state.deadLetter[0]).toMatchObject({
      id: "dl-xyz",
      originalId: "item-abc",
      type: "door_knock",
      campaignId: "c1",
      resourceId: "wl-1",
      addedAt: 1_700_000_000_000,
      failedAt: 1_700_000_100_000,
      errorSummary: "Validation failed: voter_id required",
      errorCode: "http_422",
    })
  })

  test("moveToDeadLetter is a no-op when itemId not found", () => {
    useOfflineQueueStore.getState().moveToDeadLetter("nope", {
      errorSummary: "x",
      errorCode: "http_422",
    })
    expect(useOfflineQueueStore.getState().deadLetter).toHaveLength(0)
  })

  test("retryDeadLetter re-pushes the item, resets retryCount, preserves original client_uuid, and sets nextAttemptAt=Date.now()", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("orig-id" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("dl-id" as `${string}-${string}-${string}-${string}-${string}`)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    // Mark retry+ before move so we know retry is reset after retryDeadLetter
    useOfflineQueueStore.getState().incrementRetry("orig-id")
    useOfflineQueueStore.getState().moveToDeadLetter("orig-id", {
      errorSummary: "422",
      errorCode: "http_422",
    })

    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000)
    useOfflineQueueStore.getState().retryDeadLetter("dl-id")

    const state = useOfflineQueueStore.getState()
    expect(state.deadLetter).toHaveLength(0)
    expect(state.items).toHaveLength(1)
    expect(state.items[0].id).toBe("orig-id")
    expect(state.items[0].retryCount).toBe(0)
    expect(state.items[0].nextAttemptAt).toBe(1_800_000_000_000)
    // client_uuid preserved through move+retry
    const p = state.items[0].payload as import("@/types/walk-list").DoorKnockCreate
    expect(p.client_uuid).toBe("orig-id")
  })

  test("discardDeadLetter removes from deadLetter only (does not touch items)", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("orig-id" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("dl-id" as `${string}-${string}-${string}-${string}-${string}`)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().moveToDeadLetter("orig-id", {
      errorSummary: "403",
      errorCode: "http_403",
    })

    useOfflineQueueStore.getState().discardDeadLetter("dl-id")
    const state = useOfflineQueueStore.getState()
    expect(state.deadLetter).toHaveLength(0)
    expect(state.items).toHaveLength(0)
  })

  test("setItemBackoff stamps nextAttemptAt + lastError and increments retryCount", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("bo-id" as `${string}-${string}-${string}-${string}-${string}`)
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().setItemBackoff("bo-id", 1_900_000_000_000, "network")
    const it = useOfflineQueueStore.getState().items[0]
    expect(it.nextAttemptAt).toBe(1_900_000_000_000)
    expect(it.lastError).toBe("network")
    expect(it.retryCount).toBe(1)
  })

  test("startSync / endSync / markSlow manage budget state", () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000)

    useOfflineQueueStore.getState().startSync()
    let s = useOfflineQueueStore.getState()
    expect(s.isSyncing).toBe(true)
    expect(s.syncStartedAt).toBe(2_000_000_000_000)
    expect(s.isSlow).toBe(false)

    useOfflineQueueStore.getState().markSlow()
    s = useOfflineQueueStore.getState()
    expect(s.isSlow).toBe(true)

    useOfflineQueueStore.getState().endSync()
    s = useOfflineQueueStore.getState()
    expect(s.isSyncing).toBe(false)
    expect(s.syncStartedAt).toBeNull()
    expect(s.isSlow).toBe(false)
  })

  test("recordSyncSuccess stamps lastSyncAt", () => {
    vi.spyOn(Date, "now").mockReturnValue(2_100_000_000_000)
    useOfflineQueueStore.getState().recordSyncSuccess()
    expect(useOfflineQueueStore.getState().lastSyncAt).toBe(2_100_000_000_000)
  })

  test("persist config partializes deadLetter and lastSyncAt but NOT syncStartedAt/isSlow", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("orig-id" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("dl-id" as `${string}-${string}-${string}-${string}-${string}`)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().moveToDeadLetter("orig-id", {
      errorSummary: "422",
      errorCode: "http_422",
    })
    useOfflineQueueStore.getState().startSync()
    useOfflineQueueStore.getState().markSlow()
    useOfflineQueueStore.getState().recordSyncSuccess()

    const stored = JSON.parse(localStorage.getItem("offline-queue") || "{}")
    expect(stored.state.deadLetter).toHaveLength(1)
    expect(typeof stored.state.lastSyncAt).toBe("number")
    expect(stored.state.syncStartedAt).toBeUndefined()
    expect(stored.state.isSlow).toBeUndefined()
  })

  test("persist envelope exposes version 2", () => {
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    const stored = JSON.parse(localStorage.getItem("offline-queue") || "{}")
    expect(stored.version).toBe(2)
  })

  test("clear() also resets deadLetter / syncStartedAt / isSlow", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("orig-id" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("dl-id" as `${string}-${string}-${string}-${string}-${string}`)

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().moveToDeadLetter("orig-id", {
      errorSummary: "422",
      errorCode: "http_422",
    })
    useOfflineQueueStore.getState().startSync()
    useOfflineQueueStore.getState().markSlow()

    useOfflineQueueStore.getState().clear()
    const s = useOfflineQueueStore.getState()
    expect(s.items).toEqual([])
    expect(s.deadLetter).toEqual([])
    expect(s.syncStartedAt).toBeNull()
    expect(s.isSlow).toBe(false)
  })
})
