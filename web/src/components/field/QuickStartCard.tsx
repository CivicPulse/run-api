import { X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface QuickStartCardProps {
  type: "canvassing" | "phoneBanking"
  onDismiss: () => void
}

const CONTENT: Record<QuickStartCardProps["type"], string[]> = {
  canvassing: [
    "Tap a result after each door",
    "Skip houses you can't reach",
    "Your progress saves automatically",
  ],
  phoneBanking: [
    "Tap a number to call",
    "Record the result after hanging up",
    "End session when you're done",
  ],
}

export function QuickStartCard({ type, onDismiss }: QuickStartCardProps) {
  return (
    <Card className="relative mb-4 border-status-info-foreground/30 bg-status-info p-3">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 min-h-11 min-w-11"
        onClick={onDismiss}
        aria-label="Dismiss quick start tips"
      >
        <X className="h-4 w-4" />
      </Button>
      <ul className="space-y-1 pr-8 text-sm text-status-info-foreground">
        {CONTENT[type].map((tip) => (
          <li key={tip}>&#8226; {tip}</li>
        ))}
      </ul>
    </Card>
  )
}
