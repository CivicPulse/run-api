import {
  type Household,
  getGoogleMapsUrl,
  hasAddress,
} from "@/types/canvassing"
import { VoterCard } from "@/components/field/VoterCard"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { MapPin, Navigation2, SkipForward } from "lucide-react"
import { TooltipIcon } from "@/components/field/TooltipIcon"

interface HouseholdCardProps {
  household: Household
  activeEntryId: string | null
  completedEntries: Record<string, string>
  onOutcomeSelect: (
    entryId: string,
    voterId: string,
    result: string
  ) => void
  onSkip: () => void
}

export function HouseholdCard({
  household,
  activeEntryId,
  completedEntries,
  onOutcomeSelect,
  onSkip,
}: HouseholdCardProps) {
  return (
    <Card className="p-4" data-tour="household-card">
      {/* Address header (plain, non-interactive) */}
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <span className="text-lg font-semibold">{household.address}</span>
      </div>

      {/* Navigate button */}
      {hasAddress(household.entries[0].voter) ? (
        <Button
          variant="outline"
          className="w-full min-h-11 mt-2"
          asChild
        >
          <a
            href={getGoogleMapsUrl(household.entries[0].voter)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Navigate to ${household.address}`}
          >
            <Navigation2 className="h-4 w-4 mr-2" />
            Navigate to Address
          </a>
        </Button>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-full inline-block mt-2">
                <Button
                  variant="outline"
                  className="w-full min-h-11"
                  disabled
                  aria-label="Navigate to address (no address available)"
                >
                  <Navigation2 className="h-4 w-4 mr-2" />
                  Navigate to Address
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>No address available</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Voter sub-cards */}
      <div className="mt-3">
        {household.entries.map((entry, idx) => (
          <div key={entry.id}>
            {idx > 0 && <Separator className="my-3" />}
            <VoterCard
              entry={entry}
              isActive={entry.id === activeEntryId}
              recordedOutcome={completedEntries[entry.id]}
              onOutcomeSelect={(result) =>
                onOutcomeSelect(entry.id, entry.voter_id, result)
              }
            />
          </div>
        ))}
      </div>

      {/* Footer with skip button */}
      <div className="flex items-center justify-end mt-3 gap-1">
        <TooltipIcon content="Skipped doors stay on your list. You can come back to them anytime." side="right" />
        <Button
          variant="ghost"
          onClick={onSkip}
          className="text-sm text-muted-foreground min-h-11"
          data-tour="skip-button"
        >
          <SkipForward className="h-4 w-4 mr-1" />
          Skip
        </Button>
      </div>
    </Card>
  )
}
