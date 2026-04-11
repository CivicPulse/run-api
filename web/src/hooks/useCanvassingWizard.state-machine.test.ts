// Phase 108-05 (SELECT-03, D-11) — Behavioral state-machine regression guard.
//
// Purpose: prove that every one of the 5 intentional entry points documented
// in D-09 / 108-STATE-MACHINE.md (list-tap, map-tap, auto-advance, skip,
// resume) lands the wizard on the SAME class of target state: a non-zero
// currentAddressIndex pointing at a concrete household. If any entry point
// regresses — e.g. a stale pinnedHouseholdKey re-snaps the render back to the
// previous door — this file fails loudly.
//
// Scope: hook-layer only. The render-path pinnedHouseholdKey clear is owned
// by `HouseholdCard.test.tsx` because the hook intentionally does NOT expose
// `pinnedHouseholdKey` on its public result (removed in Plan 107-04). The
// visual distinction between list-tap and map-tap is owned by E2E in Plan
// 108-06; at the hook layer they share `handleJumpToAddress` verbatim.
//
// Cross-reference: .planning/phases/108-house-selection-active-state/108-STATE-MACHINE.md

import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { useCanvassingWizard } from "@/hooks/useCanvassingWizard"
import { useCanvassingStore } from "@/stores/canvassingStore"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

const mutateAsync = vi.fn()
const skipMutate = vi.fn()

// Three single-voter households: house-a (index 0), house-b (index 1),
// house-c (index 2). Each entry point is driven from house-a and is expected
// to reach house-b (index 1) — either by explicit jump, by auto-advance, by
// skip-advance, or by resuming persisted state that already points at index 1.
const threeHouseEntries: EnrichedWalkListEntry[] = [
  {
    id: "entry-a",
    voter_id: "voter-a",
    household_key: "house-a",
    sequence: 1,
    status: "pending",
    latitude: 32.84,
    longitude: -83.63,
    voter: {
      first_name: "Avery",
      last_name: "A",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: "100 Main St",
      registration_line2: null,
      registration_city: "Macon",
      registration_state: "GA",
      registration_zip: "31201",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
  {
    id: "entry-b",
    voter_id: "voter-b",
    household_key: "house-b",
    sequence: 2,
    status: "pending",
    latitude: 32.8502,
    longitude: -83.6202,
    voter: {
      first_name: "Bailey",
      last_name: "B",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: "200 Oak Ave",
      registration_line2: null,
      registration_city: "Macon",
      registration_state: "GA",
      registration_zip: "31201",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
  {
    id: "entry-c",
    voter_id: "voter-c",
    household_key: "house-c",
    sequence: 3,
    status: "pending",
    latitude: 32.8604,
    longitude: -83.6304,
    voter: {
      first_name: "Casey",
      last_name: "C",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: "300 Pine St",
      registration_line2: null,
      registration_city: "Macon",
      registration_state: "GA",
      registration_zip: "31201",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
]

const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const toastInfo = vi.hoisted(() => vi.fn())
const toastBase = vi.hoisted(() => vi.fn())
const entriesData = vi.hoisted(() => ({ value: [] as unknown[] }))
const skipMutationState = vi.hoisted(() => ({ isPending: false }))

vi.mock("@/hooks/useCanvassing", () => ({
  useEnrichedEntries: vi.fn(() => ({
    data: entriesData.value,
    isLoading: false,
    isError: false,
  })),
  useDoorKnockMutation: vi.fn(() => ({ mutateAsync, isPending: false })),
  useSkipEntryMutation: vi.fn(() => ({
    mutate: skipMutate,
    get isPending() {
      return skipMutationState.isPending
    },
  })),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(toastBase, {
    error: toastError,
    success: toastSuccess,
    info: toastInfo,
  }),
}))

// Persist key + version must match `canvassingStore.ts` verbatim. If either
// drifts, zustand-persist silently falls back to defaults and the resume test
// passes for the wrong reason. The shape below mirrors the `CanvassingStoreData`
// interface exactly.
const CANVASSING_PERSIST_KEY = "canvassing-wizard"
const CANVASSING_PERSIST_VERSION = 1

function seedResumeState(walkListId: string, currentAddressIndex: number) {
  const persistedBlob = {
    state: {
      walkListId,
      currentAddressIndex,
      completedEntries: {},
      skippedEntries: [],
      lastActiveAt: Date.now(),
      sortMode: "sequence",
      locationStatus: "idle",
      locationSnapshot: null,
    },
    version: CANVASSING_PERSIST_VERSION,
  }
  sessionStorage.setItem(CANVASSING_PERSIST_KEY, JSON.stringify(persistedBlob))

  // Belt-and-braces: the zustand-persist merge runs ONCE at store creation
  // (module load), so seeding sessionStorage mid-test does not re-trigger it.
  // Mirror the persisted state into the live store via setState so the
  // already-created store reflects the "resumed" shape. This is functionally
  // equivalent to what the merge would produce on a fresh module load.
  useCanvassingStore.setState({
    walkListId,
    currentAddressIndex,
    completedEntries: {},
    skippedEntries: [],
    sortMode: "sequence",
    locationStatus: "idle",
    locationSnapshot: null,
  })
}

function expectTargetReached(
  currentHouseholdKey: string | undefined,
  storeIndex: number,
  targetIndex: number,
  targetKey: string,
) {
  expect(storeIndex).toBe(targetIndex)
  expect(currentHouseholdKey).toBe(targetKey)
}

describe("SELECT-03 — active-house state machine reachability (D-11)", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useCanvassingStore.getState().reset()
    mutateAsync.mockReset()
    skipMutate.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    toastInfo.mockReset()
    toastBase.mockReset()
    skipMutationState.isPending = false
    entriesData.value = threeHouseEntries
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
  })

  test("D-09 entry point 1 — list-tap reaches the target household", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.households.length).toBeGreaterThanOrEqual(3)
      expect(result.current.currentHousehold?.householdKey).toBe("house-a")
    })
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)

    act(() => {
      result.current.handleJumpToAddress(1)
    })

    await waitFor(() => {
      expectTargetReached(
        result.current.currentHousehold?.householdKey,
        useCanvassingStore.getState().currentAddressIndex,
        1,
        "house-b",
      )
    })
  })

  test("D-09 entry point 2 — map-tap reaches the target household", async () => {
    // Map-tap and list-tap share `handleJumpToAddress` at the hook layer; the
    // physical distinction (which DOM element was tapped) is owned by E2E in
    // Plan 108-06. This test explicitly exercises the same call a second time
    // so that if the code path ever diverges — e.g. map-tap gains a bespoke
    // handler that forgets to clear the pin — the state-machine file is the
    // regression guard that catches it.
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.households.length).toBeGreaterThanOrEqual(3)
    })

    act(() => {
      // Same call used by CanvassingMap marker click.
      result.current.handleJumpToAddress(1)
    })

    await waitFor(() => {
      expectTargetReached(
        result.current.currentHousehold?.householdKey,
        useCanvassingStore.getState().currentAddressIndex,
        1,
        "house-b",
      )
    })
  })

  test("D-09 entry point 3 — auto-advance after HOUSE_LEVEL_OUTCOME reaches the next household", async () => {
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.households.length).toBeGreaterThanOrEqual(3)
      expect(result.current.currentHousehold?.householdKey).toBe("house-a")
    })
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)

    // `not_home` is a house-level non-survey outcome. The existing hook test
    // (useCanvassingWizard.test.ts > "auto-advances after non-contact saves")
    // confirms this path advances currentAddressIndex by one.
    await act(async () => {
      await result.current.handleOutcome("entry-a", "voter-a", "not_home")
    })

    await waitFor(() => {
      expectTargetReached(
        result.current.currentHousehold?.householdKey,
        useCanvassingStore.getState().currentAddressIndex,
        1,
        "house-b",
      )
    })
  })

  test("D-09 entry point 4 — skip reaches the next pending household", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.households.length).toBeGreaterThanOrEqual(3)
      expect(result.current.currentHousehold?.householdKey).toBe("house-a")
    })
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)

    act(() => {
      result.current.handleSkipAddress()
    })

    await waitFor(() => {
      expectTargetReached(
        result.current.currentHousehold?.householdKey,
        useCanvassingStore.getState().currentAddressIndex,
        1,
        "house-b",
      )
    })
  })

  test("D-09 entry point 5 — resume from persisted sessionStorage lands on the persisted index", async () => {
    // Seed BEFORE mounting so the hook's `setWalkList` useEffect sees that the
    // store already matches walkListId and does NOT reset the store back to
    // index 0. (When storeWalkListId === walkListId the hook skips setWalkList.)
    seedResumeState("walk-1", 1)

    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.households.length).toBeGreaterThanOrEqual(3)
    })

    // After mount the hook should reflect index 1 without any user action —
    // the volunteer closed the browser on house-b and re-opened it to find
    // themselves right back where they left off.
    await waitFor(() => {
      expectTargetReached(
        result.current.currentHousehold?.householdKey,
        useCanvassingStore.getState().currentAddressIndex,
        1,
        "house-b",
      )
    })

    // Sanity: the sessionStorage blob is still present (the hook did not
    // stomp it on mount).
    const raw = sessionStorage.getItem(CANVASSING_PERSIST_KEY)
    expect(raw).not.toBeNull()
    expect(raw && JSON.parse(raw).state.currentAddressIndex).toBe(1)
  })
})
