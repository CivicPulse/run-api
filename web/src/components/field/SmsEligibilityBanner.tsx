import { AlertTriangle, ShieldAlert } from "lucide-react"
import type { SmsEligibility } from "@/types/sms"

interface SmsEligibilityBannerProps {
  eligibility: SmsEligibility | null | undefined
}

function getBannerCopy(eligibility: SmsEligibility) {
  if (eligibility.reason_code === "opted_out" || eligibility.opt_out_status === "opted_out") {
    return {
      title: "SMS Opt-Out Active",
      body:
        eligibility.reason_detail ??
        "This contact has opted out of SMS outreach. Sending is blocked until they text START.",
      destructive: true,
    }
  }

  if (eligibility.reason_code === "phone_validation_stale") {
    return {
      title: "Validation Refresh Recommended",
      body:
        eligibility.reason_detail ??
        "Cached Twilio Lookup data is stale. Refresh the contact before texting.",
      destructive: false,
    }
  }

  return {
    title: "SMS Send Blocked",
    body:
      eligibility.reason_detail ??
      "This contact is not currently eligible for SMS. Confirm consent before sending.",
    destructive: false,
  }
}

export function SmsEligibilityBanner({
  eligibility,
}: SmsEligibilityBannerProps) {
  if (!eligibility || eligibility.allowed) {
    return null
  }

  const copy = getBannerCopy(eligibility)
  const Icon = copy.destructive ? ShieldAlert : AlertTriangle

  return (
    <div
      role="alert"
      className={
        copy.destructive
          ? "flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
          : "flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3"
      }
    >
      <Icon
        className={
          copy.destructive
            ? "mt-0.5 h-4 w-4 shrink-0 text-destructive"
            : "mt-0.5 h-4 w-4 shrink-0 text-yellow-700"
        }
      />
      <div className="space-y-1">
        <p
          className={
            copy.destructive
              ? "text-sm font-medium text-destructive"
              : "text-sm font-medium text-yellow-900"
          }
        >
          {copy.title}
        </p>
        <p
          className={
            copy.destructive
              ? "text-sm text-muted-foreground"
              : "text-sm text-yellow-800"
          }
        >
          {copy.body}
        </p>
      </div>
    </div>
  )
}
