import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Link } from "@tanstack/react-router"
import type { SessionStats } from "@/types/calling"

interface CompletionSummaryProps {
  stats: SessionStats
  campaignId: string
}

export function CompletionSummary({ stats, campaignId }: CompletionSummaryProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="p-6 text-center max-w-sm">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-status-success-foreground" />
        <h2 className="text-xl font-semibold mb-2">Great work!</h2>
        <p className="text-sm text-muted-foreground mb-4">
          You completed your calling session.
        </p>

        <div className="text-left space-y-1 mb-6">
          <p className="text-base">Calls made: {stats.totalCalls}</p>
          <p className="text-sm text-muted-foreground">
            Answered: {stats.answered}
          </p>
          <p className="text-sm text-muted-foreground">
            No Answer: {stats.noAnswer}
          </p>
          <p className="text-sm text-muted-foreground">
            Voicemail: {stats.voicemail}
          </p>
          <p className="text-sm text-muted-foreground">
            Other: {stats.other}
          </p>
        </div>

        <Button asChild>
          <Link to="/field/$campaignId" params={{ campaignId }}>Back to Hub</Link>
        </Button>
      </Card>
    </div>
  )
}
