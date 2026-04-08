import type { SmsEligibility } from "@/types/sms"

interface SmsEligibilitySummaryProps {
  eligibility: SmsEligibility | null | undefined
}

export function SmsEligibilitySummary({
  eligibility,
}: SmsEligibilitySummaryProps) {
  const validation = eligibility?.validation
  if (!validation) {
    return null
  }

  let title = "Textability"
  let body = "This number needs review before texting."
  let className = "rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900"

  if (eligibility?.allowed) {
    title = "Textability"
    body = "This number can be used for SMS outreach."
    className = "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
  } else if (validation.status === "landline") {
    body = "This number is not safe for SMS outreach."
    className = "rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
  } else if (validation.is_stale) {
    body = "Cached validation is getting old. Refresh to confirm the current line type."
  }

  return (
    <div className={className} data-testid="sms-eligibility-summary">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs opacity-90">
        {body}
        {validation.carrier_name ? ` Carrier: ${validation.carrier_name}.` : ""}
      </p>
    </div>
  )
}
