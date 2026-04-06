import {
  type EnrichedWalkListEntry,
  type DoorKnockResultCode,
  getPropensityDisplay,
  getPartyColor,
  OUTCOME_LABELS,
  CANVASSING_OUTCOMES,
} from "@/types/canvassing"
import { OutcomeGrid } from "@/components/field/OutcomeGrid"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"

interface VoterCardProps {
  entry: EnrichedWalkListEntry
  isActive: boolean
  recordedOutcome?: string
  onOutcomeSelect?: (result: string) => void
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

export function VoterCard({
  entry,
  isActive,
  recordedOutcome,
  onOutcomeSelect,
}: VoterCardProps) {
  const { voter, prior_interactions } = entry

  const voterName =
    `${voter.first_name || ""} ${voter.last_name || ""}`.trim() || "Unknown Voter"

  const partyColor = getPartyColor(voter.party ?? null)
  const propensity = getPropensityDisplay(voter.propensity_combined ?? null)

  const isSkipped = entry.status === "skipped"
  const isCompleted = !!recordedOutcome

  // Prior interaction text
  let interactionText: string
  if (prior_interactions.attempt_count > 0) {
    const visitNum = ordinal(prior_interactions.attempt_count + 1)
    const lastLabel =
      OUTCOME_LABELS[prior_interactions.last_result as DoorKnockResultCode] ||
      prior_interactions.last_result ||
      "Unknown"
    const lastDate = formatDateShort(prior_interactions.last_date)
    interactionText = `${visitNum} visit — last: ${lastLabel}${lastDate ? `, ${lastDate}` : ""}`
  } else {
    interactionText = "First visit"
  }

  return (
    <div
      className={
        isSkipped
          ? "rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2"
          : isCompleted
            ? "rounded-lg border border-status-success-foreground/20 bg-status-success/10 px-3 py-2"
            : isActive && !isCompleted && !isSkipped
              ? "py-2 border-l-4 border-primary pl-3"
              : "py-2"
      }
    >
      {/* Voter name */}
      <p className="text-lg font-semibold text-foreground">{voterName}</p>

      {/* Badges row */}
      <div className="flex items-center gap-2 mt-1">
        <Badge
          className={`text-xs px-2 py-0.5 ${partyColor.bg} ${partyColor.text}`}
        >
          {voter.party || "Unknown"}
        </Badge>
        <Badge
          className={`text-xs px-2 py-0.5 ${propensity.color}`}
        >
          {propensity.label}
        </Badge>
        {voter.age && (
          <span className="text-xs text-foreground/80">
            Age {voter.age}
          </span>
        )}
      </div>

      {/* Prior interactions */}
      <p className="mt-1 text-xs text-foreground/80">{interactionText}</p>

      {/* Active state: show outcome grid */}
      {isActive && !isCompleted && !isSkipped && onOutcomeSelect && (
        <div className="mt-3">
          <OutcomeGrid outcomes={CANVASSING_OUTCOMES} onSelect={onOutcomeSelect} voterName={voterName} />
        </div>
      )}

      {/* Completed state: show checkmark + outcome */}
      {isCompleted && !isSkipped && (
        <div className="flex items-center gap-2 mt-2 animate-in zoom-in-50 duration-200">
          <Check className="h-4 w-4 text-status-success-foreground" />
          <Badge variant="secondary" className="text-xs">
            {OUTCOME_LABELS[recordedOutcome as DoorKnockResultCode] || recordedOutcome}
          </Badge>
        </div>
      )}

      {/* Skipped state */}
      {isSkipped && (
        <p className="mt-1 text-xs text-foreground/80">Skipped</p>
      )}
    </div>
  )
}
