import { createFileRoute, Link } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FieldProgress } from "@/components/field/FieldProgress"
import { HouseholdCard } from "@/components/field/HouseholdCard"
import { InlineSurvey } from "@/components/field/InlineSurvey"
import { useResumePrompt } from "@/components/field/ResumePrompt"
import { DoorListView } from "@/components/field/DoorListView"
import { QuickStartCard } from "@/components/field/QuickStartCard"
import { CanvassingMap } from "@/components/field/CanvassingMap"
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, List, LocateFixed, ListOrdered } from "lucide-react"
import { toast } from "sonner"
import { OUTCOME_LABELS } from "@/types/canvassing"
import type { CoordinatePoint, DoorKnockResultCode } from "@/types/canvassing"

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
    sortMode,
    locationSnapshot,
    locationStatus,
    isComplete,
    isLoading,
    isError,
    isSavingDoorKnock,
    handleOutcome,
    handleSubmitContact,
    handleSkipAddress,
    handleBulkNotHome,
    handleJumpToAddress,
  } = useCanvassingWizard(campaignId, walkListId)

  const storeWalkListId = useCanvassingStore((s) => s.walkListId)
  const lastActiveAt = useCanvassingStore((s) => s.lastActiveAt)
  const setSortMode = useCanvassingStore((s) => s.setSortMode)
  const setLocationState = useCanvassingStore((s) => s.setLocationState)

  const [isCapturingLocation, setIsCapturingLocation] = useState(false)

  const user = useAuthStore((state) => state.user)
  const userId = user?.profile?.sub
  const key = userId ? tourKey(campaignId, userId) : ""
  const { startSegment } = useTour(key)
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

  const { data: walkListDetail } = useWalkList(campaignId, walkListId)
  const scriptId = walkListDetail?.script_id ?? ""

  const [surveyOpen, setSurveyOpen] = useState(false)
  const [draftEntryId, setDraftEntryId] = useState<string | null>(null)
  const [draftVoterId, setDraftVoterId] = useState<string | null>(null)
  const [draftOutcome, setDraftOutcome] = useState<Extract<DoorKnockResultCode, "supporter" | "undecided" | "opposed" | "refused"> | null>(null)
  const [listViewOpen, setListViewOpen] = useState(false)
  const [saveFailure, setSaveFailure] = useState<{
    title: string
    detail: string
    actionLabel: string
  } | null>(null)

  const navigationKey = `${currentAddressIndex}:${activeEntryId ?? ""}:${isComplete ? 1 : 0}`
  const [outcomeAnnouncement, setOutcomeAnnouncement] = useState<{
    key: string
    message: string
  } | null>(null)

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

  const draftVoterName = useMemo(() => {
    if (!currentHousehold || !draftEntryId) return ""
    const entry = currentHousehold.entries.find((e) => e.id === draftEntryId)
    if (!entry) return ""
    return (
      [entry.voter.first_name, entry.voter.last_name]
        .filter(Boolean)
        .join(" ") || "Unknown Voter"
    )
  }, [currentHousehold, draftEntryId])

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

  const navigationAnnouncement = isComplete
    ? `Walk list complete. ${totalAddresses} doors visited.`
    : currentHousehold
      ? `Now at ${currentHousehold.address}, door ${currentAddressIndex + 1} of ${totalAddresses}`
      : ""

  const ariaAnnouncement =
    outcomeAnnouncement?.key === navigationKey
      ? outcomeAnnouncement.message
      : navigationAnnouncement

  useEffect(() => {
    if (totalAddresses === 0 || !walkListId) return
    const key = `milestones-fired-canvassing-${walkListId}`
    checkMilestone(completedAddresses, totalAddresses, key)
  }, [completedAddresses, totalAddresses, walkListId])

  const closeDraft = useCallback(() => {
    setSurveyOpen(false)
    setDraftEntryId(null)
    setDraftVoterId(null)
    setDraftOutcome(null)
    setSaveFailure(null)
  }, [])

  const handleSurveySkip = useCallback(() => {
    closeDraft()
  }, [closeDraft])

  const handleOutcomeWithBulk = useCallback(
    async (entryId: string, voterId: string, result: string) => {
      const outcome = result as DoorKnockResultCode
      const outcomeResult = await handleOutcome(entryId, voterId, outcome)

      if (outcomeResult.surveyTrigger) {
        setDraftEntryId(entryId)
        setDraftVoterId(voterId)
        setDraftOutcome(outcome as Extract<DoorKnockResultCode, "supporter" | "undecided" | "opposed" | "refused">)
        setSaveFailure(null)
        setSurveyOpen(true)
        return
      }

      const voterEntry = currentHousehold?.entries.find(
        (e) => e.id === entryId,
      )
      if (voterEntry) {
        const voterName =
          [voterEntry.voter.first_name, voterEntry.voter.last_name]
            .filter(Boolean)
            .join(" ") || "Unknown Voter"
        setOutcomeAnnouncement({
          key: navigationKey,
          message: `${OUTCOME_LABELS[outcome]} recorded for ${voterName}.`,
        })
      }

      if (outcomeResult.bulkPrompt && currentHousehold) {
        const remaining = currentHousehold.entries.filter(
          (e) =>
            e.id !== entryId &&
            completedEntries[e.id] === undefined &&
            !skippedEntries.includes(e.id),
        )
        if (remaining.length > 0) {
          toast(
            `Apply to all ${remaining.length + 1} voters at this address?`,
            {
              action: {
                label: "Yes",
                onClick: async () => {
                  const bulkSaved = await handleBulkNotHome(remaining)
                  if (bulkSaved) {
                    setOutcomeAnnouncement({
                      key: navigationKey,
                      message: `Not Home recorded for ${remaining.length + 1} voters at ${currentHousehold.address}.`,
                    })
                  }
                },
              },
              cancel: {
                label: "No",
                onClick: () => {},
              },
              duration: 10000,
            },
          )
        }
      }
    },
    [
      completedEntries,
      currentHousehold,
      handleBulkNotHome,
      handleOutcome,
      navigationKey,
      skippedEntries,
    ],
  )

  const handleSubmitContactDraft = useCallback(async (
    draft: {
      notes: string
      surveyResponses: Array<{ question_id: string; answer_value: string }>
      surveyComplete: boolean
    },
  ) => {
    if (!draftEntryId || !draftVoterId || !draftOutcome) return

    setSaveFailure(null)
    const submission = await handleSubmitContact({
      entryId: draftEntryId,
      voterId: draftVoterId,
      result: draftOutcome,
      notes: draft.notes,
      surveyResponses: draft.surveyResponses,
      surveyComplete: draft.surveyComplete,
    })
    if (!submission.saved) {
      setSaveFailure(submission.failure)
      return
    }

    setOutcomeAnnouncement({
      key: navigationKey,
      message: `${OUTCOME_LABELS[draftOutcome]} recorded for ${draftVoterName || "Unknown Voter"}.`,
    })
    closeDraft()
  }, [closeDraft, draftEntryId, draftOutcome, draftVoterId, draftVoterName, handleSubmitContact, navigationKey])

  const requestDistanceOrder = useCallback(
    (refreshLocation = false) => {
      const useSnapshot =
        !refreshLocation &&
        locationStatus === "ready" &&
        locationSnapshot !== null

      if (useSnapshot) {
        setSortMode("distance")
        return
      }

      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        setLocationState("unavailable")
        setSortMode("sequence")
        toast.error("Current location is unavailable on this device.")
        return
      }

      setIsCapturingLocation(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const snapshot: CoordinatePoint = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }
          setLocationState("ready", snapshot)
          setSortMode("distance")
          setIsCapturingLocation(false)
          toast.success("Distance order is ready for this route.")
        },
        (error) => {
          const denied = error.code === error.PERMISSION_DENIED
          setLocationState(denied ? "denied" : "unavailable")
          setSortMode("sequence")
          setIsCapturingLocation(false)
          toast.error(
            denied
              ? "Location permission denied. Staying in sequence order."
              : "Could not capture your location. Staying in sequence order.",
          )
        },
        {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 0,
        },
      )
    },
    [locationSnapshot, locationStatus, setLocationState, setSortMode],
  )

  if (fieldMeQuery.isLoading || (walkListId && isLoading)) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!walkListId) {
    return (
      <div className="flex flex-col h-full">
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
              <Link to="/field/$campaignId" params={{ campaignId }}>Back to Hub</Link>
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
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

  if (isComplete) {
    const contactOutcomes = new Set(["supporter", "undecided", "opposed", "refused"])
    const entries = Object.values(completedEntries)
    const contacted = entries.filter((code) => contactOutcomes.has(code)).length
    const notHomeCount = entries.filter((code) => code === "not_home").length
    const otherCount = entries.length - contacted - notHomeCount

    return (
      <div className="flex flex-col h-full">
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

  return (
    <div className="flex flex-col h-full">
      <FieldProgress current={completedAddresses} total={totalAddresses} />
      <div className="flex items-center justify-between px-4 py-1 border-b gap-2">
        <Badge variant="outline" data-testid="canvassing-route-order-mode">
          {sortMode === "distance" ? "Distance order" : "Sequence order"}
        </Badge>
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

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {saveFailure && draftEntryId && draftVoterId && draftOutcome && (
          <Card className="border-destructive/40 bg-destructive/5" data-testid="canvassing-save-failure-card">
            <CardHeader className="gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-destructive" />
                {saveFailure.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{saveFailure.detail}</p>
              <p>
                You&apos;re still on {draftVoterName || activeVoterName || "this voter"}. Review the answers below and retry when you&apos;re ready.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={handleSurveySkip}>
                Back to hub
              </Button>
              <Button type="button" onClick={() => setSaveFailure(null)}>
                {saveFailure.actionLabel}
              </Button>
            </CardFooter>
          </Card>
        )}

        {currentHousehold && (
          <>
            <CanvassingMap
              households={households}
              activeHouseholdKey={currentHousehold.householdKey}
              locationStatus={locationStatus}
              locationSnapshot={locationSnapshot}
            />

            <Card className="p-4 space-y-3" data-testid="canvassing-sort-controls">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ListOrdered className="h-4 w-4 text-muted-foreground" />
                    Door order
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground" data-testid="canvassing-sort-status-copy">
                    {sortMode === "distance"
                      ? "Distance order is active for the remaining route using your saved location snapshot."
                      : "Sequence order is active until you capture your current location."}
                  </p>
                </div>
                <Badge variant="secondary" data-testid="canvassing-current-door-copy">
                  Door {currentAddressIndex + 1} of {totalAddresses}
                </Badge>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={sortMode === "sequence" ? "default" : "outline"}
                  className="min-h-11 flex-1"
                  onClick={() => setSortMode("sequence")}
                >
                  Sequence order
                </Button>
                <Button
                  type="button"
                  variant={sortMode === "distance" ? "default" : "outline"}
                  className="min-h-11 flex-1"
                  onClick={() => requestDistanceOrder(false)}
                  disabled={isCapturingLocation}
                >
                  {isCapturingLocation && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {locationStatus === "ready" ? "Distance order" : "Use my location"}
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LocateFixed className="h-4 w-4" />
                  <span>
                    {locationStatus === "ready"
                      ? "Saved location is available for map markers and distance ordering."
                      : "Google Maps links stay available even if location is missing or denied."}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 justify-start sm:justify-center"
                  onClick={() => requestDistanceOrder(true)}
                  disabled={isCapturingLocation}
                >
                  Refresh location
                </Button>
              </div>
            </Card>

            <div
              key={currentHousehold.householdKey}
              className="animate-in fade-in slide-in-from-right-4 duration-300"
            >
              <HouseholdCard
                household={currentHousehold}
                activeEntryId={activeEntryId}
                completedEntries={completedEntries}
                skippedEntries={skippedEntries}
                currentDoorNumber={currentAddressIndex + 1}
                totalDoors={totalAddresses}
                sortMode={sortMode}
                onOutcomeSelect={handleOutcomeWithBulk}
                onSkip={handleSkipAddress}
              />
            </div>
          </>
        )}
      </div>

      {draftEntryId && draftVoterId && draftOutcome && (
        <InlineSurvey
          mode="controlled"
          campaignId={campaignId}
          scriptId={scriptId}
          open={surveyOpen}
          onSkip={handleSurveySkip}
          voterName={draftVoterName || activeVoterName}
          onSubmitDraft={handleSubmitContactDraft}
          isSubmitting={isSavingDoorKnock}
          submitLabel="Save Door Knock"
        />
      )}

      <DoorListView
        households={households}
        currentAddressIndex={currentAddressIndex}
        completedEntries={completedEntries}
        skippedEntries={skippedEntries}
        sortMode={sortMode}
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
