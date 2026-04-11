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
const toastInfo = vi.hoisted(() => vi.fn())
const toastBase = vi.hoisted(() => vi.fn())
const entriesData = vi.hoisted(() => ({ value: [] as unknown[] }))
const skipMutationState = vi.hoisted(() => ({ isPending: false }))

vi.mock("@/hooks/useCanvassing", () => ({
  useEnrichedEntries: vi.fn(() => ({ data: entriesData.value, isLoading: false, isError: false })),
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

const originalVibrate = (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate

describe("useCanvassingWizard", () => {
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
    // Plan 110-02 / OFFLINE-01: submitDoorKnock stamps client_uuid on the
    // online path so a mid-flight retry after a drop carries the same UUID
    // and hits the server's 409 dedup path. Use objectContaining so the
    // UUID's exact value doesn't hard-couple this test.
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      walk_list_entry_id: "entry-a",
      voter_id: "voter-a",
      result_code: "supporter",
      notes: "Met voter at the door.",
      survey_responses: [{ question_id: "q-1", voter_id: "voter-a", answer_value: "Supporter" }],
      survey_complete: true,
      client_uuid: expect.any(String),
    }))

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
    // Plan 110-02 / OFFLINE-01: client_uuid stamped at call site.
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      walk_list_entry_id: "entry-a",
      voter_id: "voter-a",
      result_code: "not_home",
      client_uuid: expect.any(String),
    }))
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
    expect(skipMutate).toHaveBeenCalledWith("entry-a", expect.any(Object))
  })

  // ---------------------------------------------------------------------------
  // Phase 107-05 — D-05/D-06/D-07 skip race fix regression suite.
  // ---------------------------------------------------------------------------

  test("handleSkipAddress advances synchronously without setTimeout", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    act(() => {
      result.current.handleSkipAddress()
    })

    // No waitFor needed for timing — the advance is synchronous now. The
    // assertion runs in the same React batch as the skip.
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    expect(useCanvassingStore.getState().skippedEntries).toEqual(["entry-a"])
  })

  test("double-tap Skip is guarded by isPending and only advances once", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    act(() => {
      result.current.handleSkipAddress()
    })

    // Simulate the skip mutation now in flight on the second tap.
    skipMutationState.isPending = true

    act(() => {
      result.current.handleSkipAddress()
    })

    // Index should have advanced exactly ONCE despite two taps.
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    // mutate should have been called exactly once (only the first tap fired
    // a mutation; the second tap was a no-op).
    expect(skipMutate).toHaveBeenCalledTimes(1)
    expect(skipMutate).toHaveBeenCalledWith("entry-a", expect.any(Object))
  })

  test("skip fires sonner info toast with Undo action", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    act(() => {
      result.current.handleSkipAddress()
    })

    expect(toastInfo).toHaveBeenCalledWith(
      "Skipped — Undo",
      expect.objectContaining({
        id: "skip-undo",
        duration: 4000,
        action: expect.objectContaining({
          label: "Undo",
          onClick: expect.any(Function),
        }),
      }),
    )
  })

  test("Undo toast action restores skipped entries to pending if no outcome recorded since", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    act(() => {
      result.current.handleSkipAddress()
    })

    // Sanity: skipped + advanced
    expect(useCanvassingStore.getState().skippedEntries).toEqual(["entry-a"])
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)

    // Capture the Undo onClick from the toast call args.
    const toastCall = toastInfo.mock.calls[0]
    const action = toastCall[1].action as { onClick: () => void }

    act(() => {
      action.onClick()
    })

    // Skip should be reversed and the index restored.
    expect(useCanvassingStore.getState().skippedEntries).toEqual([])
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(0)
  })

  test("Undo after another outcome was recorded shows 'Can't undo' toast and is a no-op", async () => {
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    act(() => {
      result.current.handleSkipAddress()
    })

    // Simulate that another outcome got recorded since the skip.
    act(() => {
      useCanvassingStore.getState().recordOutcome("entry-b", "not_home")
    })

    const toastCall = toastInfo.mock.calls[0]
    const action = toastCall[1].action as { onClick: () => void }

    act(() => {
      action.onClick()
    })

    // The skipped entry should remain skipped — Undo bailed out.
    expect(useCanvassingStore.getState().skippedEntries).toEqual(["entry-a"])
    // A "Can't undo — already moved on" warning should have fired via the
    // base toast() function.
    expect(toastBase).toHaveBeenCalledWith(
      "Can't undo — already moved on",
      expect.objectContaining({ id: "skip-undo-unavailable", duration: 3000 }),
    )
  })

  test("skip mutation failure surfaces error toast and keeps local skip", async () => {
    // Make skipMutate invoke its onError option immediately.
    skipMutate.mockImplementation((_id: string, options?: { onError?: () => void }) => {
      options?.onError?.()
    })

    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    act(() => {
      result.current.handleSkipAddress()
    })

    // Local skip should still be in place per D-05 (skip is reversible; we
    // don't roll back on server failure).
    expect(useCanvassingStore.getState().skippedEntries).toEqual(["entry-a"])
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    // Error toast fired.
    expect(toastError).toHaveBeenCalledWith(
      "Skip didn't sync — still saved on this device",
      expect.objectContaining({ id: "skip-sync-error" }),
    )
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

  // ---------------------------------------------------------------------------
  // Phase 108-02 — SELECT-01 D-01/D-02 handleJumpToAddress pin-clear + haptic.
  // ---------------------------------------------------------------------------

  test("handleJumpToAddress advances currentAddressIndex and fires haptic", async () => {
    entriesData.value = multiVoterEntries
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.households.length).toBeGreaterThanOrEqual(2)
      expect(result.current.currentHousehold?.householdKey).toBe("house-multi")
    })

    // Baseline: index is 0 and vibrate has not been called yet for a jump.
    ;(navigator.vibrate as ReturnType<typeof vi.fn>).mockClear()

    act(() => {
      result.current.handleJumpToAddress(1)
    })

    // Hook-state assertion: the store advanced to the tapped index. The
    // visible render-path pin-clear assertion lives in HouseholdCard.test.tsx
    // because pinnedHouseholdKey is intentionally not exposed on the hook
    // result (removed in Plan 107-04) — Task 3 owns the DOM-level guarantee.
    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
    expect(navigator.vibrate).toHaveBeenCalledWith(50)
  })

  test("handleJumpToAddress silently skips vibrate when not supported", async () => {
    delete (navigator as Navigator & { vibrate?: unknown }).vibrate
    entriesData.value = multiVoterEntries
    const { result } = renderHook(() => useCanvassingWizard("camp-1", "walk-1"))

    await waitFor(() => {
      expect(result.current.households.length).toBeGreaterThanOrEqual(2)
    })

    expect(() => {
      act(() => {
        result.current.handleJumpToAddress(1)
      })
    }).not.toThrow()

    expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
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

