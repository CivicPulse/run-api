import { describe, it, expect, beforeEach } from "vitest"
import { useCallingStore } from "./callingStore"

const mockEntries = [
  {
    id: "e1",
    voter_id: "v1",
    voter_name: "Alice Smith",
    phone_numbers: [{ phone_id: "p1", value: "+15551111111", type: "cell", is_primary: true }],
    phone_attempts: null,
    attempt_count: 0,
    priority_score: 100,
  },
  {
    id: "e2",
    voter_id: "v2",
    voter_name: "Bob Jones",
    phone_numbers: [{ phone_id: "p2", value: "+15552222222", type: "home", is_primary: true }],
    phone_attempts: null,
    attempt_count: 1,
    priority_score: 90,
  },
]

describe("callingStore", () => {
  beforeEach(() => {
    useCallingStore.getState().reset()
  })

  it("initializes with null session", () => {
    const state = useCallingStore.getState()
    expect(state.sessionId).toBeNull()
    expect(state.entries).toEqual([])
    expect(state.currentEntryIndex).toBe(0)
  })

  it("startSession sets session data and resets state", () => {
    useCallingStore.getState().startSession("s1", "cl1", mockEntries)
    const state = useCallingStore.getState()
    expect(state.sessionId).toBe("s1")
    expect(state.callListId).toBe("cl1")
    expect(state.entries).toHaveLength(2)
    expect(state.currentEntryIndex).toBe(0)
    expect(state.completedCalls).toEqual({})
  })

  it("addEntries appends to existing entries", () => {
    useCallingStore.getState().startSession("s1", "cl1", [mockEntries[0]])
    useCallingStore.getState().addEntries([mockEntries[1]])
    expect(useCallingStore.getState().entries).toHaveLength(2)
  })

  it("recordOutcome stores entryId -> resultCode and clears call state", () => {
    useCallingStore.getState().startSession("s1", "cl1", mockEntries)
    useCallingStore.getState().setCallStarted("+15551111111")
    useCallingStore.getState().recordOutcome("e1", "answered")
    const state = useCallingStore.getState()
    expect(state.completedCalls["e1"]).toBe("answered")
    expect(state.callStartedAt).toBeNull()
    expect(state.phoneNumberUsed).toBeNull()
  })

  it("skipEntry adds to skippedEntries", () => {
    useCallingStore.getState().startSession("s1", "cl1", mockEntries)
    useCallingStore.getState().skipEntry("e1")
    expect(useCallingStore.getState().skippedEntries).toContain("e1")
  })

  it("advanceEntry increments currentEntryIndex", () => {
    useCallingStore.getState().startSession("s1", "cl1", mockEntries)
    useCallingStore.getState().advanceEntry()
    expect(useCallingStore.getState().currentEntryIndex).toBe(1)
  })

  it("setCallStarted records timestamp and phone number", () => {
    useCallingStore.getState().setCallStarted("+15551111111")
    const state = useCallingStore.getState()
    expect(state.phoneNumberUsed).toBe("+15551111111")
    expect(state.callStartedAt).not.toBeNull()
  })

  it("reset clears all state", () => {
    useCallingStore.getState().startSession("s1", "cl1", mockEntries)
    useCallingStore.getState().recordOutcome("e1", "answered")
    useCallingStore.getState().reset()
    const state = useCallingStore.getState()
    expect(state.sessionId).toBeNull()
    expect(state.entries).toEqual([])
    expect(state.completedCalls).toEqual({})
  })
})
