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
    (set, get) => ({
      items: [],
      isSyncing: false,

      push: (item) => {
        // Validate required fields before queuing
        if (item.type === "door_knock" && !(item.payload as { voter_id?: string }).voter_id) {
          console.error("Cannot queue door_knock without voter_id")
          return
        }

        // Plan 110-02 / OFFLINE-01: double-enqueue guard. If a pending
        // door_knock for the same (walk_list_entry_id, voter_id,
        // result_code) triple already exists, bail out — a rapid double
        // tap must never produce two server POSTs after reconnect.
        // Only checks door_knock; call_record guard is out of scope for
        // this plan (see audit §5).
        if (item.type === "door_knock") {
          const incoming = item.payload as DoorKnockCreate
          const existing = get().items.find((q) => {
            if (q.type !== "door_knock") return false
            const p = q.payload as DoorKnockCreate
            return (
              p.walk_list_entry_id === incoming.walk_list_entry_id &&
              p.voter_id === incoming.voter_id &&
              p.result_code === incoming.result_code
            )
          })
          if (existing) {
            if (typeof console !== "undefined") {
              console.debug(
                "[offlineQueueStore] skipping duplicate door_knock push",
                {
                  existingId: existing.id,
                  walk_list_entry_id: incoming.walk_list_entry_id,
                  voter_id: incoming.voter_id,
                  result_code: incoming.result_code,
                },
              )
            }
            return
          }
        }

        // Plan 110-02 / OFFLINE-01: generate the UUID once, then stamp
        // it on BOTH `QueueItem.id` AND `payload.client_uuid`. Server-
        // side partial unique index on (campaign_id, client_uuid)
        // converts any replay into a 409 which drainQueue already
        // consumes via `isConflict`.
        const id = crypto.randomUUID()
        const payload =
          item.type === "door_knock"
            ? { ...(item.payload as DoorKnockCreate), client_uuid: id }
            : item.payload
        set((state) => ({
          items: [
            ...state.items,
            {
              ...item,
              payload,
              id,
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
