import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Headphones, Phone } from "lucide-react"
import type { CallMode } from "@/types/voice"

interface CallModeIndicatorProps {
  mode: CallMode
}

export function CallModeIndicator({ mode }: CallModeIndicatorProps) {
  if (mode === "browser") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-transparent">
            <Headphones className="h-3 w-3" />
            Browser Call
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          This call will use your browser. Make sure your headset or speakers
          are ready.
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="bg-muted text-muted-foreground border-transparent">
          <Phone className="h-3 w-3" />
          Phone
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        This will open your phone&apos;s dialer.
      </TooltipContent>
    </Tooltip>
  )
}
