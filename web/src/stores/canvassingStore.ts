import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface CanvassingState {
  walkListId: string | null
  currentAddressIndex: number
  completedEntries: Record<string, string>  // entryId -> resultCode
  skippedEntries: string[]
  lastActiveAt: number

  // Actions
  setWalkList: (id: string) => void
  recordOutcome: (entryId: string, result: string) => void
  revertOutcome: (entryId: string) => void
  skipEntry: (entryId: string) => void
  advanceAddress: () => void
  jumpToAddress: (index: number) => void
  reset: () => void
  touch: () => void
}

export const useCanvassingStore = create<CanvassingState>()(
  persist(
    (set) => ({
      walkListId: null,
      currentAddressIndex: 0,
      completedEntries: {},
      skippedEntries: [],
      lastActiveAt: Date.now(),

      setWalkList: (id) => set({ walkListId: id, currentAddressIndex: 0, completedEntries: {}, skippedEntries: [], lastActiveAt: Date.now() }),
      recordOutcome: (entryId, result) => set((state) => ({
        completedEntries: { ...state.completedEntries, [entryId]: result },
        lastActiveAt: Date.now(),
      })),
      revertOutcome: (entryId) => set((state) => {
        const rest = Object.fromEntries(
          Object.entries(state.completedEntries).filter(([k]) => k !== entryId),
        ) as typeof state.completedEntries
        return { completedEntries: rest }
      }),
      skipEntry: (entryId) => set((state) => ({
        skippedEntries: [...state.skippedEntries, entryId],
        lastActiveAt: Date.now(),
      })),
      advanceAddress: () => set((state) => ({
        currentAddressIndex: state.currentAddressIndex + 1,
        lastActiveAt: Date.now(),
      })),
      jumpToAddress: (index) => set({ currentAddressIndex: index, lastActiveAt: Date.now() }),
      reset: () => set({ walkListId: null, currentAddressIndex: 0, completedEntries: {}, skippedEntries: [], lastActiveAt: Date.now() }),
      touch: () => set({ lastActiveAt: Date.now() }),
    }),
    {
      name: "canvassing-wizard",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
