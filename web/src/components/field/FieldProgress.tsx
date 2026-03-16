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
  return (
    <div
      className="px-4 py-2 border-b"
      role="status"
      aria-label={`${current} of ${total} ${unit} completed`}
      data-tour="progress-bar"
    >
      <p className="text-sm text-muted-foreground text-center mb-1 flex items-center justify-center gap-1">
        {current} of {total} {unit}
        <TooltipIcon content="Shows doors completed out of your total. Skipped doors don't count as complete." side="top" />
      </p>
      <Progress value={total > 0 ? (current / total) * 100 : 0} className="h-1" />
    </div>
  )
}
