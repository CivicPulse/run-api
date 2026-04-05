import { describe, it, expect, beforeEach } from "vitest"
import {
  canResumeCallingSession,
  sanitizePersistedCallingState,
  useCallingStore,
  type CallingEntrySnapshot,
} from "./callingStore"

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
    sessionStorage.clear()
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

  it("canResumeCallingSession returns true only for a valid matching session snapshot", () => {
    useCallingStore.getState().startSession("session-a", "cl1", mockEntries)

    expect(
      canResumeCallingSession(useCallingStore.getState(), "session-a"),
    ).toBe(true)
    expect(
      canResumeCallingSession(useCallingStore.getState(), "session-b"),
    ).toBe(false)
  })

  it("canResumeCallingSession rejects malformed persisted entry shapes", () => {
    useCallingStore.setState({
      sessionId: "session-a",
      entries: [
        {
          id: "broken-entry",
          voter_id: "v1",
          voter_name: "Broken",
          phone_numbers: "not-an-array",
          phone_attempts: null,
          attempt_count: 0,
          priority_score: 100,
        },
      ] as never,
      currentEntryIndex: 0,
      completedCalls: {},
      skippedEntries: [],
    })

    expect(
      canResumeCallingSession(useCallingStore.getState(), "session-a"),
    ).toBe(false)
  })
})

// =============================================================================
// Phase 75 Plan 01 — RED tests for C16 PII sanitizer (REL-03)
// These tests assert behavior NOT YET IMPLEMENTED. Plan 03 makes them pass.
// =============================================================================

const PII_ENTRY: CallingEntrySnapshot = {
  id: "entry-1",
  voter_id: "voter-abc",
  voter_name: "John Smith",
  phone_numbers: [
    { phone_id: "p1", value: "+15551234567", type: "mobile", is_primary: true },
  ],
  phone_attempts: {
    p1: { result: "no_answer", at: "2026-04-04T12:00:00Z" },
  },
  attempt_count: 2,
  priority_score: 0.8,
}

function buildFullState() {
  return {
    sessionId: "s-1",
    callListId: "cl-1",
    entries: [PII_ENTRY, { ...PII_ENTRY, id: "entry-2", voter_id: "voter-def" }],
    currentEntryIndex: 1,
    completedCalls: { "entry-1": "answered" },
    skippedEntries: ["entry-0"],
    callStartedAt: "2026-04-04T12:05:00Z",
    phoneNumberUsed: "+15551234567",
    lastActiveAt: 1733333333333,
  }
}

describe("sanitizePersistedCallingState — export", () => {
  it("is exported from callingStore as a function", () => {
    expect(typeof sanitizePersistedCallingState).toBe("function")
  })
})

describe("sanitizePersistedCallingState — PII stripping", () => {
  it("strips voter_name from all persisted entries", () => {
    const result = sanitizePersistedCallingState(buildFullState())
    const entries = (result.entries ?? []) as CallingEntrySnapshot[]
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.voter_name).toBeNull()
    }
  })

  it("strips phone_numbers from all persisted entries", () => {
    const result = sanitizePersistedCallingState(buildFullState())
    const entries = (result.entries ?? []) as CallingEntrySnapshot[]
    for (const entry of entries) {
      expect(entry.phone_numbers).toEqual([])
    }
    // No E.164 numbers anywhere in serialized output
    const serialized = JSON.stringify(result)
    expect(/\+1555\d{7}/.test(serialized)).toBe(false)
  })

  it("strips phone_attempts history from all persisted entries", () => {
    const result = sanitizePersistedCallingState(buildFullState())
    const entries = (result.entries ?? []) as CallingEntrySnapshot[]
    for (const entry of entries) {
      // Either null or empty — must not retain prior attempt content
      const attempts = entry.phone_attempts
      if (attempts !== null) {
        expect(Object.keys(attempts)).toHaveLength(0)
      }
    }
  })

  it("strips phoneNumberUsed from state root (dialed number)", () => {
    const result = sanitizePersistedCallingState(buildFullState())
    expect(result.phoneNumberUsed).toBeNull()
  })
})

describe("sanitizePersistedCallingState — preserves non-PII", () => {
  it("preserves session/list identifiers and progress counters", () => {
    const result = sanitizePersistedCallingState(buildFullState())
    expect(result.sessionId).toBe("s-1")
    expect(result.callListId).toBe("cl-1")
    expect(result.currentEntryIndex).toBe(1)
    expect(result.completedCalls).toEqual({ "entry-1": "answered" })
    expect(result.skippedEntries).toEqual(["entry-0"])
    expect(result.callStartedAt).toBe("2026-04-04T12:05:00Z")
    expect(result.lastActiveAt).toBe(1733333333333)
  })

  it("preserves entry id and voter_id for state recovery", () => {
    const result = sanitizePersistedCallingState(buildFullState())
    const entries = (result.entries ?? []) as CallingEntrySnapshot[]
    expect(entries[0].id).toBe("entry-1")
    expect(entries[0].voter_id).toBe("voter-abc")
    expect(entries[1].id).toBe("entry-2")
    expect(entries[1].voter_id).toBe("voter-def")
  })

  it("preserves attempt_count and priority_score (non-PII scoring metadata)", () => {
    const result = sanitizePersistedCallingState(buildFullState())
    const entries = (result.entries ?? []) as CallingEntrySnapshot[]
    expect(entries[0].attempt_count).toBe(2)
    expect(entries[0].priority_score).toBe(0.8)
  })
})

describe("sanitizePersistedCallingState — defensive input handling", () => {
  it("returns default state for null input", () => {
    const result = sanitizePersistedCallingState(null)
    expect(result.entries).toEqual([])
    expect(result.sessionId).toBeNull()
    expect(result.phoneNumberUsed).toBeNull()
  })

  it("returns default state for undefined input", () => {
    const result = sanitizePersistedCallingState(undefined)
    expect(result.entries).toEqual([])
    expect(result.sessionId).toBeNull()
  })

  it("returns default state for non-object input", () => {
    const result = sanitizePersistedCallingState("not an object" as unknown)
    expect(result.entries).toEqual([])
    expect(result.sessionId).toBeNull()
  })

  it("unwraps persisted { state: {...} } envelope (zustand persist format)", () => {
    const result = sanitizePersistedCallingState({ state: buildFullState() })
    expect(result.sessionId).toBe("s-1")
    const entries = (result.entries ?? []) as CallingEntrySnapshot[]
    expect(entries).toHaveLength(2)
    // Still strips PII through envelope
    expect(entries[0].voter_name).toBeNull()
  })
})

describe("sanitizePersistedCallingState — sessionStorage round-trip", () => {
  it("full persist → rehydrate cycle strips PII from storage", () => {
    // Simulate what zustand persist writes with partialize applied
    const persisted = {
      state: buildFullState(),
      version: 0,
    }
    sessionStorage.setItem("calling-session", JSON.stringify(persisted))

    const raw = sessionStorage.getItem("calling-session")
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    const result = sanitizePersistedCallingState(parsed)

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("John Smith")
    expect(serialized).not.toContain("+15551234567")
    expect(serialized).not.toContain("no_answer")
  })
})
