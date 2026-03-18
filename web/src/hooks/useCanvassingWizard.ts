import { useMemo, useCallback, useEffect, useRef } from "react"
import { useCanvassingStore } from "@/stores/canvassingStore"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import {
  useEnrichedEntries,
  useDoorKnockMutation,
  useSkipEntryMutation,
} from "@/hooks/useCanvassing"
import {
  groupByHousehold,
  SURVEY_TRIGGER_OUTCOMES,
  AUTO_ADVANCE_OUTCOMES,
} from "@/types/canvassing"
import type {
  DoorKnockResultCode,
  EnrichedWalkListEntry,
} from "@/types/canvassing"
import { toast } from "sonner"

interface OutcomeResult {
  bulkPrompt?: boolean
  surveyTrigger?: boolean
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
    setWalkList,
    advanceAddress,
    jumpToAddress,
    skipEntry,
    touch,
  } = useCanvassingStore()

  // Initialize store when walkListId changes
  useEffect(() => {
    if (walkListId && walkListId !== storeWalkListId) {
      setWalkList(walkListId)
    }
  }, [walkListId, storeWalkListId, setWalkList])

  // Touch every 60 seconds for stale detection
  useEffect(() => {
    const interval = setInterval(() => touch(), 60_000)
    return () => clearInterval(interval)
  }, [touch])

  // Derived state
  const households = useMemo(
    () => groupByHousehold(entriesQuery.data ?? []),
    [entriesQuery.data],
  )

  const currentHousehold = useMemo(
    () => households[currentAddressIndex] ?? null,
    [households, currentAddressIndex],
  )

  const totalAddresses = households.length

  const completedAddresses = useMemo(() => {
    return households.filter((h) =>
      h.entries.every(
        (e) => completedEntries[e.id] !== undefined || skippedEntries.includes(e.id),
      ),
    ).length
  }, [households, completedEntries, skippedEntries])

  const isComplete = currentAddressIndex >= totalAddresses && totalAddresses > 0

  const activeEntryId = useMemo(() => {
    if (!currentHousehold) return null
    const active = currentHousehold.entries.find(
      (e) => completedEntries[e.id] === undefined && !skippedEntries.includes(e.id),
    )
    return active?.id ?? null
  }, [currentHousehold, completedEntries, skippedEntries])

  // Ref to track advanceAddress for use in timeouts
  const advanceRef = useRef(advanceAddress)
  advanceRef.current = advanceAddress

  const handleOutcome = useCallback(
    (entryId: string, voterId: string, result: DoorKnockResultCode): OutcomeResult => {
      const payload = {
        walk_list_entry_id: entryId,
        voter_id: voterId,
        result_code: result,
      }
      doorKnockMutation.mutate(payload, {
        onError: (err) => {
          // Network error: queue for offline sync instead of reverting
          if (err instanceof TypeError) {
            useOfflineQueueStore.getState().push({
              type: "door_knock",
              payload,
              campaignId,
              resourceId: walkListId,
            })
            // Do NOT revert optimistic update -- it stays in canvassingStore
          } else {
            // Server error: revert as before
            useCanvassingStore.getState().revertOutcome(entryId)
            toast.error("Failed to save outcome. Please try again.")
          }
        },
      })

      // Check for bulk Not Home prompt at multi-voter household
      if (result === "not_home" && currentHousehold && currentHousehold.entries.length > 1) {
        const alreadyCompleted = currentHousehold.entries.filter(
          (e) => completedEntries[e.id] !== undefined,
        )
        // First outcome at this address (none completed yet before this one)
        if (alreadyCompleted.length === 0) {
          return { bulkPrompt: true }
        }
      }

      if (AUTO_ADVANCE_OUTCOMES.has(result)) {
        // After 300ms delay, check if address is complete and auto-advance
        setTimeout(() => {
          // Re-read current state from store
          const state = useCanvassingStore.getState()
          const hh = currentHousehold
          if (hh) {
            const allDone = hh.entries.every(
              (e) =>
                state.completedEntries[e.id] !== undefined ||
                state.skippedEntries.includes(e.id),
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
        (e) =>
          state.completedEntries[e.id] !== undefined ||
          state.skippedEntries.includes(e.id),
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
    // Data
    households,
    currentHousehold,
    currentAddressIndex,
    totalAddresses,
    completedAddresses,
    activeEntryId,
    completedEntries,
    skippedEntries,
    isComplete,
    isLoading: entriesQuery.isLoading,
    isError: entriesQuery.isError,

    // Actions
    handleOutcome,
    handlePostSurveyAdvance,
    handleSkipAddress,
    handleBulkNotHome,
    handleJumpToAddress,
  }
}
