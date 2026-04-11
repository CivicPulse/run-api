import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useCanvassingWizard } from "@/hooks/useCanvassingWizard"
import { useCanvassingStore } from "@/stores/canvassingStore"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

const mutateAsync = vi.fn()
const skipMutate = vi.fn()

// Phase 107-04: 3-voter household for the D-18 hybrid advance tests. Voters
// share the same `household_key` so groupByHousehold collapses them into a
// single Household with three entries.
const multiVoterEntries: EnrichedWalkListEntry[] = [
  {
    id: "entry-m1",
    voter_id: "voter-m1",
    household_key: "house-multi",
    sequence: 1,
    status: "pending",
    latitude: 32.84,
    longitude: -83.63,
    voter: {
      first_name: "Morgan",
      last_name: "M1",
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
  {
    id: "entry-m2",
    voter_id: "voter-m2",
    household_key: "house-multi",
    sequence: 1,
    status: "pending",
    latitude: 32.84,
    longitude: -83.63,
    voter: {
      first_name: "Morgan",
      last_name: "M2",
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
  {
    id: "entry-m3",
    voter_id: "voter-m3",
    household_key: "house-multi",
    sequence: 1,
    status: "pending",
    latitude: 32.84,
    longitude: -83.63,
    voter: {
      first_name: "Morgan",
      last_name: "M3",
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
  {
    id: "entry-next",
    voter_id: "voter-next",
    household_key: "house-next",
    sequence: 2,
    status: "pending",
    latitude: 32.85,
    longitude: -83.62,
    voter: {
      first_name: "Next",
      last_name: "House",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: "400 Elm St",
      registration_line2: null,
      registration_city: "Macon",
      registration_state: "GA",
      registration_zip: "31201",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
]

const entries: EnrichedWalkListEntry[] = [
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
]

const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const entriesData = vi.hoisted(() => ({ value: [] as unknown[] }))

vi.mock("@/hooks/useCanvassing", () => ({
  useEnrichedEntries: vi.fn(() => ({ data: entriesData.value, isLoading: false, isError: false })),
  useDoorKnockMutation: vi.fn(() => ({ mutateAsync, isPending: false })),
  useSkipEntryMutation: vi.fn(() => ({ mutate: skipMutate })),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: toastSuccess }),
}))

const originalVibrate = (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate

describe("useCanvassingWizard", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useCanvassingStore.getState().reset()
    mutateAsync.mockReset()
    skipMutate.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    entriesData.value = entries
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    if (originalVibrate === undefined) {
      // happy-dom default may not have vibrate; remove the stub
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        writable: true,
        value: undefined,
      })
      // and delete to fully remove from `'vibrate' in navigator` check
      delete (navigator as Navigator & { vibrate?: unknown }).vibrate
    } else {
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        writable: true,
        value: originalVibrate,
      })
    }
  })

  test("switches to nearest door when enabling distance sort", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(useCanvassingStore.getState().walkListId).toBe("walk-1")
    })

    expect(result.current.households.map((household) => household.householdKey)).toEqual([
      "house-a",
      "house-b",
    ])
    expect(result.current.currentHousehold?.householdKey).toBe("house-a")
    expect(result.current.currentAddressIndex).toBe(0)

    // Set location near house-b and switch to distance sort — the nearest
    // door (house-b) should become the active household at index 0.
    act(() => {
      useCanvassingStore.getState().setLocationState("ready", {
        latitude: 32.8501,
        longitude: -83.6201,
      })
      useCanvassingStore.getState().setSortMode("distance")
    })

    await waitFor(() => {
      expect(result.current.households.map((household) => household.householdKey)).toEqual([
        "house-b",
        "house-a",
      ])
      expect(result.current.currentHousehold?.householdKey).toBe("house-b")
      expect(result.current.currentAddressIndex).toBe(0)
    })
  })

  test("holds contact outcomes as drafts until the final submit path runs", async () => {
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    const outcome = await result.current.handleOutcome("entry-a", "voter-a", "supporter")

    expect(outcome).toEqual({ surveyTrigger: true })
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(useCanvassingStore.getState().completedEntries).toEqual({})

    let submission: Awaited<ReturnType<typeof result.current.handleSubmitContact>> | undefined
    await act(async () => {
      submission = await result.current.handleSubmitContact({
        entryId: "entry-a",
        voterId: "voter-a",
        result: "supporter",
        notes: "Met voter at the door.",
        surveyResponses: [{ question_id: "q-1", answer_value: "Supporter" }],
        surveyComplete: true,
      })
    })

    expect(submission!.saved).toBe(true)
    expect(submission!.failure).toBeNull()
    expect(mutateAsync).toHaveBeenCalledWith({
      walk_list_entry_id: "entry-a",
      voter_id: "voter-a",
      result_code: "supporter",
      notes: "Met voter at the door.",
      survey_responses: [{ question_id: "q-1", voter_id: "voter-a", answer_value: "Supporter" }],
      survey_complete: true,
    })

    // Deep per-voter contact submit advances the wizard unconditionally — even
    // if remaining residents at this address are still pending — so the
    // volunteer can move forward and revisit via All Doors if needed.
    await waitFor(() => {
      expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    })
  })

  test("keeps the active door stable when final submit fails", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"))
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    const submission = await result.current.handleSubmitContact({
      entryId: "entry-a",
      voterId: "voter-a",
      result: "supporter",
      notes: "Need retry.",
      surveyResponses: [{ question_id: "q-1", answer_value: "Supporter" }],
      surveyComplete: true,
    })

    expect(submission.saved).toBe(false)
    expect(submission.failure).toEqual({
      title: "Couldn’t save this door knock yet",
      detail: "boom",
      actionLabel: "Retry save",
    })
    expect(useCanvassingStore.getState().completedEntries).toEqual({})
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)
    expect(toastError).not.toHaveBeenCalled()
  })

  test("auto-advances after non-contact saves on the same submit path", async () => {
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    const outcome = await result.current.handleOutcome("entry-a", "voter-a", "not_home")

    expect(outcome).toEqual({})
    expect(mutateAsync).toHaveBeenCalledWith({
      walk_list_entry_id: "entry-a",
      voter_id: "voter-a",
      result_code: "not_home",
    })
  })

  test("skips the current address back into the queue and advances to the next door", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    act(() => {
      result.current.handleSkipAddress()
    })

    await waitFor(() => {
      expect(useCanvassingStore.getState().skippedEntries).toEqual(["entry-a"])
      expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    })
    expect(skipMutate).toHaveBeenCalledWith("entry-a")
  })

  // ---------------------------------------------------------------------------
  // Phase 107-04 — D-18 hybrid + D-03 triple-channel feedback regression suite.
  // ---------------------------------------------------------------------------

  test("house-level outcome on multi-voter household advances immediately", async () => {
    entriesData.value = multiVoterEntries
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.currentHousehold?.householdKey).toBe("house-multi")
    })

    await act(async () => {
      await result.current.handleOutcome("entry-m1", "voter-m1", "not_home")
    })

    // CANV-01 fix: house-level outcome bypasses the per-voter settled gate.
    // Voters m2 and m3 are still pending, but the wizard advances to the next
    // household anyway. (Index advances from 0 → 1; pinning logic may keep
    // the previously-active card visible at the new index, but the advance
    // itself is what we're locking in.)
    await waitFor(() => {
      expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    })
  })

  test("voter-level outcome on multi-voter household does NOT advance until all voters settled", async () => {
    entriesData.value = multiVoterEntries
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.currentHousehold?.householdKey).toBe("house-multi")
    })

    // The real useDoorKnockMutation onSuccess writes recordOutcome to the
    // store; the mock here doesn't run that handler, so we simulate it
    // ourselves before each handleOutcome call to give the per-voter settled
    // gate something to evaluate.
    const recordAndAdvance = async (entryId: string, voterId: string) => {
      await act(async () => {
        await result.current.handleOutcome(entryId, voterId, "moved")
      })
      act(() => {
        useCanvassingStore.getState().recordOutcome(entryId, "moved")
      })
    }

    // Voter 1: record outcome, simulate the store write. The settled-gate
    // helper read store state BEFORE we wrote — index stays 0.
    await recordAndAdvance("entry-m1", "voter-m1")
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)

    await recordAndAdvance("entry-m2", "voter-m2")
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)

    // Final voter: write the store state FIRST so the settled-gate inside
    // submitDoorKnock sees all 3 done and fires the advance. This mirrors
    // how the real onSuccess runs synchronously inside the mutation flow.
    act(() => {
      useCanvassingStore.getState().recordOutcome("entry-m3", "moved")
    })
    await act(async () => {
      await result.current.handleOutcome("entry-m3", "voter-m3", "moved")
    })

    await waitFor(() => {
      expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    })
  })

  test("survey-trigger outcome (supporter) keeps the existing survey path and does not advance", async () => {
    entriesData.value = multiVoterEntries
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    const outcome = await result.current.handleOutcome("entry-m1", "voter-m1", "supporter")

    expect(outcome).toEqual({ surveyTrigger: true })
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)
  })

  test("auto-advance fires sonner success toast with id 'auto-advance'", async () => {
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await act(async () => {
      await result.current.handleOutcome("entry-a", "voter-a", "not_home")
    })

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled()
    })
    expect(toastSuccess).toHaveBeenCalledWith(
      "Recorded — next house",
      expect.objectContaining({ id: "auto-advance", duration: 2000 }),
    )
  })

  test("auto-advance calls navigator.vibrate(50) when supported", async () => {
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await act(async () => {
      await result.current.handleOutcome("entry-a", "voter-a", "not_home")
    })

    await waitFor(() => {
      expect(navigator.vibrate).toHaveBeenCalledWith(50)
    })
  })

  test("auto-advance silently skips vibrate when not supported", async () => {
    delete (navigator as Navigator & { vibrate?: unknown }).vibrate
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await expect(
      act(async () => {
        await result.current.handleOutcome("entry-a", "voter-a", "not_home")
      }),
    ).resolves.not.toThrow()

    await waitFor(() => {
      expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    })
  })

  test("save failure shows persistent retry toast and does NOT advance", async () => {
    mutateAsync.mockRejectedValue(new Error("network down"))
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await act(async () => {
      await result.current.handleOutcome("entry-a", "voter-a", "not_home")
    })

    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)
    expect(toastError).toHaveBeenCalledWith(
      "Couldn't save — tap to retry",
      expect.objectContaining({
        id: "auto-advance-error",
        duration: Number.POSITIVE_INFINITY,
        action: expect.objectContaining({ label: "Retry" }),
      }),
    )
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  test("empty notes on handleSubmitContact still advances (CANV-03 coupling)", async () => {
    mutateAsync.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    let submission: Awaited<ReturnType<typeof result.current.handleSubmitContact>> | undefined
    await act(async () => {
      submission = await result.current.handleSubmitContact({
        entryId: "entry-a",
        voterId: "voter-a",
        result: "supporter",
        notes: "",
        surveyResponses: [{ question_id: "q-1", answer_value: "Supporter" }],
        surveyComplete: true,
      })
    })

    expect(submission!.saved).toBe(true)
    expect(submission!.failure).toBeNull()
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        walk_list_entry_id: "entry-a",
        voter_id: "voter-a",
        result_code: "supporter",
        notes: "",
      }),
    )
    await waitFor(() => {
      expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    })
  })
})

