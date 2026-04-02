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
import { toast } from "sonner"

interface OutcomeResult {
  bulkPrompt?: boolean
  surveyTrigger?: boolean
}

function getPinnedCurrentHousehold(
  sequenceHouseholds: Household[],
  currentAddressIndex: number,
): Household | null {
  if (sequenceHouseholds.length === 0) return null
  return sequenceHouseholds[currentAddressIndex] ?? sequenceHouseholds[sequenceHouseholds.length - 1]
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

  const handleOutcome = useCallback(
    (entryId: string, voterId: string, result: DoorKnockResultCode): OutcomeResult => {
      const payload = {
        walk_list_entry_id: entryId,
        voter_id: voterId,
        result_code: result,
      }
      doorKnockMutation.mutate(payload, {
        onError: (err) => {
          if (err instanceof TypeError) {
            useOfflineQueueStore.getState().push({
              type: "door_knock",
              payload,
              campaignId,
              resourceId: walkListId,
            })
          } else {
            useCanvassingStore.getState().revertOutcome(entryId)
            toast.error("Failed to save outcome. Please try again.")
          }
        },
      })

      if (result === "not_home" && currentHousehold && currentHousehold.entries.length > 1) {
        const alreadyCompleted = currentHousehold.entries.filter(
          (entry) => completedEntries[entry.id] !== undefined,
        )
        if (alreadyCompleted.length === 0) {
          return { bulkPrompt: true }
        }
      }

      if (AUTO_ADVANCE_OUTCOMES.has(result)) {
        setTimeout(() => {
          const state = useCanvassingStore.getState()
          const household = currentHousehold
          if (household) {
            const allDone = household.entries.every(
              (entry) =>
                state.completedEntries[entry.id] !== undefined ||
                state.skippedEntries.includes(entry.id),
            )
            if (allDone) {
              advanceRef.current()
            }
          }
        }, 300)
        return {}
      }

      if (SURVEY_TRIGGER_OUTCOMES.has(result)) {
        return { surveyTrigger: true }
      }

      return {}
    },
    [doorKnockMutation, currentHousehold, completedEntries, campaignId, walkListId],
  )

  const handlePostSurveyAdvance = useCallback(() => {
    if (currentHousehold) {
      const state = useCanvassingStore.getState()
      const allDone = currentHousehold.entries.every(
        (entry) =>
          state.completedEntries[entry.id] !== undefined ||
          state.skippedEntries.includes(entry.id),
      )
      if (allDone) {
        advanceAddress()
      }
    }
  }, [currentHousehold, advanceAddress])

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
    (entries: EnrichedWalkListEntry[]) => {
      for (const entry of entries) {
        const payload = {
          walk_list_entry_id: entry.id,
          voter_id: entry.voter_id,
          result_code: "not_home",
        }
        doorKnockMutation.mutate(payload, {
          onError: (err) => {
            if (err instanceof TypeError) {
              useOfflineQueueStore.getState().push({
                type: "door_knock",
                payload,
                campaignId,
                resourceId: walkListId,
              })
            } else {
              useCanvassingStore.getState().revertOutcome(entry.id)
              toast.error("Failed to save outcome. Please try again.")
            }
          },
        })
      }
      setTimeout(() => advanceRef.current(), 500)
    },
    [doorKnockMutation, campaignId, walkListId],
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
    handleOutcome,
    handlePostSurveyAdvance,
    handleSkipAddress,
    handleBulkNotHome,
    handleJumpToAddress,
  }
}
