import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface CallingState {
  sessionId: string | null
  callListId: string | null
  entries: Array<{
    id: string
    voter_id: string
    voter_name: string | null
    phone_numbers: Array<{ phone_id: string; value: string; type: string; is_primary: boolean }>
    phone_attempts: Record<string, { result: string; at: string }> | null
    attempt_count: number
    priority_score: number
  }>
  currentEntryIndex: number
  completedCalls: Record<string, string>  // entryId -> resultCode
  skippedEntries: string[]
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
