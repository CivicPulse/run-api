import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Link } from "@tanstack/react-router"

interface CanvassingCompletionProps {
  stats: {
    totalDoors: number
    contacted: number
    notHome: number
    other: number
  }
  campaignId: string
}

export function CanvassingCompletionSummary({ stats, campaignId }: CanvassingCompletionProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="p-6 text-center max-w-sm">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-600" />
        <h2 className="text-xl font-semibold mb-2">Great work!</h2>
        <p className="text-sm text-muted-foreground mb-4">
          You completed your walk list.
        </p>

        <div className="text-left space-y-1 mb-6">
          <p className="text-base">Doors visited: {stats.totalDoors}</p>
          <p className="text-sm text-muted-foreground">
            Contacted: {stats.contacted}
          </p>
          <p className="text-sm text-muted-foreground">
            Not Home: {stats.notHome}
          </p>
          <p className="text-sm text-muted-foreground">
            Other: {stats.other}
          </p>
        </div>

        <Button asChild>
          <Link to={`/field/${campaignId}`}>Back to Hub</Link>
        </Button>
      </Card>
    </div>
  )
}
