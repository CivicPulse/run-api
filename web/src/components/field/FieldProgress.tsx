import { Progress } from "@/components/ui/progress"

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
    >
      <p className="text-sm text-muted-foreground text-center mb-1">
        {current} of {total} {unit}
      </p>
      <Progress value={total > 0 ? (current / total) * 100 : 0} className="h-1" />
    </div>
  )
}
