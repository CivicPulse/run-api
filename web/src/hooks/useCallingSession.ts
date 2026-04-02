import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { canResumeCallingSession, useCallingStore } from "@/stores/callingStore"
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
  const sessionDetailMalformed = Boolean(sessionId) && sessionQuery.isSuccess && !callListId

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
    skippedEntries,
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

  const canResumePersistedSession = canResumeCallingSession(
    {
      sessionId: storeSessionId,
      entries,
      currentEntryIndex,
      completedCalls,
      skippedEntries,
    },
    sessionId,
  )

  const activeEntries = canResumePersistedSession ? entries : []
  const activeCurrentEntryIndex = canResumePersistedSession ? currentEntryIndex : 0
  const activeCompletedCalls = canResumePersistedSession ? completedCalls : {}

  // Refs for guards
  const initRef = useRef(false)
  const prefetchRef = useRef(false)
  const noEntriesRef = useRef(false)
  const sessionRef = useRef<string | null>(null)
  const [noEntries, setNoEntries] = useState(false)
  const [claimError, setClaimError] = useState(false)
  const advanceRef = useRef(advanceEntry)
  useLayoutEffect(() => { advanceRef.current = advanceEntry })

  useEffect(() => {
    if (sessionRef.current === sessionId) return

    sessionRef.current = sessionId
    initRef.current = false
    prefetchRef.current = false
    noEntriesRef.current = false
    setNoEntries(false)
    setClaimError(false)
  }, [sessionId])

  // Touch every 60 seconds for stale detection
  useEffect(() => {
    const interval = setInterval(() => touch(), 60_000)
    return () => clearInterval(interval)
  }, [touch])

  // Reset malformed or mismatched persisted state once assignment authority is known.
  useEffect(() => {
    if (!storeSessionId) return
    if (!sessionId || sessionDetailMalformed || !canResumePersistedSession) {
      reset()
    }
  }, [storeSessionId, sessionId, sessionDetailMalformed, canResumePersistedSession, reset])

  // Initialization: check-in + claim first batch
  useEffect(() => {
    if (!sessionId || !callListId || initRef.current || sessionDetailMalformed) return
    if (canResumePersistedSession) {
      // Already initialized from a valid sessionStorage snapshot for this assignment.
      initRef.current = true
      return
    }

    initRef.current = true

    const doClaim = () =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/call-lists/${callListId}/claim`,
          { json: { batch_size: BATCH_SIZE } },
        )
        .json<CallListEntry[]>()
        .then((claimed) => {
          if (claimed.length === 0) {
            noEntriesRef.current = true
            setNoEntries(true)
            startSession(sessionId, callListId, [])
            return
          }
          startSession(sessionId, callListId, claimed.map(toCallingEntry))
        })
        .catch(() => {
          toast.error("Couldn't load voters. The call list may not be ready yet.")
          setClaimError(true)
        })

    checkIn.mutate(undefined, {
      onSuccess: () => { doClaim() },
      onError: () => { doClaim() },
    })
  }, [sessionId, callListId, sessionDetailMalformed, canResumePersistedSession, campaignId, checkIn, startSession])

  // Derived state
  const currentEntry = useMemo(
    () => activeEntries[activeCurrentEntryIndex] ?? null,
    [activeEntries, activeCurrentEntryIndex],
  )

  const completedCount = useMemo(
    () => Object.keys(activeCompletedCalls).length,
    [activeCompletedCalls],
  )

  const remainingEntries = useMemo(
    () => activeEntries.length - activeCurrentEntryIndex,
    [activeEntries.length, activeCurrentEntryIndex],
  )

  const isComplete =
    canResumePersistedSession
    && activeCurrentEntryIndex >= activeEntries.length
    && activeEntries.length > 0

  const noEntriesAvailable =
    noEntries && activeEntries.length === 0

  const sessionStats: SessionStats = useMemo(() => {
    const values = Object.values(activeCompletedCalls)
    return {
      totalCalls: values.length,
      answered: values.filter((r) => r === "answered").length,
      noAnswer: values.filter((r) => r === "no_answer").length,
      voicemail: values.filter((r) => r === "voicemail").length,
      other: values.filter(
        (r) => r !== "answered" && r !== "no_answer" && r !== "voicemail",
      ).length,
    }
  }, [activeCompletedCalls])

  // Pre-fetch next batch when running low
  useEffect(() => {
    // Don't prefetch until init has loaded the first batch (entries.length > 0 or noEntries)
    if (!callListId || activeEntries.length === 0 || remainingEntries > PREFETCH_THRESHOLD || prefetchRef.current) return
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
  }, [callListId, activeEntries.length, remainingEntries, isComplete, claimBatch, addEntries])

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
    totalEntries: activeEntries.length,
    isComplete,
    sessionStats,
    isLoading:
      sessionQuery.isLoading
      || (
        Boolean(sessionId)
        && !sessionDetailMalformed
        && !canResumePersistedSession
        && !noEntries
        && !claimError
      ),
    isError: sessionQuery.isError || sessionDetailMalformed || claimError,
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
