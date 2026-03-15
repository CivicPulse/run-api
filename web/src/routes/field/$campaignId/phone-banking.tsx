import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { FieldHeader } from "@/components/field/FieldHeader"
import { FieldProgress } from "@/components/field/FieldProgress"
import { OutcomeGrid } from "@/components/field/OutcomeGrid"
import { CallingVoterCard } from "@/components/field/CallingVoterCard"
import { CompletionSummary } from "@/components/field/CompletionSummary"
import { InlineSurvey } from "@/components/field/InlineSurvey"
import { useCallingSession } from "@/hooks/useCallingSession"
import { useFieldMe } from "@/hooks/useFieldMe"
import { CALL_OUTCOME_CONFIGS } from "@/types/calling"
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
import { Loader2, AlertCircle, ArrowLeft, SkipForward } from "lucide-react"

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
    handleOutcome,
    handlePostSurveyAdvance,
    handleSkip,
    handleEndSession,
    handleCallStarted,
    noEntriesAvailable,
  } = useCallingSession(campaignId, sessionId)

  // Local state
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [surveyVoterId, setSurveyVoterId] = useState<string | null>(null)
  const [ariaAnnouncement, setAriaAnnouncement] = useState("")
  const [endDialogOpen, setEndDialogOpen] = useState(false)

  // Display total: prefer assignment total (includes all entries), fallback to loaded entries
  const displayTotal = totalFromAssignment > 0 ? totalFromAssignment : totalEntries

  // ARIA: announce voter transitions
  useEffect(() => {
    if (currentEntry) {
      setAriaAnnouncement(
        `Now calling ${currentEntry.voter_name || "Unknown Voter"}`,
      )
    }
  }, [currentEntry])

  // Outcome selection handler
  const handleOutcomeSelect = useCallback(
    (code: string) => {
      if (!currentEntry) return
      const result = handleOutcome(code)

      // ARIA: announce outcome
      const config = CALL_OUTCOME_CONFIGS.find((c) => c.code === code)
      setAriaAnnouncement(`${config?.label || code} recorded.`)

      // Survey trigger check
      if (result.surveyTrigger && scriptId) {
        setSurveyVoterId(currentEntry.voter_id)
        setSurveyOpen(true)
      }
    },
    [currentEntry, handleOutcome, scriptId],
  )

  const handleSurveyComplete = useCallback(() => {
    setSurveyOpen(false)
    setSurveyVoterId(null)
    handlePostSurveyAdvance()
  }, [handlePostSurveyAdvance])

  const handleSurveySkip = useCallback(() => {
    setSurveyOpen(false)
    setSurveyVoterId(null)
    handlePostSurveyAdvance()
  }, [handlePostSurveyAdvance])

  const handleConfirmEndSession = useCallback(() => {
    handleEndSession()
    navigate({ to: `/field/${campaignId}` })
  }, [handleEndSession, navigate, campaignId])

  // Loading state
  if (fieldMeQuery.isLoading || (sessionId && isLoading)) {
    return (
      <div className="flex flex-col h-full">
        <FieldHeader campaignId={campaignId} title="Phone Banking" showBack />
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
        <FieldHeader campaignId={campaignId} title="Phone Banking" showBack />
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
              <Link to={`/field/${campaignId}`}>Back to Hub</Link>
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
        <FieldHeader campaignId={campaignId} title="Phone Banking" showBack />
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
        <FieldHeader campaignId={campaignId} title="Phone Banking" showBack />
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="p-6 text-center max-w-sm">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Voters to Call</h2>
            <p className="text-sm text-muted-foreground mb-4">
              All voters in this call list have been contacted or claimed by
              other callers. Head back to the hub.
            </p>
            <Button asChild>
              <Link to={`/field/${campaignId}`}>Back to Hub</Link>
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
        <FieldHeader campaignId={campaignId} title="Phone Banking" showBack />
        <CompletionSummary stats={sessionStats} campaignId={campaignId} />
      </div>
    )
  }

  // Main calling layout
  return (
    <div className="flex flex-col h-full">
      {/* Custom header with back arrow that opens end session dialog */}
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
        {/* Spacer to balance layout */}
        <div className="w-11" />
        <div className="w-11" />
      </header>

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

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentEntry && (
          <div
            key={currentEntry.id}
            className="animate-in slide-in-from-right-4 duration-300"
          >
            <CallingVoterCard
              entry={currentEntry}
              campaignId={campaignId}
              onCallStarted={handleCallStarted}
            />

            {/* Outcome grid */}
            <div className="mt-4">
              <OutcomeGrid
                outcomes={CALL_OUTCOME_CONFIGS}
                onSelect={handleOutcomeSelect}
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
          aria-label="Skip this voter and move to next"
        >
          <SkipForward className="h-4 w-4 mr-1" />
          Skip
        </Button>

        <AlertDialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="min-h-11">
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

      {/* InlineSurvey sheet */}
      {scriptId && surveyVoterId && (
        <InlineSurvey
          campaignId={campaignId}
          scriptId={scriptId}
          voterId={surveyVoterId}
          open={surveyOpen}
          onComplete={handleSurveyComplete}
          onSkip={handleSurveySkip}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/phone-banking")({
  component: PhoneBanking,
})
