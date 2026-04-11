import { useMemo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useCanvassingStore } from "@/stores/canvassingStore"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import {
  useEnrichedEntries,
  useDoorKnockMutation,
  useSkipEntryMutation,
} from "@/hooks/useCanvassing"
import {
  groupByHousehold,
  orderHouseholdsByDistance,
  orderHouseholdsBySequence,
  SURVEY_TRIGGER_OUTCOMES,
  AUTO_ADVANCE_OUTCOMES,
  HOUSE_LEVEL_OUTCOMES,
} from "@/types/canvassing"
import type {
  DoorKnockResultCode,
  EnrichedWalkListEntry,
  Household,
} from "@/types/canvassing"
import type { DoorKnockCreate } from "@/types/walk-list"
import { toast } from "sonner"

interface OutcomeResult {
  bulkPrompt?: boolean
  surveyTrigger?: boolean
}

export interface FieldFailureState {
  title: string
  detail: string
  actionLabel: string
}

interface ContactDraftSubmit {
  entryId: string
  voterId: string
  result: Extract<DoorKnockResultCode, "supporter" | "undecided" | "opposed" | "refused">
  notes: string
  surveyResponses: Array<{ question_id: string; answer_value: string }>
  surveyComplete: boolean
}

function toVolunteerSafeMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const detail = error.message.trim()
    if (detail.length > 0) {
      return detail
    }
  }

  return fallback
}

// Phase 107 D-03 + UI-SPEC §Toast Contract / §Haptic Contract.
// Triple-channel feedback: toast + vibrate. Focus + ARIA live live in the
// route component since they need DOM refs. Called immediately before any
// auto-advance fires so the volunteer gets confirmation across three
// independent channels (visual text + visual layout + tactile).
function announceAutoAdvance(): void {
  toast.success("Recorded — next house", {
    id: "auto-advance",
    duration: 2000,
  })
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(50)
    } catch {
      // Silent no-op on platforms where vibrate exists but throws.
    }
  }
}

export function useCanvassingWizard(campaignId: string, walkListId: string) {
  const entriesQuery = useEnrichedEntries(campaignId, walkListId)
  const doorKnockMutation = useDoorKnockMutation(campaignId, walkListId)
  const skipEntryMutation = useSkipEntryMutation(campaignId, walkListId)

  const {
    walkListId: storeWalkListId,
    currentAddressIndex,
    completedEntries,
    skippedEntries,
    sortMode,
    locationSnapshot,
    locationStatus,
    setWalkList,
    advanceAddress: storeAdvanceAddress,
    jumpToAddress: storeJumpToAddress,
    skipEntry: storeSkipEntry,
    unskipEntry,
    touch,
  } = useCanvassingStore()

  useEffect(() => {
    if (walkListId && walkListId !== storeWalkListId) {
      setWalkList(walkListId)
    }
  }, [walkListId, storeWalkListId, setWalkList])

  useEffect(() => {
    const interval = setInterval(() => touch(), 60_000)
    return () => clearInterval(interval)
  }, [touch])

  const sequenceHouseholds = useMemo(
    () => groupByHousehold(entriesQuery.data ?? []),
    [entriesQuery.data],
  )

  // Track the household key the user is actually viewing so pinning stabilises
  // the *displayed* door rather than always falling back to the sequence-order
  // household at currentAddressIndex (which would force 1521 1st Ave back to
  // index 0 even in distance mode). Stored as state so the `households` memo
  // can read it safely during render.
  const [pinnedHouseholdKey, setPinnedHouseholdKey] = useState<string | null>(null)
  const [trackedSortMode, setTrackedSortMode] = useState(sortMode)

  // Phase 107-08.1: release the viewing pin on intentional advance / skip so
  // the rendered HouseholdCard actually swaps to the next household. The pin
  // exists to keep the user's current door stable while distance-mode GPS
  // updates re-order the underlying list — it must NOT outlive an explicit
  // navigation away from that door. See `.planning/todos/completed/107-canvassing-pinning-uxgap.md`
  // for the full root-cause walk-through.
  const advanceAddress = useCallback(() => {
    setPinnedHouseholdKey(null)
    storeAdvanceAddress()
  }, [storeAdvanceAddress])

  const skipEntry = useCallback(
    (entryId: string) => {
      setPinnedHouseholdKey(null)
      storeSkipEntry(entryId)
    },
    [storeSkipEntry],
  )

  // Detect a sort mode change during render. Updating state here follows the
  // "storing information from previous renders" React pattern and skips
  // pinning for the render immediately following the change.
  const sortModeJustChanged = trackedSortMode !== sortMode
  if (sortModeJustChanged) {
    setTrackedSortMode(sortMode)
    setPinnedHouseholdKey(null)
  }

  const households = useMemo(() => {
    const orderedHouseholds = sortMode === "distance"
      ? orderHouseholdsByDistance(sequenceHouseholds, locationSnapshot)
      : orderHouseholdsBySequence(sequenceHouseholds)

    // When the sort mode just changed, skip pinning so the new ordering takes
    // full effect.
    if (sortModeJustChanged) {
      return orderedHouseholds
    }

    if (!pinnedHouseholdKey) return orderedHouseholds

    const pinnedIndex = orderedHouseholds.findIndex(
      (household) => household.householdKey === pinnedHouseholdKey,
    )
    if (pinnedIndex < 0 || pinnedIndex === currentAddressIndex) {
      return orderedHouseholds
    }

    const reorderedHouseholds = [...orderedHouseholds]
    const [activeHousehold] = reorderedHouseholds.splice(pinnedIndex, 1)
    reorderedHouseholds.splice(
      Math.min(currentAddressIndex, reorderedHouseholds.length),
      0,
      activeHousehold,
    )
    return reorderedHouseholds
  }, [
    currentAddressIndex,
    locationSnapshot,
    sequenceHouseholds,
    sortMode,
    sortModeJustChanged,
    pinnedHouseholdKey,
  ])

  // After the memo has computed, record which household the user is viewing
  // during render so subsequent location updates pin *that* door. Using the
  // "update state during render" pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // avoids cascading renders from setState-in-effect.
  if (!sortModeJustChanged) {
    const viewing = households[currentAddressIndex]
    const nextPin = viewing ? viewing.householdKey : null
    if (nextPin !== null && nextPin !== pinnedHouseholdKey) {
      setPinnedHouseholdKey(nextPin)
    }
  }

  // Sync index after the memo has computed. On sort mode change: jump to
  // index 0. Otherwise clamp the active index to the household list length.
  useLayoutEffect(() => {
    if (sortModeJustChanged) {
      if (households.length > 0) {
        storeJumpToAddress(0)
      }
      return
    }
    if (currentAddressIndex >= households.length && households.length > 0) {
      storeJumpToAddress(households.length - 1)
    }
  }, [currentAddressIndex, households, storeJumpToAddress, sortModeJustChanged])

  const currentHousehold = useMemo(
    () => households[currentAddressIndex] ?? null,
    [households, currentAddressIndex],
  )

  const totalAddresses = households.length

  const completedAddresses = useMemo(() => {
    return households.filter((household) =>
      household.entries.every(
        (entry) =>
          completedEntries[entry.id] !== undefined || skippedEntries.includes(entry.id),
      ),
    ).length
  }, [households, completedEntries, skippedEntries])

  const isComplete = currentAddressIndex >= totalAddresses && totalAddresses > 0

  const activeEntryId = useMemo(() => {
    if (!currentHousehold) return null
    const active = currentHousehold.entries.find(
      (entry) =>
        completedEntries[entry.id] === undefined && !skippedEntries.includes(entry.id),
    )
    return active?.id ?? null
  }, [currentHousehold, completedEntries, skippedEntries])

  const advanceRef = useRef(advanceAddress)
  useLayoutEffect(() => {
    advanceRef.current = advanceAddress
  }, [advanceAddress])

  const currentHouseholdRef = useRef(currentHousehold)
  useLayoutEffect(() => {
    currentHouseholdRef.current = currentHousehold
  }, [currentHousehold])

  const queueDoorKnockOffline = useCallback((payload: DoorKnockCreate) => {
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload,
      campaignId,
      resourceId: walkListId,
    })
    useCanvassingStore.getState().recordOutcome(payload.walk_list_entry_id, payload.result_code)
  }, [campaignId, walkListId])

  const lastDoorKnockPayloadRef = useRef<DoorKnockCreate | null>(null)

  const maybeAdvanceAfterHouseholdSettled = useCallback((household?: Household | null) => {
    const targetHousehold = household ?? currentHouseholdRef.current
    if (!targetHousehold) return

    const state = useCanvassingStore.getState()
    const allDone = targetHousehold.entries.every(
      (entry) =>
        state.completedEntries[entry.id] !== undefined ||
        state.skippedEntries.includes(entry.id),
    )
    if (allDone) {
      announceAutoAdvance()
      advanceRef.current()
    }
  }, [])

  // Phase 107 D-18: house-level outcomes (`not_home`, `come_back_later`,
  // `inaccessible`) bypass the per-voter settled gate and advance the wizard
  // immediately — the outcome describes the WHOLE household, so the volunteer
  // should not be stuck iterating through every voter at the address. Voter-
  // level outcomes (`moved`, `deceased`, `refused`) fall through to the legacy
  // settled-household helper.
  const advanceAfterOutcome = useCallback(
    (result: DoorKnockResultCode, household?: Household | null) => {
      if (HOUSE_LEVEL_OUTCOMES.has(result)) {
        announceAutoAdvance()
        advanceRef.current()
        return
      }
      maybeAdvanceAfterHouseholdSettled(household)
    },
    [maybeAdvanceAfterHouseholdSettled],
  )

  const submitDoorKnock = useCallback(async (
    payload: DoorKnockCreate,
    options?: {
      household?: Household | null
      advanceOnSuccess?: boolean
      advanceResult?: DoorKnockResultCode
      showErrorToast?: boolean
      errorMessage?: string
      useRetryToast?: boolean
      onError?: (error: unknown) => void
    },
  ) => {
    lastDoorKnockPayloadRef.current = payload
    try {
      await doorKnockMutation.mutateAsync(payload)
      if (options?.advanceOnSuccess) {
        if (options.advanceResult) {
          advanceAfterOutcome(options.advanceResult, options.household)
        } else {
          maybeAdvanceAfterHouseholdSettled(options.household)
        }
      }
      return true
    } catch (err) {
      if (err instanceof TypeError) {
        queueDoorKnockOffline(payload)
        if (options?.advanceOnSuccess) {
          if (options.advanceResult) {
            advanceAfterOutcome(options.advanceResult, options.household)
          } else {
            maybeAdvanceAfterHouseholdSettled(options.household)
          }
        }
        return true
      }

      options?.onError?.(err)

      if (options?.showErrorToast !== false) {
        if (options?.useRetryToast) {
          // Phase 107 D-04 + UI-SPEC §Toast Contract "Error — save failed".
          // Persistent toast with Retry action; the card stays on the failing
          // house and the volunteer never loses context.
          toast.error("Couldn't save — tap to retry", {
            id: "auto-advance-error",
            duration: Number.POSITIVE_INFINITY,
            action: {
              label: "Retry",
              onClick: () => {
                const retryPayload = lastDoorKnockPayloadRef.current
                if (retryPayload) {
                  void submitDoorKnockRef.current?.(retryPayload, options)
                }
              },
            },
          })
        } else {
          toast.error(options?.errorMessage ?? "Failed to save outcome. Please try again.")
        }
      }
      return false
    }
  }, [advanceAfterOutcome, doorKnockMutation, maybeAdvanceAfterHouseholdSettled, queueDoorKnockOffline])

  // Forward ref for the retry callback closure (avoids "used before declared")
  const submitDoorKnockRef = useRef<typeof submitDoorKnock | null>(null)
  useLayoutEffect(() => {
    submitDoorKnockRef.current = submitDoorKnock
  }, [submitDoorKnock])

  const handleOutcome = useCallback(
    async (entryId: string, voterId: string, result: DoorKnockResultCode): Promise<OutcomeResult> => {
      if (SURVEY_TRIGGER_OUTCOMES.has(result)) {
        return { surveyTrigger: true }
      }

      const payload = {
        walk_list_entry_id: entryId,
        voter_id: voterId,
        result_code: result,
      }

      const saved = await submitDoorKnock(payload, {
        household: currentHousehold,
        advanceOnSuccess: AUTO_ADVANCE_OUTCOMES.has(result),
        advanceResult: result,
        useRetryToast: true,
      })
      if (!saved) return {}

      if (result === "not_home" && currentHousehold && currentHousehold.entries.length > 1) {
        const state = useCanvassingStore.getState()
        const alreadyHandledElsewhere = currentHousehold.entries.filter(
          (entry) =>
            entry.id !== entryId &&
            (state.completedEntries[entry.id] !== undefined || state.skippedEntries.includes(entry.id)),
        )
        if (alreadyHandledElsewhere.length === 0) {
          return { bulkPrompt: true }
        }
      }

      return {}
    },
    [currentHousehold, submitDoorKnock],
  )

  const handleSubmitContact = useCallback(async ({
    entryId,
    voterId,
    result,
    notes,
    surveyResponses,
    surveyComplete,
  }: ContactDraftSubmit) => {
    const payload: DoorKnockCreate = {
      walk_list_entry_id: entryId,
      voter_id: voterId,
      result_code: result,
      notes,
      survey_responses: surveyResponses.map((response) => ({
        ...response,
        voter_id: voterId,
      })),
      survey_complete: surveyComplete,
    }

    let failure: FieldFailureState | null = null
    const saved = await submitDoorKnock(payload, {
      household: currentHousehold,
      advanceOnSuccess: false,
      showErrorToast: false,
      errorMessage: "Failed to save this contact. Please retry before moving on.",
      onError: (error) => {
        failure = {
          title: "Couldn’t save this door knock yet",
          detail: toVolunteerSafeMessage(
            error,
            "Your notes and survey answers are still here. Retry this save or head back to the hub if the problem keeps happening.",
          ),
          actionLabel: "Retry save",
        }
      },
    })

    // Deep per-voter contact submits (supporter/undecided/opposed/refused with
    // survey + notes) advance the wizard unconditionally: the volunteer has
    // completed a deliberate interaction and should move forward. Any remaining
    // residents at this address can be revisited via All Doors. This diverges
    // intentionally from handleOutcome (simple outcomes like not_home), which
    // waits for every resident to settle before advancing.
    if (saved) {
      announceAutoAdvance()
      advanceRef.current()
    }

    return {
      saved,
      failure,
    }
  }, [currentHousehold, submitDoorKnock])

  const handlePostSurveyAdvance = useCallback(() => {
    maybeAdvanceAfterHouseholdSettled(currentHousehold)
  }, [currentHousehold, maybeAdvanceAfterHouseholdSettled])

  // Phase 107 D-05/D-06/D-07 + RESEARCH.md §2 option (c):
  // Synchronous local skip → immediate advance → mutation in background.
  // The 300ms setTimeout that used to live here was hiding a race between
  // local Zustand state, the skip mutation's invalidate/refetch, and the
  // households memo's pinning logic. Replacing the timeout with an
  // `isPending` guard closes the double-tap race AND removes the
  // wall-clock dependency entirely.
  const handleSkipAddress = useCallback(() => {
    if (!currentHousehold) return
    if (skipEntryMutation.isPending) return // anti-double-tap guard

    // Snapshot entries to skip BEFORE store mutations so the Undo closure
    // can reference the exact set we just skipped, regardless of any
    // subsequent store changes.
    const entriesToSkip = currentHousehold.entries
      .filter(
        (entry) =>
          completedEntries[entry.id] === undefined &&
          !skippedEntries.includes(entry.id),
      )
      .map((entry) => entry.id)

    if (entriesToSkip.length === 0) {
      // Nothing to skip; just advance.
      advanceRef.current()
      return
    }

    // Snapshot current index + completed count so the Undo can decide
    // whether it's still valid (D-06: undo only if no other outcome was
    // recorded since the skip).
    const skipAtAddressIndex = useCanvassingStore.getState().currentAddressIndex
    const skipAtCompletedCount = Object.keys(
      useCanvassingStore.getState().completedEntries,
    ).length

    // (1) Local store update — synchronous.
    for (const id of entriesToSkip) {
      skipEntry(id)
    }

    // (2) Advance immediately — no setTimeout.
    advanceRef.current()

    // (3) Info toast with Undo action (D-06 + UI-SPEC §Toast Contract).
    toast.info("Skipped — Undo", {
      id: "skip-undo",
      duration: 4000,
      action: {
        label: "Undo",
        onClick: () => {
          const state = useCanvassingStore.getState()
          const completedSince =
            Object.keys(state.completedEntries).length > skipAtCompletedCount
          if (completedSince) {
            toast("Can't undo — already moved on", {
              id: "skip-undo-unavailable",
              duration: 3000,
            })
            return
          }
          for (const id of entriesToSkip) {
            unskipEntry(id)
          }
          useCanvassingStore.setState({ currentAddressIndex: skipAtAddressIndex })
        },
      },
    })

    // (4) Fire mutations in background; on error surface a toast but DO
    //     NOT roll back the local skip — D-05 says skip is reversible and
    //     the volunteer can re-activate from the household list.
    for (const id of entriesToSkip) {
      skipEntryMutation.mutate(id, {
        onError: () => {
          toast.error("Skip didn't sync — still saved on this device", {
            id: "skip-sync-error",
          })
        },
      })
    }
  }, [
    currentHousehold,
    completedEntries,
    skippedEntries,
    skipEntry,
    unskipEntry,
    skipEntryMutation,
  ])

  const handleBulkNotHome = useCallback(
    async (entries: EnrichedWalkListEntry[]) => {
      const household = currentHousehold
      if (!household) return false

      let allSaved = true
      for (const entry of entries) {
        const saved = await submitDoorKnock({
          walk_list_entry_id: entry.id,
          voter_id: entry.voter_id,
          result_code: "not_home",
        }, {
          household,
          showErrorToast: false,
        })

        if (!saved) {
          allSaved = false
          break
        }
      }

      if (!allSaved) {
        toast.error("Failed to save not-home results for this address. Please retry.")
        return false
      }

      maybeAdvanceAfterHouseholdSettled(household)
      return true
    },
    [currentHousehold, maybeAdvanceAfterHouseholdSettled, submitDoorKnock],
  )

  // Phase 108 D-01/D-02/D-07: list-tap (and Plan 108-03 map-tap) funnel through
  // this wrapped action. Clearing the pin BEFORE delegating to the store
  // mirrors the 107-08.1 advance/skip pattern so the rendered HouseholdCard
  // actually swaps. Haptic lives in the hook so both entry points fire exactly
  // once per intentional navigation. Per D-02: NO toast on tap-to-activate —
  // the user's own tap IS the feedback.
  const handleJumpToAddress = useCallback(
    (index: number) => {
      setPinnedHouseholdKey(null)
      storeJumpToAddress(index)
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(50)
        } catch {
          // Silent no-op (iOS Safari, desktop, permission-denied).
        }
      }
    },
    [storeJumpToAddress],
  )

  return {
    households,
    currentHousehold,
    currentAddressIndex,
    totalAddresses,
    completedAddresses,
    activeEntryId,
    completedEntries,
    skippedEntries,
    sortMode,
    locationSnapshot,
    locationStatus,
    isComplete,
    isLoading: entriesQuery.isLoading,
    isError: entriesQuery.isError,
    isSavingDoorKnock: doorKnockMutation.isPending,
    isSkipPending: skipEntryMutation.isPending,
    handleOutcome,
    handleSubmitContact,
    handlePostSurveyAdvance,
    handleSkipAddress,
    handleBulkNotHome,
    handleJumpToAddress,
  }
}
