import { Badge } from "@/components/ui/badge"
import type { PhoneValidationSummary } from "@/types/voter-contact"

interface PhoneValidationBadgeProps {
  validation: PhoneValidationSummary | null | undefined
}

export function PhoneValidationBadge({
  validation,
}: PhoneValidationBadgeProps) {
  if (!validation) {
    return null
  }

  let label = "Review needed"
  let className = "border-yellow-200 bg-yellow-50 text-yellow-900"

  if (validation.status === "validated" && validation.sms_capable) {
    label = validation.is_stale ? "Refresh recommended" : "Textable"
    className = validation.is_stale
      ? "border-yellow-200 bg-yellow-50 text-yellow-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900"
  } else if (validation.status === "landline") {
    label = "Not SMS-safe"
    className = "border-destructive/20 bg-destructive/10 text-destructive"
  } else if (validation.status === "pending") {
    label = "Validating"
    className = "border-sky-200 bg-sky-50 text-sky-900"
  }

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}
