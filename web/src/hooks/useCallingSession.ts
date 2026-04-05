import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { canResumeCallingSession, useCallingStore } from "@/stores/callingStore"
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
import type { SessionStats, CallingEntry } from "@/types/calling"
import type { CallListEntry } from "@/types/call-list"
import type { RecordCallPayload } from "@/types/phone-bank-session"

export interface CallingSessionFailureState {
  title: string
  detail: string
  actionLabel: string
}

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

function getPreferredPhoneNumber(entry: CallingEntry | null, phoneNumberUsed: string | null): string {
  if (phoneNumberUsed) return phoneNumberUsed
  if (!entry) return ""

  return (
    entry.phone_numbers.find((phone) => phone.is_primary)?.value
    ?? entry.phone_numbers[0]?.value
    ?? ""
  )
}

function isRecordCallResponse(value: unknown): value is {
  id: string
  result_code: string
  interaction_id: string
} {
  return (
    typeof value === "object"
    && value !== null
    && "id" in value
    && typeof value.id === "string"
    && "result_code" in value
    && typeof value.result_code === "string"
    && "interaction_id" in value
    && typeof value.interaction_id === "string"
  )
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
  const [claimFailure, setClaimFailure] = useState<CallingSessionFailureState | null>(null)
  const [saveFailure, setSaveFailure] = useState<CallingSessionFailureState | null>(null)
  const [isSubmittingCall, setIsSubmittingCall] = useState(false)
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
    setClaimFailure(null)
    setSaveFailure(null)
    setIsSubmittingCall(false)
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
        .catch((error) => {
          toast.error("Couldn't load voters. The call list may not be ready yet.")
          setClaimError(true)
          setClaimFailure({
            title: "Couldn’t load your next calls",
            detail: toVolunteerSafeMessage(
              error,
              "Your assignment is still reserved for you, but we couldn’t load the voter list. Retry from this screen or head back to the hub if the issue keeps happening.",
            ),
            actionLabel: "Retry loading calls",
          })
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

  const selectedPhoneNumber = useMemo(
    () => getPreferredPhoneNumber(currentEntry, phoneNumberUsed),
    [currentEntry, phoneNumberUsed],
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

  const submitCall = useCallback(
    async (payload: RecordCallPayload) => {
      if (!currentEntry) return false
      if (isSubmittingCall) return false

      if (!payload.phone_number_used) {
        toast.error("Select or tap the voter's phone number before saving this call.")
        return false
      }

      setIsSubmittingCall(true)
      setSaveFailure(null)

      try {
        const response = await recordCall.mutateAsync(payload)
        if (!isRecordCallResponse(response)) {
          setSaveFailure({
            title: "Couldn’t save this call yet",
            detail: "The server response was incomplete, so nothing was advanced. Review the call and retry from the same voter.",
            actionLabel: "Retry save",
          })
          toast.error("The call save response was invalid. Please review and try again.")
          return false
        }

        recordOutcome(payload.call_list_entry_id, payload.result_code)
        advanceEntry()
        return true
      } catch (error) {
        setSaveFailure({
          title: "Couldn’t save this call yet",
          detail: toVolunteerSafeMessage(
            error,
            "Your call notes are still here so you can retry from the same voter without losing context.",
          ),
          actionLabel: "Retry save",
        })
        toast.error("Failed to record call. Your draft is still here so you can retry.")
        return false
      } finally {
        setIsSubmittingCall(false)
      }
    },
    [advanceEntry, currentEntry, isSubmittingCall, recordCall, recordOutcome],
  )

  const handleSkip = useCallback(() => {
    if (!currentEntry || isSubmittingCall) return
    selfRelease.mutate(currentEntry.id)
    skipEntry(currentEntry.id)
    setTimeout(() => advanceRef.current(), 300)
  }, [currentEntry, isSubmittingCall, selfRelease, skipEntry])

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

  const retryLoad = useCallback(() => {
    setClaimError(false)
    setClaimFailure(null)
    initRef.current = false
    prefetchRef.current = false
    noEntriesRef.current = false
    setNoEntries(false)
    void sessionQuery.refetch()
  }, [sessionQuery])

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
    claimFailure,
    saveFailure,
    retryLoad,
    scriptId,
    selectedPhoneNumber,
    callStartedAt,
    isSubmittingCall,
    submitCall,
    handleSkip,
    handleEndSession,
    handleCallStarted,
    noEntriesAvailable,
  }
}
