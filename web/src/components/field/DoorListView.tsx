import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { type Household, getGoogleMapsUrl, hasAddress } from "@/types/canvassing"
import { MapPin } from "lucide-react"

interface DoorListViewProps {
  households: Household[]
  currentAddressIndex: number
  completedEntries: Record<string, string>
  skippedEntries: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onJump: (index: number) => void
}

function getHouseholdStatus(
  household: Household,
  completedEntries: Record<string, string>,
  skippedEntries: string[],
): { label: string; className: string } {
  const allVisited = household.entries.every(
    (e) => completedEntries[e.id] !== undefined,
  )
  if (allVisited) {
    return { label: "Visited", className: "bg-green-100 text-green-800 border-transparent" }
  }

  const allSkipped = household.entries.every((e) =>
    skippedEntries.includes(e.id),
  )
  if (allSkipped) {
    return { label: "Skipped", className: "bg-gray-100 text-gray-700 border-transparent" }
  }

  return { label: "Pending", className: "" }
}

export function DoorListView({
  households,
  currentAddressIndex,
  completedEntries,
  skippedEntries,
  open,
  onOpenChange,
  onJump,
}: DoorListViewProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80dvh] rounded-t-2xl flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>Walk List</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto flex-1">
          {households.map((household, index) => {
            const status = getHouseholdStatus(
              household,
              completedEntries,
              skippedEntries,
            )
            return (
              <button
                key={household.householdKey}
                onClick={() => {
                  onJump(index)
                  onOpenChange(false)
                }}
                aria-label={`Jump to door ${index + 1}, ${household.address}, ${status.label}`}
                className={cn(
                  "flex items-center w-full px-4 py-3 min-h-11 text-left border-b",
                  index === currentAddressIndex && "bg-accent",
                )}
              >
                <span className="text-sm font-medium mr-2">{index + 1}.</span>
                <span className="flex-1 text-sm truncate">
                  {household.address}
                </span>
                <Badge
                  variant={status.label === "Pending" ? "outline" : "default"}
                  className={cn("text-xs", status.className)}
                >
                  {status.label}
                </Badge>
                {hasAddress(household.entries[0].voter) ? (
                  <a
                    href={getGoogleMapsUrl(household.entries[0].voter)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center justify-center min-h-11 min-w-11 p-2 shrink-0"
                    aria-label={`Navigate to ${household.address}`}
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </a>
                ) : (
                  <span className="inline-flex items-center justify-center min-h-11 min-w-11 p-2 shrink-0" aria-hidden="true">
                    <MapPin className="h-4 w-4 text-muted-foreground/30" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
