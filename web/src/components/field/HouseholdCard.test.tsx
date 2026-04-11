/**
 * Phase 107-08.1 — render-path regression test for the pinning bug uncovered
 * by 107-08 E2E execution.
 *
 * The hook unit tests in `useCanvassingWizard.test.ts` only assert on
 * `currentAddressIndex` because Plan 107-04's executor explicitly removed the
 * household-key assertion to dodge the pinning interaction. That left a gap:
 * the hook reported the right index, but the rendered HouseholdCard kept
 * showing the previously-active household because the `households` memo was
 * re-pinning the old household at the new index slot.
 *
 * This test bridges the hook-state vs. DOM-render gap by mounting a tiny
 * component that uses `useCanvassingWizard` directly and renders
 * `currentHousehold.address`. After a HOUSE_LEVEL_OUTCOME on a multi-voter
 * household, the rendered DOM text MUST switch to the next household's
 * address — not just the index. If the pin were still set, the rendered
 * text would stay stuck on House A and this test would fail loudly.
 *
 * Verification of this test as a regression-guard (Plan 107-08.1 Task 2):
 * temporarily revert `useCanvassingWizard.ts` so `setPinnedHouseholdKey(null)`
 * is no longer called inside the wrapped advanceAddress, re-run this test —
 * it MUST go red. Re-apply the fix; it MUST go green.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { useCanvassingWizard } from "@/hooks/useCanvassingWizard"
import { useCanvassingStore } from "@/stores/canvassingStore"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

const HOUSE_A_LINE1 = "300 Pine St"
const HOUSE_B_LINE1 = "400 Elm St"

// 3 voters at house-multi (House A) + 1 voter at house-next (House B). The
// 3-voter shape is load-bearing — house-level outcomes on a multi-voter
// household are exactly the case the pinning bug hides.
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
      first_name: "Alice",
      last_name: "Anderson",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: HOUSE_A_LINE1,
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
      first_name: "Aaron",
      last_name: "Anderson",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: HOUSE_A_LINE1,
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
      first_name: "Amelia",
      last_name: "Anderson",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: HOUSE_A_LINE1,
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
      first_name: "Brett",
      last_name: "Brown",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: HOUSE_B_LINE1,
      registration_line2: null,
      registration_city: "Macon",
      registration_state: "GA",
      registration_zip: "31201",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
]

const mutateAsync = vi.fn()
const skipMutate = vi.fn()
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
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}))

// A tiny component that drives `useCanvassingWizard` and renders the
// currently-displayed household address — this is where the pinning bug
// would hide because it bypasses unit-level state inspection and asserts
// on the actual DOM the volunteer would see.
function WizardHarness({
  onReady,
}: {
  onReady?: (api: ReturnType<typeof useCanvassingWizard>) => void
}) {
  const wizard = useCanvassingWizard("camp-1", "walk-1")
  // Expose the wizard API to the test so it can fire handleOutcome.
  if (onReady) onReady(wizard)
  return (
    <div>
      <div data-testid="rendered-address">
        {wizard.currentHousehold?.address ?? "(none)"}
      </div>
      <div data-testid="rendered-household-key">
        {wizard.currentHousehold?.householdKey ?? "(none)"}
      </div>
    </div>
  )
}

describe("HouseholdCard render-path regression (Plan 107-08.1)", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useCanvassingStore.getState().reset()
    mutateAsync.mockReset()
    skipMutate.mockReset()
    skipMutationState.isPending = false
    entriesData.value = multiVoterEntries
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test("rendered address swaps to the next household after a house-level outcome auto-advance", async () => {
    mutateAsync.mockResolvedValue(undefined)

    let wizardApi: ReturnType<typeof useCanvassingWizard> | null = null
    render(
      <WizardHarness
        onReady={(api) => {
          wizardApi = api
        }}
      />,
    )

    // Sanity: the harness starts on House A (3-voter household).
    await waitFor(() => {
      expect(screen.getByTestId("rendered-address").textContent).toContain(
        HOUSE_A_LINE1,
      )
      expect(screen.getByTestId("rendered-household-key").textContent).toBe(
        "house-multi",
      )
    })

    // Act: record a HOUSE-LEVEL outcome ("not_home") on Alice. Per the hybrid
    // CANV-01 rule, this advances the household IMMEDIATELY even though
    // Aaron and Amelia are still pending.
    await act(async () => {
      await wizardApi!.handleOutcome("entry-m1", "voter-m1", "not_home")
    })

    // Assertion: the RENDERED DOM TEXT must show House B's address.
    // Pre-fix this would fail because the `households` memo would re-pin
    // house-multi at the new currentAddressIndex, hiding the swap.
    await waitFor(() => {
      expect(screen.getByTestId("rendered-household-key").textContent).toBe(
        "house-next",
      )
      expect(screen.getByTestId("rendered-address").textContent).toContain(
        HOUSE_B_LINE1,
      )
      expect(screen.getByTestId("rendered-address").textContent).not.toContain(
        HOUSE_A_LINE1,
      )
    })
  })

  test("rendered address swaps to the next household after Skip", async () => {
    let wizardApi: ReturnType<typeof useCanvassingWizard> | null = null
    render(
      <WizardHarness
        onReady={(api) => {
          wizardApi = api
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("rendered-household-key").textContent).toBe(
        "house-multi",
      )
    })

    // Act: tap Skip on the active house.
    act(() => {
      wizardApi!.handleSkipAddress()
    })

    // Assertion: the rendered DOM must now show House B. Pre-fix the pin
    // would keep House A glued to the new index even though the Skip
    // advanced currentAddressIndex.
    await waitFor(() => {
      expect(screen.getByTestId("rendered-household-key").textContent).toBe(
        "house-next",
      )
      expect(screen.getByTestId("rendered-address").textContent).toContain(
        HOUSE_B_LINE1,
      )
    })
  })
})
