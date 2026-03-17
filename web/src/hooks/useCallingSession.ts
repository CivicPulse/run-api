import { useCallback, useEffect, useRef, useMemo } from "react"
import { useCallingStore } from "@/stores/callingStore"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import {
  useCheckIn,
  useCheckOut,
  useRecordCall,
  useSelfReleaseEntry,
  usePhoneBankSession,
} from "@/hooks/usePhoneBankSessions"
import { useCallList } from "@/hooks/useCallLists"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/api/client"
import { CALL_SURVEY_TRIGGER } from "@/types/calling"
import type { SessionStats, CallingEntry } from "@/types/calling"
import type { CallListEntry } from "@/types/call-list"

const BATCH_SIZE = 5
const PREFETCH_THRESHOLD = 2

function toCallingEntry(e: CallListEntry): CallingEntry {
  return {
    id: e.id,
    voter_id: e.voter_id,
    voter_name: e.voter_name,
    phone_numbers: e.phone_numbers,
    phone_attempts: e.phone_attempts,
    attempt_count: e.attempt_count,
    priority_score: e.priority_score,
  }
}

interface OutcomeResult {
  surveyTrigger: boolean
}

export function useCallingSession(campaignId: string, sessionId: string) {
  const sessionQuery = usePhoneBankSession(campaignId, sessionId)
  const callListId = sessionQuery.data?.call_list_id ?? ""

  // Call list detail for script_id
  const { data: callListDetail } = useCallList(campaignId, callListId)
  const scriptId = callListDetail?.script_id ?? null

  const checkIn = useCheckIn(campaignId, sessionId)
  const checkOut = useCheckOut(campaignId, sessionId)
  const recordCall = useRecordCall(campaignId, sessionId)
  const selfRelease = useSelfReleaseEntry(campaignId, sessionId)

  // Batch claim mutation (overrides the default batch_size=1)
  const claimBatch = useMutation({
    mutationFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/call-lists/${callListId}/claim`, {
          json: { batch_size: BATCH_SIZE },
        })
        .json<CallListEntry[]>(),
  })

  const {
    sessionId: storeSessionId,
    entries,
    currentEntryIndex,
    completedCalls,
    skippedEntries: _skippedEntries,
    callStartedAt,
    phoneNumberUsed,
    startSession,
    addEntries,
    recordOutcome,
    skipEntry,
    advanceEntry,
    setCallStarted,
    reset,
    touch,
  } = useCallingStore()

  // Refs for guards
  const initRef = useRef(false)
  const prefetchRef = useRef(false)
  const noEntriesRef = useRef(false)
  const advanceRef = useRef(advanceEntry)
  advanceRef.current = advanceEntry

  // Touch every 60 seconds for stale detection
  useEffect(() => {
    const interval = setInterval(() => touch(), 60_000)
    return () => clearInterval(interval)
  }, [touch])

  // Initialization: check-in + claim first batch
  useEffect(() => {
    if (!sessionId || !callListId || initRef.current) return
    if (storeSessionId === sessionId) {
      // Already initialized from sessionStorage
      initRef.current = true
      return
    }

    initRef.current = true

    checkIn.mutate(undefined, {
      onSuccess: () => {
        api
          .post(
            `api/v1/campaigns/${campaignId}/call-lists/${callListId}/claim`,
            { json: { batch_size: BATCH_SIZE } },
          )
          .json<CallListEntry[]>()
          .then((claimed) => {
            if (claimed.length === 0) {
              noEntriesRef.current = true
              startSession(sessionId, callListId, [])
              return
            }
            startSession(sessionId, callListId, claimed.map(toCallingEntry))
          })
          .catch(() => {
            // Claim failed -- session started but no entries loaded
            startSession(sessionId, callListId, [])
          })
      },
      onError: () => {
        // Check-in failed -- may already be checked in; try claiming anyway
        api
          .post(
            `api/v1/campaigns/${campaignId}/call-lists/${callListId}/claim`,
            { json: { batch_size: BATCH_SIZE } },
          )
          .json<CallListEntry[]>()
          .then((claimed) => {
            if (claimed.length === 0) {
              noEntriesRef.current = true
              startSession(sessionId, callListId, [])
              return
            }
            startSession(sessionId, callListId, claimed.map(toCallingEntry))
          })
          .catch(() => {
            startSession(sessionId, callListId, [])
          })
      },
    })
  }, [sessionId, callListId, storeSessionId, campaignId, checkIn, startSession])

  // Derived state
  const currentEntry = useMemo(
    () => entries[currentEntryIndex] ?? null,
    [entries, currentEntryIndex],
  )

  const completedCount = useMemo(
    () => Object.keys(completedCalls).length,
    [completedCalls],
  )

  const remainingEntries = useMemo(
    () => entries.length - currentEntryIndex,
    [entries.length, currentEntryIndex],
  )

  const isComplete = currentEntryIndex >= entries.length && entries.length > 0

  const noEntriesAvailable =
    noEntriesRef.current && entries.length === 0

  const sessionStats: SessionStats = useMemo(() => {
    const values = Object.values(completedCalls)
    return {
      totalCalls: values.length,
      answered: values.filter((r) => r === "answered").length,
      noAnswer: values.filter((r) => r === "no_answer").length,
      voicemail: values.filter((r) => r === "voicemail").length,
      other: values.filter(
        (r) => r !== "answered" && r !== "no_answer" && r !== "voicemail",
      ).length,
    }
  }, [completedCalls])

  // Pre-fetch next batch when running low
  useEffect(() => {
    if (!callListId || remainingEntries > PREFETCH_THRESHOLD || prefetchRef.current) return
    if (isComplete) return

    prefetchRef.current = true
    claimBatch.mutate(undefined, {
      onSuccess: (claimed) => {
        prefetchRef.current = false
        if (claimed.length > 0) {
          addEntries(claimed.map(toCallingEntry))
        }
      },
      onError: () => {
        prefetchRef.current = false
      },
    })
  }, [callListId, remainingEntries, isComplete, claimBatch, addEntries])

  const handleOutcome = useCallback(
    (resultCode: string): OutcomeResult => {
      if (!currentEntry) return { surveyTrigger: false }

      const entryId = currentEntry.id
      const now = new Date().toISOString()
      const startedAt = callStartedAt || now
      const phone = phoneNumberUsed || ""

      const callPayload = {
        call_list_entry_id: entryId,
        result_code: resultCode,
        phone_number_used: phone,
        call_started_at: startedAt,
        call_ended_at: now,
      }
      recordCall.mutate(callPayload, {
        onError: (err) => {
          if (err instanceof TypeError) {
            useOfflineQueueStore.getState().push({
              type: "call_record",
              payload: callPayload,
              campaignId,
              resourceId: sessionId,
            })
            // Optimistic UI stays via callingStore.recordOutcome() called below
          }
          // Server errors: no special handling; callingStore already recorded outcome optimistically
        },
      })

      recordOutcome(entryId, resultCode)

      if (resultCode === CALL_SURVEY_TRIGGER) {
        return { surveyTrigger: true }
      }

      // Auto-advance after brief delay
      setTimeout(() => advanceRef.current(), 300)
      return { surveyTrigger: false }
    },
    [currentEntry, callStartedAt, phoneNumberUsed, recordCall, recordOutcome, campaignId, sessionId],
  )

  const handlePostSurveyAdvance = useCallback(() => {
    advanceEntry()
  }, [advanceEntry])

  const handleSkip = useCallback(() => {
    if (!currentEntry) return
    selfRelease.mutate(currentEntry.id)
    skipEntry(currentEntry.id)
    setTimeout(() => advanceRef.current(), 300)
  }, [currentEntry, selfRelease, skipEntry])

  const handleEndSession = useCallback(() => {
    checkOut.mutate()
    reset()
  }, [checkOut, reset])

  const handleCallStarted = useCallback(
    (phone: string) => {
      setCallStarted(phone)
    },
    [setCallStarted],
  )

  return {
    currentEntry,
    completedCount,
    totalEntries: entries.length,
    isComplete,
    sessionStats,
    isLoading: sessionQuery.isLoading || (!storeSessionId && !noEntriesRef.current),
    isError: sessionQuery.isError,
    error: sessionQuery.error,
    scriptId,
    handleOutcome,
    handlePostSurveyAdvance,
    handleSkip,
    handleEndSession,
    handleCallStarted,
    noEntriesAvailable,
  }
}
