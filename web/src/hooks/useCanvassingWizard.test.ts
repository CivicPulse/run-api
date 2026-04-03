import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { useCanvassingWizard } from "@/hooks/useCanvassingWizard"
import { useCanvassingStore } from "@/stores/canvassingStore"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

const mutateAsync = vi.fn()
const skipMutate = vi.fn()

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

const toastError = vi.fn()

vi.mock("@/hooks/useCanvassing", () => ({
  useEnrichedEntries: vi.fn(() => ({ data: entries, isLoading: false, isError: false })),
  useDoorKnockMutation: vi.fn(() => ({ mutateAsync, isPending: false })),
  useSkipEntryMutation: vi.fn(() => ({ mutate: skipMutate })),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}))

describe("useCanvassingWizard", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useCanvassingStore.getState().reset()
    mutateAsync.mockReset()
    skipMutate.mockReset()
    toastError.mockReset()
  })

  test("keeps the active household pinned while reordering the remaining route by distance", async () => {
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

    act(() => {
      useCanvassingStore.getState().setLocationState("ready", {
        latitude: 32.8501,
        longitude: -83.6201,
      })
      useCanvassingStore.getState().setSortMode("distance")
    })

    await waitFor(() => {
      expect(result.current.households.map((household) => household.householdKey)).toEqual([
        "house-a",
        "house-b",
      ])
      expect(result.current.currentHousehold?.householdKey).toBe("house-a")
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

    const saved = await result.current.handleSubmitContact({
      entryId: "entry-a",
      voterId: "voter-a",
      result: "supporter",
      notes: "Met voter at the door.",
      surveyResponses: [{ question_id: "q-1", answer_value: "Supporter" }],
      surveyComplete: true,
    })

    expect(saved).toBe(true)
    expect(mutateAsync).toHaveBeenCalledWith({
      walk_list_entry_id: "entry-a",
      voter_id: "voter-a",
      result_code: "supporter",
      notes: "Met voter at the door.",
      survey_responses: [{ question_id: "q-1", answer_value: "Supporter" }],
      survey_complete: true,
    })
    expect(useCanvassingStore.getState().completedEntries).toEqual({ entry-a: "supporter" })
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
  })

  test("keeps the active door stable when final submit fails", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"))
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    const saved = await result.current.handleSubmitContact({
      entryId: "entry-a",
      voterId: "voter-a",
      result: "supporter",
      notes: "Need retry.",
      surveyResponses: [{ question_id: "q-1", answer_value: "Supporter" }],
      surveyComplete: true,
    })

    expect(saved).toBe(false)
    expect(useCanvassingStore.getState().completedEntries).toEqual({})
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)
    expect(toastError).toHaveBeenCalledWith("Failed to save this contact. Please retry before moving on.")
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
    expect(useCanvassingStore.getState().completedEntries).toEqual({ entry-a: "not_home" })
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
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
})
