import type { PhoneValidationSummary as ValidationSummary } from "@/types/voter-contact"

interface PhoneValidationSummaryProps {
  validation: ValidationSummary | null | undefined
}

function formatValidatedAt(value: string | null | undefined) {
  if (!value) {
    return "Awaiting lookup"
  }

  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) {
    return "Validated recently"
  }
  return `Validated ${date.toLocaleDateString()}`
}

export function PhoneValidationSummary({
  validation,
}: PhoneValidationSummaryProps) {
  if (!validation) {
    return null
  }

  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground/90">Phone Validation</span>
      <span className="mx-2 text-muted-foreground/60">•</span>
      <span>{validation.carrier_name ?? "Carrier unknown"}</span>
      <span className="mx-2 text-muted-foreground/60">•</span>
      <span>{validation.line_type ?? "Line type unknown"}</span>
      <span className="mx-2 text-muted-foreground/60">•</span>
      <span>{formatValidatedAt(validation.validated_at)}</span>
    </div>
  )
}
