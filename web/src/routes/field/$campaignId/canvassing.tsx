import { createFileRoute } from "@tanstack/react-router"
import { useCallback } from "react"
import { FieldHeader } from "@/components/field/FieldHeader"
import { FieldProgress } from "@/components/field/FieldProgress"
import { HouseholdCard } from "@/components/field/HouseholdCard"
import { useCanvassingWizard } from "@/hooks/useCanvassingWizard"
import { useFieldMe } from "@/hooks/useFieldMe"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Link } from "@tanstack/react-router"
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
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
    handleSkipAddress,
    handleBulkNotHome,
    handleJumpToAddress,
  } = useCanvassingWizard(campaignId, walkListId)

  const handleOutcomeWithBulk = useCallback(
    (entryId: string, voterId: string, result: DoorKnockResultCode) => {
      const response = handleOutcome(entryId, voterId, result)

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
        // Only prompt if this is the first outcome at this address
        const previouslyCompleted = currentHousehold.entries.filter(
          (e) => e.id !== entryId && completedEntries[e.id] !== undefined,
        )
        if (remaining.length > 0 && previouslyCompleted.length === 0) {
          toast(`Apply to all ${remaining.length + 1} voters at this address?`, {
            action: {
              label: "Yes",
              onClick: () => handleBulkNotHome(remaining),
            },
            cancel: {
              label: "No",
              onClick: () => {},
            },
            duration: 10000,
          })
        }
      }
    },
    [handleOutcome, currentHousehold, completedEntries, skippedEntries, handleBulkNotHome],
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
            <h2 className="text-lg font-semibold mb-2">No Canvassing Assignment</h2>
            <p className="text-sm text-muted-foreground mb-4">
              You haven&apos;t been assigned a walk list yet. Check back later or contact
              your campaign organizer.
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
    return (
      <div className="flex flex-col h-full">
        <FieldHeader campaignId={campaignId} title="Canvassing" showBack />
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="p-6 text-center max-w-sm">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-600" />
            <h2 className="text-xl font-semibold mb-2">Walk List Complete</h2>
            <p className="text-sm text-muted-foreground mb-4">
              You&apos;ve finished all {totalAddresses} doors. Great work!
            </p>
            <Button asChild>
              <Link to={`/field/${campaignId}`}>Back to Hub</Link>
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  // Main wizard layout
  return (
    <div className="flex flex-col h-full">
      <FieldHeader campaignId={campaignId} title="Canvassing" showBack />
      <FieldProgress current={completedAddresses} total={totalAddresses} />
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
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/canvassing")({
  component: Canvassing,
})
