import {
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  type DoorKnockResultCode,
} from "@/types/canvassing"
import { Button } from "@/components/ui/button"

interface OutcomeGridProps {
  onSelect: (result: DoorKnockResultCode) => void
  disabled?: boolean
}

const OUTCOME_ORDER: DoorKnockResultCode[] = [
  "supporter",
  "undecided",
  "not_home",
  "come_back_later",
  "refused",
  "opposed",
  "moved",
  "deceased",
  "inaccessible",
]

export function OutcomeGrid({ onSelect, disabled }: OutcomeGridProps) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      {OUTCOME_ORDER.map((code) => (
        <Button
          key={code}
          variant="outline"
          className={`min-h-11 min-w-11 text-sm font-normal border ${OUTCOME_COLORS[code].bg} ${OUTCOME_COLORS[code].text} ${OUTCOME_COLORS[code].border}`}
          onClick={() => onSelect(code)}
          disabled={disabled}
          aria-label={OUTCOME_LABELS[code]}
        >
          {OUTCOME_LABELS[code]}
        </Button>
      ))}
    </div>
  )
}
