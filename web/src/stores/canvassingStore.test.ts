import { describe, test, expect, beforeEach } from "vitest"
import { useCanvassingStore, sanitizePersistedCanvassingState } from "@/stores/canvassingStore"
import { groupByHousehold } from "@/types/canvassing"
import type { CoordinatePoint, EnrichedWalkListEntry } from "@/types/canvassing"

function mockEntry(overrides: Partial<EnrichedWalkListEntry>): EnrichedWalkListEntry {
  return {
    id: crypto.randomUUID(),
    voter_id: crypto.randomUUID(),
    household_key: null,
    sequence: 0,
    status: "pending",
    latitude: null,
    longitude: null,
    voter: {
      first_name: "Test",
      last_name: "Voter",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: "123 Main St",
      registration_line2: null,
      registration_city: "Springfield",
      registration_state: "IL",
      registration_zip: "62701",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
    ...overrides,
  }
}

const snapshot: CoordinatePoint = { latitude: 32.84, longitude: -83.63 }

describe("canvassingStore", () => {
  beforeEach(async () => {
    sessionStorage.clear()
    useCanvassingStore.getState().reset()
    await useCanvassingStore.persist.rehydrate()
  })

  test("initializes with default state", () => {
    const state = useCanvassingStore.getState()
    expect(state.walkListId).toBeNull()
    expect(state.currentAddressIndex).toBe(0)
    expect(state.completedEntries).toEqual({})
    expect(state.skippedEntries).toEqual([])
    expect(state.sortMode).toBe("sequence")
    expect(state.locationStatus).toBe("idle")
    expect(state.locationSnapshot).toBeNull()
  })

  test("setWalkList resets address progress and distance-order state", () => {
    useCanvassingStore.getState().recordOutcome("x", "supporter")
    useCanvassingStore.getState().advanceAddress()
    useCanvassingStore.getState().setLocationState("ready", snapshot)
    useCanvassingStore.getState().setSortMode("distance")

    useCanvassingStore.getState().setWalkList("abc")
    const state = useCanvassingStore.getState()
    expect(state.walkListId).toBe("abc")
    expect(state.currentAddressIndex).toBe(0)
    expect(state.completedEntries).toEqual({})
    expect(state.skippedEntries).toEqual([])
    expect(state.sortMode).toBe("sequence")
    expect(state.locationStatus).toBe("idle")
    expect(state.locationSnapshot).toBeNull()
  })

  test("recordOutcome stores entryId -> resultCode mapping", () => {
    useCanvassingStore.getState().recordOutcome("entry1", "supporter")
    const state = useCanvassingStore.getState()
    expect(state.completedEntries["entry1"]).toBe("supporter")
  })

  test("revertOutcome removes entry from completedEntries", () => {
    useCanvassingStore.getState().recordOutcome("entry1", "supporter")
    useCanvassingStore.getState().revertOutcome("entry1")
    const state = useCanvassingStore.getState()
    expect(state.completedEntries["entry1"]).toBeUndefined()
  })

  test("skipEntry adds entryId to skippedEntries", () => {
    useCanvassingStore.getState().skipEntry("entry1")
    const state = useCanvassingStore.getState()
    expect(state.skippedEntries).toContain("entry1")
  })

  test("advanceAddress increments currentAddressIndex", () => {
    useCanvassingStore.getState().advanceAddress()
    const state = useCanvassingStore.getState()
    expect(state.currentAddressIndex).toBe(1)
  })

  test("jumpToAddress sets currentAddressIndex to given value", () => {
    useCanvassingStore.getState().jumpToAddress(5)
    const state = useCanvassingStore.getState()
    expect(state.currentAddressIndex).toBe(5)
  })

  test("setLocationState stores a frozen location snapshot for later sorting", () => {
    useCanvassingStore.getState().setLocationState("ready", snapshot)
    useCanvassingStore.getState().setSortMode("distance")

    const state = useCanvassingStore.getState()
    expect(state.locationStatus).toBe("ready")
    expect(state.locationSnapshot).toEqual(snapshot)
    expect(state.sortMode).toBe("distance")
  })

  test("denied or unavailable geolocation clears distance mode but keeps the route usable", () => {
    useCanvassingStore.getState().setLocationState("ready", snapshot)
    useCanvassingStore.getState().setSortMode("distance")

    useCanvassingStore.getState().setLocationState("denied")
    let state = useCanvassingStore.getState()
    expect(state.locationStatus).toBe("denied")
    expect(state.locationSnapshot).toBeNull()
    expect(state.sortMode).toBe("sequence")

    useCanvassingStore.getState().setLocationState("unavailable")
    state = useCanvassingStore.getState()
    expect(state.locationStatus).toBe("unavailable")
    expect(state.locationSnapshot).toBeNull()
    expect(state.sortMode).toBe("sequence")
  })

  test("invalid stored sort and snapshot state is reset before reuse", () => {
    const sanitized = sanitizePersistedCanvassingState({
      state: {
        walkListId: "persisted-list",
        currentAddressIndex: 2,
        completedEntries: { ok: "supporter", bad: 42 },
        skippedEntries: ["skip-1", 9],
        lastActiveAt: 123,
        sortMode: "distance",
        locationStatus: "ready",
        locationSnapshot: { latitude: 999, longitude: 200 },
      },
      version: 1,
    })

    expect(sanitized.walkListId).toBe("persisted-list")
    expect(sanitized.currentAddressIndex).toBe(2)
    expect(sanitized.completedEntries).toEqual({ ok: "supporter" })
    expect(sanitized.skippedEntries).toEqual(["skip-1"])
    expect(sanitized.sortMode).toBe("sequence")
    expect(sanitized.locationStatus).toBe("idle")
    expect(sanitized.locationSnapshot).toBeNull()
  })

  test("reset clears all state", () => {
    useCanvassingStore.getState().setWalkList("abc")
    useCanvassingStore.getState().recordOutcome("entry1", "supporter")
    useCanvassingStore.getState().skipEntry("entry2")
    useCanvassingStore.getState().advanceAddress()
    useCanvassingStore.getState().setLocationState("ready", snapshot)
    useCanvassingStore.getState().setSortMode("distance")

    useCanvassingStore.getState().reset()
    const state = useCanvassingStore.getState()
    expect(state.walkListId).toBeNull()
    expect(state.currentAddressIndex).toBe(0)
    expect(state.completedEntries).toEqual({})
    expect(state.skippedEntries).toEqual([])
    expect(state.sortMode).toBe("sequence")
    expect(state.locationStatus).toBe("idle")
    expect(state.locationSnapshot).toBeNull()
  })

  test("touch updates lastActiveAt timestamp", () => {
    const before = Date.now()
    useCanvassingStore.getState().touch()
    const state = useCanvassingStore.getState()
    expect(state.lastActiveAt).toBeGreaterThanOrEqual(before)
  })
})

describe("groupByHousehold", () => {
  test("groups entries by household_key", () => {
    const entries = [
      mockEntry({ household_key: "hh-1", sequence: 1 }),
      mockEntry({ household_key: "hh-2", sequence: 2 }),
      mockEntry({ household_key: "hh-1", sequence: 3 }),
      mockEntry({ household_key: "hh-2", sequence: 4 }),
    ]
    const households = groupByHousehold(entries)
    expect(households).toHaveLength(2)
    expect(households[0].entries).toHaveLength(2)
    expect(households[1].entries).toHaveLength(2)
  })

  test("null household_key creates separate groups", () => {
    const entries = [
      mockEntry({ household_key: null, sequence: 1 }),
      mockEntry({ household_key: null, sequence: 2 }),
    ]
    const households = groupByHousehold(entries)
    expect(households).toHaveLength(2)
    expect(households[0].entries).toHaveLength(1)
    expect(households[1].entries).toHaveLength(1)
  })

  test("single voter address uses same pattern", () => {
    const entries = [mockEntry({ household_key: "hh-solo", sequence: 1 })]
    const households = groupByHousehold(entries)
    expect(households).toHaveLength(1)
    expect(households[0].entries).toHaveLength(1)
  })

  test("maintains sequence order within households", () => {
    const entries = [
      mockEntry({ household_key: "hh-1", sequence: 3, voter: { first_name: "C", last_name: "V", party: null, age: null, propensity_combined: null, registration_line1: "123 Main St", registration_line2: null, registration_city: "Springfield", registration_state: "IL", registration_zip: "62701" } }),
      mockEntry({ household_key: "hh-1", sequence: 1, voter: { first_name: "A", last_name: "V", party: null, age: null, propensity_combined: null, registration_line1: "123 Main St", registration_line2: null, registration_city: "Springfield", registration_state: "IL", registration_zip: "62701" } }),
      mockEntry({ household_key: "hh-1", sequence: 2, voter: { first_name: "B", last_name: "V", party: null, age: null, propensity_combined: null, registration_line1: "123 Main St", registration_line2: null, registration_city: "Springfield", registration_state: "IL", registration_zip: "62701" } }),
    ]
    const households = groupByHousehold(entries)
    expect(households).toHaveLength(1)
    // Entries maintain insertion order (grouped as encountered)
    expect(households[0].entries[0].voter.first_name).toBe("C")
    expect(households[0].entries[1].voter.first_name).toBe("A")
    expect(households[0].entries[2].voter.first_name).toBe("B")
  })

  test("households sorted by first entry sequence", () => {
    const entries = [
      mockEntry({ household_key: "hh-A", sequence: 5 }),
      mockEntry({ household_key: "hh-B", sequence: 1 }),
    ]
    const households = groupByHousehold(entries)
    expect(households).toHaveLength(2)
    // B (sequence 1) should come first
    expect(households[0].householdKey).toBe("hh-B")
    expect(households[1].householdKey).toBe("hh-A")
  })
})
