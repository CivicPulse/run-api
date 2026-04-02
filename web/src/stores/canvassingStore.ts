import { create } from "zustand"
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware"
import { isValidCoordinatePoint, type CoordinatePoint } from "@/types/canvassing"

export type CanvassingSortMode = "sequence" | "distance"
export type CanvassingLocationStatus =
  | "idle"
  | "ready"
  | "denied"
  | "unavailable"

interface CanvassingStoreData {
  walkListId: string | null
  currentAddressIndex: number
  completedEntries: Record<string, string>
  skippedEntries: string[]
  lastActiveAt: number
  sortMode: CanvassingSortMode
  locationStatus: CanvassingLocationStatus
  locationSnapshot: CoordinatePoint | null
}

interface CanvassingState extends CanvassingStoreData {
  setWalkList: (id: string) => void
  recordOutcome: (entryId: string, result: string) => void
  revertOutcome: (entryId: string) => void
  skipEntry: (entryId: string) => void
  advanceAddress: () => void
  jumpToAddress: (index: number) => void
  setSortMode: (mode: CanvassingSortMode) => void
  setLocationState: (
    status: CanvassingLocationStatus,
    snapshot?: CoordinatePoint | null,
  ) => void
  resetOrdering: () => void
  reset: () => void
  touch: () => void
}

const defaultStoreState = (): CanvassingStoreData => ({
  walkListId: null,
  currentAddressIndex: 0,
  completedEntries: {},
  skippedEntries: [],
  lastActiveAt: Date.now(),
  sortMode: "sequence",
  locationStatus: "idle",
  locationSnapshot: null,
})

function isSortMode(value: unknown): value is CanvassingSortMode {
  return value === "sequence" || value === "distance"
}

function isLocationStatus(value: unknown): value is CanvassingLocationStatus {
  return (
    value === "idle" ||
    value === "ready" ||
    value === "denied" ||
    value === "unavailable"
  )
}

export function sanitizePersistedCanvassingState(
  persistedState: unknown,
): Partial<CanvassingStoreData> {
  if (!persistedState || typeof persistedState !== "object") {
    return defaultStoreState()
  }

  const unwrappedState =
    "state" in persistedState &&
    persistedState.state &&
    typeof persistedState.state === "object"
      ? persistedState.state
      : persistedState

  const candidate = unwrappedState as Partial<CanvassingStoreData>
  const baseState = defaultStoreState()

  const locationSnapshot = isValidCoordinatePoint(candidate.locationSnapshot)
    ? candidate.locationSnapshot
    : null
  const locationStatus = isLocationStatus(candidate.locationStatus)
    ? candidate.locationStatus
    : locationSnapshot
      ? "ready"
      : "idle"
  const safeLocationStatus =
    locationStatus === "ready" && !locationSnapshot ? "idle" : locationStatus
  const sortMode = isSortMode(candidate.sortMode) ? candidate.sortMode : "sequence"
  const safeSortMode = sortMode === "distance" && !locationSnapshot
    ? "sequence"
    : sortMode

  return {
    walkListId: typeof candidate.walkListId === "string" ? candidate.walkListId : null,
    currentAddressIndex:
      typeof candidate.currentAddressIndex === "number" && candidate.currentAddressIndex >= 0
        ? candidate.currentAddressIndex
        : baseState.currentAddressIndex,
    completedEntries:
      candidate.completedEntries && typeof candidate.completedEntries === "object"
        ? Object.fromEntries(
            Object.entries(candidate.completedEntries).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === "string" && typeof entry[1] === "string",
            ),
          )
        : baseState.completedEntries,
    skippedEntries: Array.isArray(candidate.skippedEntries)
      ? candidate.skippedEntries.filter(
          (entryId): entryId is string => typeof entryId === "string",
        )
      : baseState.skippedEntries,
    lastActiveAt:
      typeof candidate.lastActiveAt === "number"
        ? candidate.lastActiveAt
        : baseState.lastActiveAt,
    sortMode: safeSortMode,
    locationStatus: safeLocationStatus,
    locationSnapshot,
  }
}

const memoryStorage = new Map<string, string>()

const safeSessionStorage: StateStorage = {
  getItem: (name) => {
    try {
      return sessionStorage.getItem(name)
    } catch {
      return memoryStorage.get(name) ?? null
    }
  },
  setItem: (name, value) => {
    try {
      sessionStorage.setItem(name, value)
    } catch {
      memoryStorage.set(name, value)
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name)
    } catch {
      memoryStorage.delete(name)
    }
  },
}

export const useCanvassingStore = create<CanvassingState>()(
  persist(
    (set) => ({
      ...defaultStoreState(),

      setWalkList: (id) =>
        set({
          ...defaultStoreState(),
          walkListId: id,
          lastActiveAt: Date.now(),
        }),
      recordOutcome: (entryId, result) =>
        set((state) => ({
          completedEntries: { ...state.completedEntries, [entryId]: result },
          lastActiveAt: Date.now(),
        })),
      revertOutcome: (entryId) =>
        set((state) => {
          const rest = Object.fromEntries(
            Object.entries(state.completedEntries).filter(([k]) => k !== entryId),
          ) as typeof state.completedEntries
          return { completedEntries: rest, lastActiveAt: Date.now() }
        }),
      skipEntry: (entryId) =>
        set((state) => ({
          skippedEntries: [...state.skippedEntries, entryId],
          lastActiveAt: Date.now(),
        })),
      advanceAddress: () =>
        set((state) => ({
          currentAddressIndex: state.currentAddressIndex + 1,
          lastActiveAt: Date.now(),
        })),
      jumpToAddress: (index) =>
        set({ currentAddressIndex: index, lastActiveAt: Date.now() }),
      setSortMode: (mode) =>
        set((state) => ({
          sortMode:
            mode === "distance" && !state.locationSnapshot ? "sequence" : mode,
          lastActiveAt: Date.now(),
        })),
      setLocationState: (status, snapshot) => {
        const nextSnapshot = isValidCoordinatePoint(snapshot) ? snapshot : null
        const nextStatus = nextSnapshot
          ? "ready"
          : status === "denied" || status === "unavailable"
            ? status
            : "idle"

        set((state) => ({
          locationStatus: nextStatus,
          locationSnapshot: nextSnapshot,
          sortMode:
            nextStatus === "ready" && nextSnapshot && state.sortMode === "distance"
              ? "distance"
              : nextStatus === "ready" && nextSnapshot
                ? state.sortMode
                : "sequence",
          lastActiveAt: Date.now(),
        }))
      },
      resetOrdering: () =>
        set({
          sortMode: "sequence",
          locationStatus: "idle",
          locationSnapshot: null,
          lastActiveAt: Date.now(),
        }),
      reset: () => set({ ...defaultStoreState(), lastActiveAt: Date.now() }),
      touch: () => set({ lastActiveAt: Date.now() }),
    }),
    {
      name: "canvassing-wizard",
      version: 1,
      storage: createJSONStorage(() => safeSessionStorage),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedCanvassingState(persistedState),
      }),
    },
  ),
)
