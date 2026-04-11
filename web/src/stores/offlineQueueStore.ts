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
  // Plan 110-04 / OFFLINE-03: exponential backoff gate. drainQueue
  // skips items whose `nextAttemptAt > Date.now()`. Optional so
  // legacy (pre-110-04) rehydrated items still drain on first tick.
  nextAttemptAt?: number
  // Plan 110-04 / OFFLINE-03: last error summary attached to an item
  // currently sitting in backoff. Rendered by the ConnectivityPill
  // Sheet (plan 110-05) so volunteers can see WHY an item is stalled.
  lastError?: string
}

// Plan 110-04 / OFFLINE-03: dead-letter slice. 4xx (non-409) failures
// are terminal — validation / auth errors will never succeed on retry,
// so we move them out of the active queue into a dead-letter that the
// ConnectivityPill Sheet (plan 110-05) renders for volunteer review.
export interface DeadLetterItem {
  id: string // new UUID, distinct from the original QueueItem.id
  originalId: string // QueueItem.id before dead-lettering
  type: QueueItem["type"]
  payload: QueueItem["payload"]
  campaignId: string
  resourceId: string
  addedAt: number // when originally enqueued (QueueItem.createdAt)
  failedAt: number // when dead-lettered
  errorSummary: string // human-readable, e.g. "Validation failed: voter_id required"
  errorCode: string // machine-readable, e.g. "http_422", "http_403"
}

interface OfflineQueueState {
  items: QueueItem[]
  deadLetter: DeadLetterItem[]
  isSyncing: boolean
  // Plan 110-04 / OFFLINE-03: sync budget state. `syncStartedAt` is
  // the ms epoch when the current drain began; `isSlow` flips true
  // after 30s elapsed so the ConnectivityPill can render "Syncing
  // (slow)". Both are transient (NOT persisted).
  syncStartedAt: number | null
  isSlow: boolean
  // Plan 110-04 / OFFLINE-03: ms epoch of the last successful full
  // drain. Persisted so a volunteer sees "Last sync: 3 min ago"
  // across reloads.
  lastSyncAt: number | null
  push: (item: Omit<QueueItem, "id" | "createdAt" | "retryCount">) => void
  remove: (id: string) => void
  incrementRetry: (id: string) => void
  setSyncing: (syncing: boolean) => void
  clear: () => void
  // Plan 110-04 / OFFLINE-03 actions
  moveToDeadLetter: (
    itemId: string,
    ctx: { errorSummary: string; errorCode: string },
  ) => void
  retryDeadLetter: (deadLetterId: string) => void
  discardDeadLetter: (deadLetterId: string) => void
  startSync: () => void
  endSync: () => void
  markSlow: () => void
  recordSyncSuccess: () => void
  setItemBackoff: (
    itemId: string,
    nextAttemptAt: number,
    lastError: string,
  ) => void
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      items: [],
      deadLetter: [],
      isSyncing: false,
      syncStartedAt: null,
      isSlow: false,
      lastSyncAt: null,

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

        // Plan 110-03 / OFFLINE-01: guard set() against
        // QuotaExceededError thrown by zustand persist's synchronous
        // localStorage.setItem on low-end devices. The in-memory items
        // array is still updated (best-effort), but we surface a toast
        // so the volunteer knows persistence failed. Dynamic-import
        // sonner to keep it out of the store module's cold-start graph.
        try {
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
        } catch (err) {
          const isQuota =
            err instanceof Error &&
            (err.name === "QuotaExceededError" ||
              err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
              /quota/i.test(err.message))
          if (isQuota) {
            console.warn("[offlineQueueStore] storage quota exceeded", err)
            void import("sonner")
              .then(({ toast }) => {
                toast.error(
                  "Storage full — clearing synced items may help",
                )
              })
              .catch(() => {
                // sonner unavailable in test envs; swallow
              })
          } else {
            throw err
          }
        }
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

      clear: () =>
        set({
          items: [],
          deadLetter: [],
          isSyncing: false,
          syncStartedAt: null,
          isSlow: false,
        }),

      // Plan 110-04 / OFFLINE-03: move a failed item from active queue
      // to the dead-letter slice. Removes from `items`, pushes to
      // `deadLetter` with failure context. Generates a new UUID for the
      // dead-letter record so retryDeadLetter() can cleanly re-enqueue.
      moveToDeadLetter: (itemId, ctx) =>
        set((state) => {
          const item = state.items.find((i) => i.id === itemId)
          if (!item) return state
          const dl: DeadLetterItem = {
            id: crypto.randomUUID(),
            originalId: item.id,
            type: item.type,
            payload: item.payload,
            campaignId: item.campaignId,
            resourceId: item.resourceId,
            addedAt: item.createdAt,
            failedAt: Date.now(),
            errorSummary: ctx.errorSummary,
            errorCode: ctx.errorCode,
          }
          return {
            items: state.items.filter((i) => i.id !== itemId),
            deadLetter: [...state.deadLetter, dl],
          }
        }),

      // Plan 110-04 / OFFLINE-03: volunteer-initiated retry from the
      // ConnectivityPill Sheet. Removes from dead-letter, rebuilds a
      // fresh QueueItem with `retryCount = 0` and `nextAttemptAt =
      // Date.now()` (drains immediately), and preserves the original
      // client_uuid via `originalId` so the server-side partial unique
      // index still dedupes on replay.
      retryDeadLetter: (deadLetterId) =>
        set((state) => {
          const dl = state.deadLetter.find((i) => i.id === deadLetterId)
          if (!dl) return state
          const restored: QueueItem = {
            id: dl.originalId,
            type: dl.type,
            payload: dl.payload,
            campaignId: dl.campaignId,
            resourceId: dl.resourceId,
            createdAt: dl.addedAt,
            retryCount: 0,
            nextAttemptAt: Date.now(),
            lastError: undefined,
          }
          return {
            deadLetter: state.deadLetter.filter((i) => i.id !== deadLetterId),
            items: [...state.items, restored],
          }
        }),

      discardDeadLetter: (deadLetterId) =>
        set((state) => ({
          deadLetter: state.deadLetter.filter((i) => i.id !== deadLetterId),
        })),

      // Plan 110-04 / OFFLINE-03: sync budget lifecycle. `startSync`
      // stamps `syncStartedAt`, clears `isSlow`, and flips `isSyncing`.
      // The React-side useSyncEngine owns the 30s setTimeout that
      // calls `markSlow`. `endSync` resets all three.
      startSync: () =>
        set({
          isSyncing: true,
          syncStartedAt: Date.now(),
          isSlow: false,
        }),
      endSync: () =>
        set({
          isSyncing: false,
          syncStartedAt: null,
          isSlow: false,
        }),
      markSlow: () => set({ isSlow: true }),

      recordSyncSuccess: () => set({ lastSyncAt: Date.now() }),

      setItemBackoff: (itemId, nextAttemptAt, lastError) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  nextAttemptAt,
                  lastError,
                  retryCount: item.retryCount + 1,
                }
              : item,
          ),
        })),
    }),
    {
      name: "offline-queue",
      // Plan 110-04 / OFFLINE-03: bump to v2 for the new optional
      // QueueItem fields (nextAttemptAt, lastError) and the new
      // top-level `deadLetter` + `lastSyncAt` state. Pre-v2 rehydrates
      // pass through the v0→v1 stamping path and then land here with
      // the new fields undefined — which is safe because they are all
      // optional or default-initialized.
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Plan 110-04 / OFFLINE-03: persist `deadLetter` and `lastSyncAt`
      // so dead-letters survive reloads (volunteers can review/retry
      // the next morning). `syncStartedAt` / `isSlow` are transient.
      partialize: (state) => ({
        items: state.items,
        deadLetter: state.deadLetter,
        lastSyncAt: state.lastSyncAt,
      }),
      // Plan 110-03 / OFFLINE-01: v0 → v1 migration. Pre-110-02 queue
      // items have no `client_uuid` on the payload. Stamp it from
      // `item.id` (which is already a UUID) so rehydrated items can
      // round-trip through the server-side dedup path on next drain.
      // Drop any items that fail the minimal shape guard.
      //
      // Plan 110-04 / OFFLINE-03: v1 → v2 migration is a no-op on the
      // items shape — new fields are all optional. We DO initialize
      // `deadLetter` to [] when absent so downstream code never hits
      // `undefined.length`.
      migrate: (persistedState, version) => {
        const s = (persistedState ?? {}) as {
          items?: QueueItem[]
          deadLetter?: DeadLetterItem[]
          lastSyncAt?: number | null
        }
        if (version < 1) {
          if (Array.isArray(s.items)) {
            s.items = s.items
              .filter(
                (it): it is QueueItem =>
                  !!it && typeof it.id === "string" && !!it.payload,
              )
              .map((it) => {
                if (it.type !== "door_knock") return it
                const p = it.payload as DoorKnockCreate & {
                  client_uuid?: string
                }
                return {
                  ...it,
                  payload: {
                    ...p,
                    client_uuid: p.client_uuid ?? it.id,
                  },
                }
              })
          } else {
            s.items = []
          }
        }
        if (version < 2) {
          if (!Array.isArray(s.deadLetter)) s.deadLetter = []
          if (typeof s.lastSyncAt !== "number") s.lastSyncAt = null
        }
        return s as OfflineQueueState
      },
      // Plan 110-03 / OFFLINE-01: if localStorage held invalid JSON or
      // the migrate hook threw, log the failure and let the store
      // start with its default empty items — never crash the app.
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn("[offlineQueueStore] rehydrate error", error)
        }
      },
    }
  )
)
