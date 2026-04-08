import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PhoneValidationSummary as ValidationSummary } from "@/types/voter-contact"

interface PhoneValidationBannerProps {
  validation: ValidationSummary | null | undefined
  isRefreshing?: boolean
  onRefresh?: () => void
}

export function PhoneValidationBanner({
  validation,
  isRefreshing = false,
  onRefresh,
}: PhoneValidationBannerProps) {
  if (!validation?.reason_detail) {
    return null
  }

  const canRefresh = Boolean(onRefresh) && (validation.is_stale || validation.status === "pending")

  return (
    <div
      className="mt-2 flex items-start justify-between gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-3"
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700" />
        <p className="text-xs text-yellow-900">{validation.reason_detail}</p>
      </div>
      {canRefresh ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 shrink-0"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh lookup"}
        </Button>
      ) : null}
    </div>
  )
}
