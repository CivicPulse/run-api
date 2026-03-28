import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Link } from "@tanstack/react-router"
import type { SessionStats } from "@/types/calling"

interface CompletionSummaryProps {
  stats: SessionStats
  campaignId: string
}

const HEADINGS = ["Great work!", "Session complete!", "Nicely done!"]

export function CompletionSummary({ stats, campaignId }: CompletionSummaryProps) {
  const heading = HEADINGS[stats.totalCalls % HEADINGS.length]

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="p-6 text-center max-w-sm w-full">
        <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-status-success-foreground animate-in zoom-in-50 duration-500" />
        <h2 className="text-2xl font-bold mb-1 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
          {heading}
        </h2>
        <p className="text-sm text-muted-foreground mb-4 animate-in fade-in duration-300 delay-200">
          You completed your calling session.
        </p>

        <p className="text-4xl font-bold tabular-nums animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
          {stats.totalCalls}
        </p>
        <p className="text-sm text-muted-foreground mb-6">calls completed</p>

        <div className="text-left divide-y mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-[450ms]">
          <div className="flex justify-between py-2">
            <span className="text-sm text-muted-foreground">Answered</span>
            <span className="text-sm font-semibold tabular-nums">{stats.answered}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-muted-foreground">No Answer</span>
            <span className="text-sm font-semibold tabular-nums">{stats.noAnswer}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-muted-foreground">Voicemail</span>
            <span className="text-sm font-semibold tabular-nums">{stats.voicemail}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-muted-foreground">Other</span>
            <span className="text-sm font-semibold tabular-nums">{stats.other}</span>
          </div>
        </div>

        <Button asChild size="lg" className="w-full animate-in fade-in duration-300 delay-[600ms]">
          <Link to="/field/$campaignId" params={{ campaignId }}>Back to Hub</Link>
        </Button>
      </Card>
    </div>
  )
}
