import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { FieldProgress } from "@/components/field/FieldProgress"
import { OutcomeGrid } from "@/components/field/OutcomeGrid"
import { CallingVoterCard } from "@/components/field/CallingVoterCard"
import { CompletionSummary } from "@/components/field/CompletionSummary"
import { InlineSurvey } from "@/components/field/InlineSurvey"
import { checkMilestone } from "@/lib/milestones"
import { useCallingSession } from "@/hooks/useCallingSession"
import { useFieldMe } from "@/hooks/useFieldMe"
import { CALL_OUTCOME_CONFIGS } from "@/types/calling"
import { buildRecordCallPayload } from "@/types/phone-bank-session"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Link, useNavigate } from "@tanstack/react-router"
import { Loader2, AlertCircle, ArrowLeft, SkipForward, HelpCircle } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import { useTourStore, tourKey } from "@/stores/tourStore"
import { useTour } from "@/hooks/useTour"
import { phoneBankingSteps } from "@/components/field/tour/tourSteps"
import { QuickStartCard } from "@/components/field/QuickStartCard"

function PhoneBanking() {
  const { campaignId } = Route.useParams()
  const navigate = useNavigate()
  const fieldMeQuery = useFieldMe(campaignId)
  const sessionId = fieldMeQuery.data?.phone_banking?.session_id ?? ""
  const totalFromAssignment = fieldMeQuery.data?.phone_banking?.total ?? 0

  const {
    currentEntry,
    completedCount,
    totalEntries,
    isComplete,
    sessionStats,
    isLoading,
    isError,
    scriptId,
    selectedPhoneNumber,
    callStartedAt,
    isSubmittingCall,
    submitCall,
    handleSkip,
    handleEndSession,
    handleCallStarted,
    noEntriesAvailable,
  } = useCallingSession(campaignId, sessionId)

  // Tour auto-trigger
  const user = useAuthStore((state) => state.user)
  const userId = user?.profile?.sub
  const key = userId ? tourKey(campaignId, userId) : ""
  const { startSegment } = useTour(key)

  const shouldShowQS = useTourStore((s) => {
    if (!key || s.isRunning) return false
    const counts = s.sessionCounts[key]
    const dismissed = s.dismissedThisSession[key]
    return (counts?.phoneBanking ?? 0) < 3 && !dismissed?.phoneBanking
  })

  useEffect(() => {
    if (!key || !currentEntry) return
    const { isSegmentComplete } = useTourStore.getState()
    if (isSegmentComplete(key, "phoneBanking")) return
    const timer = setTimeout(() => {
      startSegment("phoneBanking", phoneBankingSteps)
    }, 200)
    return () => clearTimeout(timer)
  }, [key, currentEntry, startSegment])

  useEffect(() => {
    if (!key || !currentEntry) return
    const { incrementSession } = useTourStore.getState()
    incrementSession(key, "phoneBanking")
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Local state
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [draftEntryId, setDraftEntryId] = useState<string | null>(null)
  const [outcomeState, setOutcomeState] = useState<{ entryId?: string; message: string }>({ message: "" })
  const [endDialogOpen, setEndDialogOpen] = useState(false)

  // Display total: prefer assignment total (includes all entries), fallback to loaded entries
  const displayTotal = totalFromAssignment > 0 ? totalFromAssignment : totalEntries

  // ARIA: navigation announcement derived from current state
  const navigationAnnouncement = currentEntry
    ? `Now calling ${currentEntry.voter_name || "Unknown Voter"}, call ${completedCount + 1} of ${displayTotal}`
    : ""

  const effectiveOutcome =
    outcomeState.entryId === currentEntry?.id ? outcomeState.message : ""
  const ariaAnnouncement = effectiveOutcome || navigationAnnouncement

  // Milestone celebration toasts
  useEffect(() => {
    if (displayTotal === 0 || !sessionId) return
    const key = `milestones-fired-phonebanking-${sessionId}`
    checkMilestone(completedCount, displayTotal, key)
  }, [completedCount, displayTotal, sessionId])

  const buildCurrentPayload = useCallback((resultCode: string, extras?: {
    notes?: string
    surveyResponses?: Array<{ question_id: string; answer_value: string }>
    surveyComplete?: boolean
  }) => {
    if (!currentEntry) return null

    const now = new Date().toISOString()

    return buildRecordCallPayload({
      call_list_entry_id: currentEntry.id,
      result_code: resultCode,
      phone_number_used: selectedPhoneNumber,
      call_started_at: callStartedAt || now,
      call_ended_at: now,
      notes: extras?.notes,
      survey_responses: extras?.surveyResponses,
      survey_complete: extras?.surveyComplete,
    })
  }, [callStartedAt, currentEntry, selectedPhoneNumber])

  // Outcome selection handler
  const handleOutcomeSelect = useCallback(
    async (code: string) => {
      if (!currentEntry || isSubmittingCall) return

      if (code === "answered") {
        setDraftEntryId(currentEntry.id)
        setSurveyOpen(true)
        return
      }

      const payload = buildCurrentPayload(code)
      if (!payload) return

      const saved = await submitCall(payload)
      if (!saved) return

      const config = CALL_OUTCOME_CONFIGS.find((c) => c.code === code)
      setOutcomeState({
        entryId: currentEntry.id,
        message: `${config?.label || code} recorded for ${currentEntry.voter_name || "Unknown Voter"}.`,
      })
    },
    [buildCurrentPayload, currentEntry, isSubmittingCall, submitCall],
  )

  const handleAnsweredDraftSubmit = useCallback(async (
    draft: {
      notes: string
      surveyResponses: Array<{ question_id: string; answer_value: string }>
      surveyComplete: boolean
    },
  ) => {
    if (!currentEntry || draftEntryId !== currentEntry.id) return

    const payload = buildCurrentPayload("answered", {
      notes: draft.notes,
      surveyResponses: draft.surveyResponses,
      surveyComplete: draft.surveyComplete,
    })
    if (!payload) return

    const saved = await submitCall(payload)
    if (!saved) return

    setOutcomeState({
      entryId: currentEntry.id,
      message: `Answered recorded for ${currentEntry.voter_name || "Unknown Voter"}.`,
    })
    setSurveyOpen(false)
    setDraftEntryId(null)
  }, [buildCurrentPayload, currentEntry, draftEntryId, submitCall])

  const handleSurveyCancel = useCallback(() => {
    setSurveyOpen(false)
    setDraftEntryId(null)
  }, [])

  const handleConfirmEndSession = useCallback(() => {
    handleEndSession()
    navigate({ to: "/field/$campaignId", params: { campaignId } })
  }, [handleEndSession, navigate, campaignId])

  // Loading state
  if (fieldMeQuery.isLoading || (sessionId && isLoading)) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // No assignment state
  if (!sessionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="p-6 text-center max-w-sm">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">
              No Phone Banking Assignment
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              You haven&apos;t been assigned a calling session yet. Check back
              later or contact your campaign organizer.
            </p>
            <Button asChild>
              <Link to="/field/$campaignId" params={{ campaignId }}>Back to Hub</Link>
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="p-6 text-center max-w-sm">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Something Went Wrong</h2>
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your calling session. Check your connection and
              try again.
            </p>
          </Card>
        </div>
      </div>
    )
  }

  // No entries available
  if (noEntriesAvailable) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="p-6 text-center max-w-sm">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Voters to Call</h2>
            <p className="text-sm text-muted-foreground mb-4">
              All voters in this call list have been contacted or claimed by
              other callers. Head back to the hub.
            </p>
            <Button asChild>
              <Link to="/field/$campaignId" params={{ campaignId }}>Back to Hub</Link>
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  // Complete state
  if (isComplete) {
    return (
      <div className="flex flex-col h-full">
        <CompletionSummary stats={sessionStats} campaignId={campaignId} />
      </div>
    )
  }

  // Main calling layout
  return (
    <div className="flex flex-col h-full">
      {/* Custom header with back arrow that opens end session dialog */}
      <nav aria-label="Field navigation">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          onClick={() => setEndDialogOpen(true)}
          aria-label="End session and go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-center text-sm font-semibold truncate">
          Phone Banking
        </h1>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label="Help"
          data-tour="help-button"
          onClick={() => key && startSegment("phoneBanking", phoneBankingSteps)}
        >
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
        </Button>
        {/* Spacer for avatar (not shown in calling view) */}
        <div className="w-11" />
      </header>
      </nav>

      <FieldProgress current={completedCount} total={displayTotal} unit="calls" />

      {/* ARIA live region */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
      >
        {ariaAnnouncement}
      </div>

      {shouldShowQS && (
        <div className="px-4 pt-2">
          <QuickStartCard
            type="phoneBanking"
            onDismiss={() => useTourStore.getState().dismissQuickStart(key, "phoneBanking")}
          />
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentEntry && (
          <div
            key={currentEntry.id}
            className="animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <CallingVoterCard
              entry={currentEntry}
              campaignId={campaignId}
              onCallStarted={handleCallStarted}
            />

            {/* Outcome grid */}
            <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-200 delay-150">
              <OutcomeGrid
                outcomes={CALL_OUTCOME_CONFIGS}
                onSelect={handleOutcomeSelect}
                disabled={surveyOpen || isSubmittingCall}
                voterName={currentEntry?.voter_name || "Unknown Voter"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar: Skip + End Session */}
      <div className="flex items-center justify-between p-4 border-t">
        <Button
          variant="outline"
          className="min-h-11"
          onClick={handleSkip}
          disabled={surveyOpen || isSubmittingCall}
          aria-label="Skip this voter and move to next"
          data-tour="skip-button"
        >
          <SkipForward className="h-4 w-4 mr-1" />
          Skip
        </Button>

        <AlertDialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="min-h-11" data-tour="end-session-button">
              End Session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Done calling?</AlertDialogTitle>
              <AlertDialogDescription>
                Your progress is saved. You can resume later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Calling</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmEndSession}>
                End Session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Answered-call draft sheet */}
      {currentEntry && draftEntryId === currentEntry.id && (
        <InlineSurvey
          mode="controlled"
          campaignId={campaignId}
          scriptId={scriptId ?? ""}
          open={surveyOpen}
          onSkip={handleSurveyCancel}
          voterName={currentEntry?.voter_name || "Unknown Voter"}
          onSubmitDraft={handleAnsweredDraftSubmit}
          isSubmitting={isSubmittingCall}
          submitLabel="Save Call"
        />
      )}
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/phone-banking")({
  component: PhoneBanking,
})
