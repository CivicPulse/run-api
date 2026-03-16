import { HelpCircle } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface TooltipIconProps {
  content: string
  side?: "top" | "right" | "bottom" | "left"
}

export function TooltipIcon({ content, side = "top" }: TooltipIconProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center min-h-11 min-w-11 p-1"
          aria-label="More info"
          type="button"
        >
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        className="max-w-[240px] text-sm"
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
