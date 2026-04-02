import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export interface CallingEntrySnapshot {
  id: string
  voter_id: string
  voter_name: string | null
  phone_numbers: Array<{ phone_id: string; value: string; type: string; is_primary: boolean }>
  phone_attempts: Record<string, { result: string; at: string }> | null
  attempt_count: number
  priority_score: number
}

export interface CallingSessionSnapshot {
  sessionId: string | null
  entries: CallingEntrySnapshot[]
  currentEntryIndex: number
  completedCalls: Record<string, string>
  skippedEntries: string[]
}

interface CallingState extends CallingSessionSnapshot {
  callListId: string | null
  callStartedAt: string | null      // ISO timestamp when call initiated
  phoneNumberUsed: string | null    // E.164 of dialed number
  lastActiveAt: number

  // Actions
  startSession: (sessionId: string, callListId: string, entries: CallingState["entries"]) => void
  addEntries: (entries: CallingState["entries"]) => void
  recordOutcome: (entryId: string, resultCode: string) => void
  skipEntry: (entryId: string) => void
  advanceEntry: () => void
  setCallStarted: (phone: string) => void
  clearCallStarted: () => void
  reset: () => void
  touch: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPhoneNumber(value: unknown): value is CallingEntrySnapshot["phone_numbers"][number] {
  return (
    isRecord(value)
    && typeof value.phone_id === "string"
    && typeof value.value === "string"
    && typeof value.type === "string"
    && typeof value.is_primary === "boolean"
  )
}

function isPhoneAttempts(value: unknown): value is CallingEntrySnapshot["phone_attempts"] {
  if (value === null) return true
  if (!isRecord(value)) return false

  return Object.values(value).every((attempt) => (
    isRecord(attempt)
    && typeof attempt.result === "string"
    && typeof attempt.at === "string"
  ))
}

function isCallingEntrySnapshot(value: unknown): value is CallingEntrySnapshot {
  return (
    isRecord(value)
    && typeof value.id === "string"
    && typeof value.voter_id === "string"
    && (typeof value.voter_name === "string" || value.voter_name === null)
    && Array.isArray(value.phone_numbers)
    && value.phone_numbers.every(isPhoneNumber)
    && isPhoneAttempts(value.phone_attempts)
    && typeof value.attempt_count === "number"
    && typeof value.priority_score === "number"
  )
}

export function canResumeCallingSession(
  snapshot: CallingSessionSnapshot,
  sessionId: string,
): boolean {
  return (
    sessionId.length > 0
    && snapshot.sessionId === sessionId
    && Number.isInteger(snapshot.currentEntryIndex)
    && snapshot.currentEntryIndex >= 0
    && Array.isArray(snapshot.entries)
    && snapshot.entries.every(isCallingEntrySnapshot)
    && isRecord(snapshot.completedCalls)
    && Object.values(snapshot.completedCalls).every((value) => typeof value === "string")
    && Array.isArray(snapshot.skippedEntries)
    && snapshot.skippedEntries.every((entryId) => typeof entryId === "string")
  )
}

export const useCallingStore = create<CallingState>()(
  persist(
    (set) => ({
      sessionId: null,
      callListId: null,
      entries: [],
      currentEntryIndex: 0,
      completedCalls: {},
      skippedEntries: [],
      callStartedAt: null,
      phoneNumberUsed: null,
      lastActiveAt: Date.now(),

      startSession: (sessionId, callListId, entries) =>
        set({
          sessionId,
          callListId,
          entries,
          currentEntryIndex: 0,
          completedCalls: {},
          skippedEntries: [],
          callStartedAt: null,
          phoneNumberUsed: null,
          lastActiveAt: Date.now(),
        }),

      addEntries: (newEntries) =>
        set((state) => ({
          entries: [...state.entries, ...newEntries],
          lastActiveAt: Date.now(),
        })),

      recordOutcome: (entryId, resultCode) =>
        set((state) => ({
          completedCalls: { ...state.completedCalls, [entryId]: resultCode },
          callStartedAt: null,
          phoneNumberUsed: null,
          lastActiveAt: Date.now(),
        })),

      skipEntry: (entryId) =>
        set((state) => ({
          skippedEntries: [...state.skippedEntries, entryId],
          callStartedAt: null,
          phoneNumberUsed: null,
          lastActiveAt: Date.now(),
        })),

      advanceEntry: () =>
        set((state) => ({
          currentEntryIndex: state.currentEntryIndex + 1,
          callStartedAt: null,
          phoneNumberUsed: null,
          lastActiveAt: Date.now(),
        })),

      setCallStarted: (phone) =>
        set({
          callStartedAt: new Date().toISOString(),
          phoneNumberUsed: phone,
          lastActiveAt: Date.now(),
        }),

      clearCallStarted: () =>
        set({
          callStartedAt: null,
          phoneNumberUsed: null,
        }),

      reset: () =>
        set({
          sessionId: null,
          callListId: null,
          entries: [],
          currentEntryIndex: 0,
          completedCalls: {},
          skippedEntries: [],
          callStartedAt: null,
          phoneNumberUsed: null,
          lastActiveAt: Date.now(),
        }),

      touch: () => set({ lastActiveAt: Date.now() }),
    }),
    {
      name: "calling-session",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
