import { Clock } from "lucide-react"
import type { CallingHoursCheck } from "@/types/voice"

interface CallingHoursBannerProps {
  callingHours: CallingHoursCheck
}

export function CallingHoursBanner({ callingHours }: CallingHoursBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/30"
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
      <div>
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          Outside Calling Hours
        </p>
        {callingHours.message && (
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            {callingHours.message}
          </p>
        )}
        {callingHours.window_start && callingHours.window_end && (
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Allowed: {callingHours.window_start} &ndash;{" "}
            {callingHours.window_end}
          </p>
        )}
      </div>
    </div>
  )
}
