import type { OutcomeConfig } from "@/types/calling"
import { Button } from "@/components/ui/button"

interface OutcomeGridProps {
  outcomes: OutcomeConfig[]
  onSelect: (code: string) => void
  disabled?: boolean
}

export function OutcomeGrid({ outcomes, onSelect, disabled }: OutcomeGridProps) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      {outcomes.map((outcome) => (
        <Button
          key={outcome.code}
          variant="outline"
          className={`min-h-11 min-w-11 text-sm font-normal border ${outcome.color.bg} ${outcome.color.text} ${outcome.color.border}`}
          onClick={() => onSelect(outcome.code)}
          disabled={disabled}
          aria-label={`Record outcome: ${outcome.label}`}
        >
          {outcome.label}
        </Button>
      ))}
    </div>
  )
}
