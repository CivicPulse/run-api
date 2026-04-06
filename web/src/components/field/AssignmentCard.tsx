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
  name,
  total,
  completed,
  campaignId,
}: AssignmentCardProps) {
  const Icon = type === "canvassing" ? Map : Phone
  const iconBg = type === "canvassing" ? "bg-status-info" : "bg-status-success"
  const iconColor = type === "canvassing" ? "text-status-info-foreground" : "text-status-success-foreground"
  const unit = type === "canvassing" ? "doors" : "calls"
  const progressValue = total > 0 ? (completed / total) * 100 : 0

  return (
    <Link
      to={type === "canvassing" ? "/field/$campaignId/canvassing" : "/field/$campaignId/phone-banking"}
      params={{ campaignId }}
      className="block min-h-[100px] rounded-xl border bg-card p-4 shadow-md transition-shadow hover:shadow-lg"
      data-tour="assignment-card"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconBg} ${completed === 0 ? "animate-field-shimmer" : ""}`}
          >
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
          <span className="flex-1 text-lg font-bold">{name}</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>

        <p className="text-sm font-medium tabular-nums text-muted-foreground">
          {completed} of {total} {unit}
        </p>

        <Progress
          value={progressValue}
          className="h-2.5"
          aria-label={`${name} progress: ${completed} of ${total} ${unit} completed`}
        />

        <p className="text-right text-sm font-medium text-primary">Tap to start</p>
      </div>
    </Link>
  )
}
