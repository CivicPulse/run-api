import { useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
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

function getPinnedCurrentHousehold(
  sequenceHouseholds: Household[],
  currentAddressIndex: number,
): Household | null {
  if (sequenceHouseholds.length === 0) return null
  return sequenceHouseholds[currentAddressIndex] ?? sequenceHouseholds[sequenceHouseholds.length - 1]
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
    advanceAddress,
    jumpToAddress,
    skipEntry,
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

  const pinnedCurrentHousehold = useMemo(
    () => getPinnedCurrentHousehold(sequenceHouseholds, currentAddressIndex),
    [sequenceHouseholds, currentAddressIndex],
  )

  const households = useMemo(() => {
    const orderedHouseholds = sortMode === "distance"
      ? orderHouseholdsByDistance(sequenceHouseholds, locationSnapshot)
      : orderHouseholdsBySequence(sequenceHouseholds)

    if (!pinnedCurrentHousehold) return orderedHouseholds

    const pinnedIndex = orderedHouseholds.findIndex(
      (household) => household.householdKey === pinnedCurrentHousehold.householdKey,
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
    pinnedCurrentHousehold,
    sequenceHouseholds,
    sortMode,
  ])

  useLayoutEffect(() => {
    if (currentAddressIndex >= households.length && households.length > 0) {
      jumpToAddress(households.length - 1)
    }
  }, [currentAddressIndex, households.length, jumpToAddress])

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
      advanceRef.current()
    }
  }, [])

  const submitDoorKnock = useCallback(async (
    payload: DoorKnockCreate,
    options?: {
      household?: Household | null
      advanceOnSuccess?: boolean
      showErrorToast?: boolean
      errorMessage?: string
      onError?: (error: unknown) => void
    },
  ) => {
    try {
      await doorKnockMutation.mutateAsync(payload)
      if (options?.advanceOnSuccess) {
        maybeAdvanceAfterHouseholdSettled(options.household)
      }
      return true
    } catch (err) {
      if (err instanceof TypeError) {
        queueDoorKnockOffline(payload)
        if (options?.advanceOnSuccess) {
          maybeAdvanceAfterHouseholdSettled(options.household)
        }
        return true
      }

      options?.onError?.(err)

      if (options?.showErrorToast !== false) {
        toast.error(options?.errorMessage ?? "Failed to save outcome. Please try again.")
      }
      return false
    }
  }, [doorKnockMutation, maybeAdvanceAfterHouseholdSettled, queueDoorKnockOffline])

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

  const handleSkipAddress = useCallback(() => {
    if (!currentHousehold) return
    for (const entry of currentHousehold.entries) {
      if (completedEntries[entry.id] === undefined && !skippedEntries.includes(entry.id)) {
        skipEntry(entry.id)
        skipEntryMutation.mutate(entry.id)
      }
    }
    setTimeout(() => advanceRef.current(), 300)
  }, [currentHousehold, completedEntries, skippedEntries, skipEntry, skipEntryMutation])

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

  const handleJumpToAddress = useCallback(
    (index: number) => {
      jumpToAddress(index)
    },
    [jumpToAddress],
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
    handleOutcome,
    handleSubmitContact,
    handlePostSurveyAdvance,
    handleSkipAddress,
    handleBulkNotHome,
    handleJumpToAddress,
  }
}
