import {
  type Household,
  type DoorKnockResultCode,
  getGoogleMapsUrl,
} from "@/types/canvassing"
import { VoterCard } from "@/components/field/VoterCard"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MapPin, SkipForward } from "lucide-react"

interface HouseholdCardProps {
  household: Household
  activeEntryId: string | null
  completedEntries: Record<string, string>
  onOutcomeSelect: (
    entryId: string,
    voterId: string,
    result: DoorKnockResultCode
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
    <Card className="p-4">
      {/* Address header */}
      <a
        href={getGoogleMapsUrl(household.entries[0].voter)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 cursor-pointer min-h-11"
      >
        <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <span className="text-lg font-semibold">{household.address}</span>
      </a>
      <p className="text-xs text-muted-foreground ml-7">
        Tap address to navigate
      </p>

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
      <div className="flex justify-end mt-3">
        <Button
          variant="ghost"
          onClick={onSkip}
          className="text-sm text-muted-foreground min-h-11"
        >
          <SkipForward className="h-4 w-4 mr-1" />
          Skip
        </Button>
      </div>
    </Card>
  )
}
