import { Progress } from "@/components/ui/progress"
import { TooltipIcon } from "@/components/field/TooltipIcon"

interface FieldProgressProps {
  current: number
  total: number
  unit?: string
}

export function FieldProgress({
  current,
  total,
  unit = "doors",
}: FieldProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const nearComplete = pct >= 75

  return (
    <div
      className="px-4 py-3 border-b"
      role="status"
      aria-label={`${current} of ${total} ${unit} completed`}
      data-tour="progress-bar"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-lg font-bold tabular-nums">{pct}%</span>
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          {current}/{total} {unit}
          <TooltipIcon content="Shows doors completed out of your total. Skipped doors don't count as complete." side="top" />
        </span>
      </div>
      <Progress
        value={pct}
        className={`h-2.5 animate-field-progress-fill ${nearComplete ? "[&_[data-slot=progress-indicator]]:bg-status-success-foreground" : ""}`}
      />
    </div>
  )
}
