import type { OutcomeConfig } from "@/types/calling"
import { Button } from "@/components/ui/button"
import { TooltipIcon } from "@/components/field/TooltipIcon"

interface OutcomeGridProps {
  outcomes: OutcomeConfig[]
  onSelect: (code: string) => void
  disabled?: boolean
  voterName?: string
}

export function OutcomeGrid({ outcomes, onSelect, disabled, voterName }: OutcomeGridProps) {
  return (
    <div data-tour="outcome-grid">
      <div className="flex items-center justify-end mb-1">
        <TooltipIcon content='Each button records what happened at this door. "Not Home" means no one answered.' side="top" />
      </div>
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
            aria-label={voterName ? `Record ${outcome.label} for ${voterName}` : `Record outcome: ${outcome.label}`}
          >
            {outcome.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
