import { Link } from "@tanstack/react-router"
import { ChevronRight, Map, Phone } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface AssignmentCardProps {
  type: "canvassing" | "phone-banking"
  id: string
  name: string
  total: number
  completed: number
  campaignId: string
}

export function AssignmentCard({
  type,
  id,
  name,
  total,
  completed,
  campaignId,
}: AssignmentCardProps) {
  const Icon = type === "canvassing" ? Map : Phone
  const iconBg = type === "canvassing" ? "bg-blue-50" : "bg-green-50"
  const iconColor = type === "canvassing" ? "text-blue-600" : "text-green-600"
  const unit = type === "canvassing" ? "doors" : "calls"
  const progressValue = total > 0 ? (completed / total) * 100 : 0

  return (
    <Link
      to={`/field/${campaignId}/${type}`}
      className="block min-h-[100px] rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
      data-tour="assignment-card"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}
          >
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <span className="flex-1 text-base font-semibold">{name}</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>

        <p className="text-sm text-muted-foreground">
          {completed} of {total} {unit}
        </p>

        <Progress value={progressValue} className="h-2" />

        <p className="text-right text-xs text-muted-foreground">Tap to start</p>
      </div>
    </Link>
  )
}
