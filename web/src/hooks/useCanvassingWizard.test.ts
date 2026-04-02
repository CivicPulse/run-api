import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { useCanvassingWizard } from "@/hooks/useCanvassingWizard"
import { useCanvassingStore } from "@/stores/canvassingStore"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

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

vi.mock("@/hooks/useCanvassing", () => ({
  useEnrichedEntries: vi.fn(() => ({ data: entries, isLoading: false, isError: false })),
  useDoorKnockMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useSkipEntryMutation: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

describe("useCanvassingWizard", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useCanvassingStore.getState().reset()
  })

  test("preserves the active household when switching from sequence to distance order", async () => {
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
        "house-b",
        "house-a",
      ])
      expect(result.current.currentHousehold?.householdKey).toBe("house-a")
      expect(result.current.currentAddressIndex).toBe(1)
    })
  })
})
