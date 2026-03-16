import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FieldHeader } from "@/components/field/FieldHeader"
import { FieldProgress } from "@/components/field/FieldProgress"
import { HouseholdCard } from "@/components/field/HouseholdCard"
import { InlineSurvey } from "@/components/field/InlineSurvey"
import { useResumePrompt } from "@/components/field/ResumePrompt"
import { DoorListView } from "@/components/field/DoorListView"
import { QuickStartCard } from "@/components/field/QuickStartCard"
import { checkMilestone } from "@/lib/milestones"
import { CanvassingCompletionSummary } from "@/components/field/CanvassingCompletionSummary"
import { useCanvassingWizard } from "@/hooks/useCanvassingWizard"
import { useFieldMe } from "@/hooks/useFieldMe"
import { useWalkList } from "@/hooks/useWalkLists"
import { useTour } from "@/hooks/useTour"
import { useCanvassingStore } from "@/stores/canvassingStore"
import { useAuthStore } from "@/stores/authStore"
import { useTourStore, tourKey } from "@/stores/tourStore"
import { canvassingSteps } from "@/components/field/tour/tourSteps"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Link } from "@tanstack/react-router"
import { Loader2, AlertCircle, CheckCircle2, List } from "lucide-react"
import { toast } from "sonner"
import { SURVEY_TRIGGER_OUTCOMES, OUTCOME_LABELS } from "@/types/canvassing"
import type { DoorKnockResultCode } from "@/types/canvassing"

function Canvassing() {
  const { campaignId } = Route.useParams()
  const fieldMeQuery = useFieldMe(campaignId)
  const walkListId = fieldMeQuery.data?.canvassing?.walk_list_id ?? ""

  const {
    households,
    currentHousehold,
    currentAddressIndex,
    totalAddresses,
    completedAddresses,
    activeEntryId,
    completedEntries,
    skippedEntries,
    isComplete,
    isLoading,
    isError,
    handleOutcome,
    handlePostSurveyAdvance,
    handleSkipAddress,
    handleBulkNotHome,
    handleJumpToAddress,
  } = useCanvassingWizard(campaignId, walkListId)

  // Tour auto-trigger
  const user = useAuthStore((state) => state.user)
  const userId = user?.profile?.sub
  const key = userId ? tourKey(campaignId, userId) : ""
  const { startSegment } = useTour(key)
  const isRunning = useTourStore((s) => s.isRunning)

  const shouldShowQS = useTourStore((s) => {
    if (!key || s.isRunning) return false
    const counts = s.sessionCounts[key]
    const dismissed = s.dismissedThisSession[key]
    return (counts?.canvassing ?? 0) < 3 && !dismissed?.canvassing
  })

  useEffect(() => {
    if (!key || !currentHousehold) return
    const { isSegmentComplete } = useTourStore.getState()
    if (isSegmentComplete(key, "canvassing")) return
    const timer = setTimeout(() => {
      startSegment("canvassing", canvassingSteps)
    }, 200)
    return () => clearTimeout(timer)
  }, [key, currentHousehold, startSegment])

  useEffect(() => {
    if (!key || !currentHousehold) return
    const { incrementSession } = useTourStore.getState()
    incrementSession(key, "canvassing")
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Walk list detail for script_id
  const { data: walkListDetail } = useWalkList(campaignId, walkListId)
  const scriptId = walkListDetail?.script_id

  // Store state for resume prompt
  const storeWalkListId = useCanvassingStore((s) => s.walkListId)
  const lastActiveAt = useCanvassingStore((s) => s.lastActiveAt)

  // Survey state
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [surveyVoterId, setSurveyVoterId] = useState<string | null>(null)

  // Door list view state
  const [listViewOpen, setListViewOpen] = useState(false)

  // ARIA announcement state
  const [ariaAnnouncement, setAriaAnnouncement] = useState("")

  // Active voter name for ARIA
  const activeVoterName = useMemo(() => {
    if (!currentHousehold || !activeEntryId) return ""
    const entry = currentHousehold.entries.find((e) => e.id === activeEntryId)
    if (!entry) return ""
    return (
      [entry.voter.first_name, entry.voter.last_name]
        .filter(Boolean)
        .join(" ") || "Unknown Voter"
    )
  }, [currentHousehold, activeEntryId])

  // Resume prompt
  useResumePrompt({
    walkListId: walkListId || null,
    storedWalkListId: storeWalkListId,
    currentAddressIndex,
    totalAddresses,
    lastActiveAt,
    onResume: () => {},
    onStartOver: () => {
      const firstPendingIdx = households.findIndex((h) =>
        h.entries.some(
          (e) => !completedEntries[e.id] && !skippedEntries.includes(e.id),
        ),
      )
      if (firstPendingIdx >= 0) handleJumpToAddress(firstPendingIdx)
    },
  })

  // ARIA: announce door transitions and completion
  useEffect(() => {
    if (currentHousehold) {
      setAriaAnnouncement(
        `Now at ${currentHousehold.address}, door ${currentAddressIndex + 1} of ${totalAddresses}`,
      )
    }
    if (isComplete) {
      setAriaAnnouncement(
        `Walk list complete. ${totalAddresses} doors visited.`,
      )
    }
  }, [
    currentAddressIndex,
    currentHousehold,
    isComplete,
    totalAddresses,
    activeVoterName,
  ])

  // Milestone celebration toasts
  useEffect(() => {
    if (totalAddresses === 0 || !walkListId) return
    const key = `milestones-fired-canvassing-${walkListId}`
    checkMilestone(completedAddresses, totalAddresses, key)
  }, [completedAddresses, totalAddresses, walkListId])

  // Survey handlers
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

  const handleOutcomeWithBulk = useCallback(
    (entryId: string, voterId: string, result: string) => {
      const response = handleOutcome(entryId, voterId, result as DoorKnockResultCode)

      // ARIA: announce outcome
      const voterEntry = currentHousehold?.entries.find(
        (e) => e.id === entryId,
      )
      if (voterEntry) {
        const voterName =
          [voterEntry.voter.first_name, voterEntry.voter.last_name]
            .filter(Boolean)
            .join(" ") || "Unknown Voter"
        setAriaAnnouncement(
          `${OUTCOME_LABELS[result as DoorKnockResultCode]} recorded for ${voterName}.`,
        )
      }

      // Check for bulk Not Home prompt at multi-voter address
      if (
        result === "not_home" &&
        currentHousehold &&
        currentHousehold.entries.length > 1
      ) {
        const remaining = currentHousehold.entries.filter(
          (e) =>
            e.id !== entryId &&
            completedEntries[e.id] === undefined &&
            !skippedEntries.includes(e.id),
        )
        const previouslyCompleted = currentHousehold.entries.filter(
          (e) => e.id !== entryId && completedEntries[e.id] !== undefined,
        )
        if (remaining.length > 0 && previouslyCompleted.length === 0) {
          toast(
            `Apply to all ${remaining.length + 1} voters at this address?`,
            {
              action: {
                label: "Yes",
                onClick: () => handleBulkNotHome(remaining),
              },
              cancel: {
                label: "No",
                onClick: () => {},
              },
              duration: 10000,
            },
          )
        }
        return
      }

      // Check for survey trigger
      if (SURVEY_TRIGGER_OUTCOMES.has(result as DoorKnockResultCode) && scriptId) {
        setSurveyVoterId(voterId)
        setSurveyOpen(true)
        return
      }
    },
    [
      handleOutcome,
      currentHousehold,
      completedEntries,
      skippedEntries,
      handleBulkNotHome,
      scriptId,
    ],
  )

  // Loading state
  if (fieldMeQuery.isLoading || (walkListId && isLoading)) {
    return (
      <div className="flex flex-col h-full">
        <FieldHeader campaignId={campaignId} title="Canvassing" showBack />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // No assignment state
  if (!walkListId) {
    return (
      <div className="flex flex-col h-full">
        <FieldHeader campaignId={campaignId} title="Canvassing" showBack />
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="p-6 text-center max-w-sm">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">
              No Canvassing Assignment
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              You haven&apos;t been assigned a walk list yet. Check back later
              or contact your campaign organizer.
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
        <FieldHeader campaignId={campaignId} title="Canvassing" showBack />
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="p-6 text-center max-w-sm">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Something Went Wrong</h2>
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load walk list. Pull down to retry.
            </p>
          </Card>
        </div>
      </div>
    )
  }

  // Completion state
  if (isComplete) {
    const contactOutcomes = new Set(["supporter", "undecided", "opposed", "refused"])
    const entries = Object.values(completedEntries)
    const contacted = entries.filter((code) => contactOutcomes.has(code)).length
    const notHomeCount = entries.filter((code) => code === "not_home").length
    const otherCount = entries.length - contacted - notHomeCount

    return (
      <div className="flex flex-col h-full">
        <FieldHeader campaignId={campaignId} title="Canvassing" showBack />
        <CanvassingCompletionSummary
          stats={{
            totalDoors: totalAddresses,
            contacted,
            notHome: notHomeCount,
            other: otherCount,
          }}
          campaignId={campaignId}
        />
      </div>
    )
  }

  // Main wizard layout
  return (
    <div className="flex flex-col h-full">
      <FieldHeader campaignId={campaignId} title="Canvassing" showBack />

      <FieldProgress current={completedAddresses} total={totalAddresses} />
      <div className="flex items-center justify-end px-4 py-1 border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setListViewOpen(true)}
          className="min-h-11"
          data-tour="door-list-button"
        >
          <List className="h-4 w-4 mr-1" />
          All Doors
        </Button>
      </div>

      {shouldShowQS && (
        <div className="px-4 pt-2">
          <QuickStartCard
            type="canvassing"
            onDismiss={() => useTourStore.getState().dismissQuickStart(key, "canvassing")}
          />
        </div>
      )}

      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
      >
        {ariaAnnouncement}
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {currentHousehold && (
          <div
            key={currentAddressIndex}
            className="animate-in slide-in-from-right-4 duration-300"
          >
            <HouseholdCard
              household={currentHousehold}
              activeEntryId={activeEntryId}
              completedEntries={completedEntries}
              onOutcomeSelect={handleOutcomeWithBulk}
              onSkip={handleSkipAddress}
            />
          </div>
        )}
      </div>

      {scriptId && surveyVoterId && (
        <InlineSurvey
          campaignId={campaignId}
          scriptId={scriptId}
          voterId={surveyVoterId}
          open={surveyOpen}
          onComplete={handleSurveyComplete}
          onSkip={handleSurveySkip}
          voterName={activeVoterName}
        />
      )}

      <DoorListView
        households={households}
        currentAddressIndex={currentAddressIndex}
        completedEntries={completedEntries}
        skippedEntries={skippedEntries}
        open={listViewOpen}
        onOpenChange={setListViewOpen}
        onJump={handleJumpToAddress}
      />
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/canvassing")({
  component: Canvassing,
})
