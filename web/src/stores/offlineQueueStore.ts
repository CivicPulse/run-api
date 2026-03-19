import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { DoorKnockCreate } from "@/types/walk-list"
import type { RecordCallPayload } from "@/types/phone-bank-session"

export interface QueueItem {
  id: string
  type: "door_knock" | "call_record"
  payload: DoorKnockCreate | RecordCallPayload
  campaignId: string
  resourceId: string
  createdAt: number
  retryCount: number
}

interface OfflineQueueState {
  items: QueueItem[]
  isSyncing: boolean
  push: (item: Omit<QueueItem, "id" | "createdAt" | "retryCount">) => void
  remove: (id: string) => void
  incrementRetry: (id: string) => void
  setSyncing: (syncing: boolean) => void
  clear: () => void
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set) => ({
      items: [],
      isSyncing: false,

      push: (item) => {
        // Validate required fields before queuing
        if (item.type === "door_knock" && !(item.payload as { voter_id?: string }).voter_id) {
          console.error("Cannot queue door_knock without voter_id")
          return
        }
        set((state) => ({
          items: [
            ...state.items,
            {
              ...item,
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              retryCount: 0,
            },
          ],
        }))
      },

      remove: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      incrementRetry: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, retryCount: item.retryCount + 1 }
              : item
          ),
        })),

      setSyncing: (syncing) => set({ isSyncing: syncing }),

      clear: () => set({ items: [], isSyncing: false }),
    }),
    {
      name: "offline-queue",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
)
