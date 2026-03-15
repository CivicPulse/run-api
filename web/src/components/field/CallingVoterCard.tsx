import { useVoter } from "@/hooks/useVoters"
import { getPropensityDisplay, getPartyColor } from "@/types/canvassing"
import { PhoneNumberList } from "@/components/field/PhoneNumberList"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { PhoneAttempt } from "@/types/calling"

interface CallingVoterCardProps {
  entry: {
    id: string
    voter_id: string
    voter_name: string | null
    phone_numbers: Array<{
      phone_id: string
      value: string
      type: string
      is_primary: boolean
    }>
    phone_attempts: Record<string, PhoneAttempt> | null
    attempt_count: number
  }
  campaignId: string
  onCallStarted: (e164: string) => void
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

function getMostRecentAttempt(
  phoneAttempts: Record<string, PhoneAttempt> | null,
): { result: string; date: string } | null {
  if (!phoneAttempts) return null
  let latest: PhoneAttempt | null = null
  for (const attempt of Object.values(phoneAttempts)) {
    if (!latest || attempt.at > latest.at) {
      latest = attempt
    }
  }
  if (!latest) return null
  return { result: latest.result, date: latest.at }
}

const RESULT_LABELS: Record<string, string> = {
  answered: "Answered",
  no_answer: "No Answer",
  busy: "Busy",
  voicemail: "Voicemail",
  wrong_number: "Wrong #",
  refused: "Refused",
  deceased: "Deceased",
  disconnected: "Disconnected",
}

export function CallingVoterCard({
  entry,
  campaignId,
  onCallStarted,
}: CallingVoterCardProps) {
  const { data: voter, isLoading: voterLoading } = useVoter(
    campaignId,
    entry.voter_id,
  )

  const voterName = entry.voter_name || "Unknown Voter"
  const partyColor = getPartyColor(voter?.party ?? null)
  const propensity = getPropensityDisplay(voter?.propensity_combined ?? null)

  // Call attempt history text
  let attemptText: string
  if (entry.attempt_count > 0) {
    const visitNum = ordinal(entry.attempt_count + 1)
    const recent = getMostRecentAttempt(entry.phone_attempts)
    if (recent) {
      const label = RESULT_LABELS[recent.result] || recent.result || "Unknown"
      const date = formatDateShort(recent.date)
      attemptText = `${visitNum} call -- last: ${label}${date ? `, ${date}` : ""}`
    } else {
      attemptText = `${visitNum} call`
    }
  } else {
    attemptText = "First call"
  }

  return (
    <Card className="p-4">
      {/* Voter name */}
      <p className="text-base font-normal">{voterName}</p>

      {/* Badges row */}
      <div className="flex items-center gap-2 mt-1">
        {voterLoading ? (
          <>
            <Badge className="text-xs px-2 py-0.5 bg-gray-100 text-gray-400">
              ...
            </Badge>
            <Badge className="text-xs px-2 py-0.5 bg-gray-100 text-gray-400">
              ...
            </Badge>
          </>
        ) : (
          <>
            <Badge
              className={`text-xs px-2 py-0.5 ${partyColor.bg} ${partyColor.text}`}
            >
              {voter?.party || "Unknown"}
            </Badge>
            <Badge className={`text-xs px-2 py-0.5 ${propensity.color}`}>
              {propensity.label}
            </Badge>
            {voter?.age && (
              <span className="text-xs text-muted-foreground">
                Age {voter.age}
              </span>
            )}
          </>
        )}
      </div>

      {/* Call attempt history */}
      <p className="text-xs text-muted-foreground mt-1">{attemptText}</p>

      {/* Phone numbers */}
      <div className="mt-3">
        <PhoneNumberList
          phones={entry.phone_numbers}
          attempts={entry.phone_attempts}
          voterName={voterName}
          onCallStarted={onCallStarted}
        />
      </div>
    </Card>
  )
}
