import type { OutcomeConfig } from "@/types/calling"

export type DoorKnockResultCode =
  | "not_home"
  | "refused"
  | "supporter"
  | "undecided"
  | "opposed"
  | "moved"
  | "deceased"
  | "come_back_later"
  | "inaccessible"

export interface VoterDetail {
  first_name: string | null
  last_name: string | null
  party: string | null
  age: number | null
  propensity_combined: number | null
  registration_line1: string | null
  registration_line2: string | null
  registration_city: string | null
  registration_state: string | null
  registration_zip: string | null
}

export interface PriorInteractions {
  attempt_count: number
  last_result: string | null
  last_date: string | null
}

export interface EnrichedWalkListEntry {
  id: string
  voter_id: string
  household_key: string | null
  sequence: number
  status: "pending" | "visited" | "skipped"
  voter: VoterDetail
  prior_interactions: PriorInteractions
}

export interface Household {
  householdKey: string
  address: string
  entries: EnrichedWalkListEntry[]
}

/** Contact outcomes that trigger survey panel */
export const SURVEY_TRIGGER_OUTCOMES = new Set<DoorKnockResultCode>([
  "supporter", "undecided", "opposed", "refused",
])

/** Non-contact outcomes that auto-advance without survey */
export const AUTO_ADVANCE_OUTCOMES = new Set<DoorKnockResultCode>([
  "not_home", "come_back_later", "moved", "deceased", "inaccessible",
])

/** Color map for outcome buttons — uses semantic design tokens for theme awareness */
export const OUTCOME_COLORS: Record<DoorKnockResultCode, { bg: string; text: string; border: string }> = {
  supporter:       { bg: "bg-status-success", text: "text-status-success-foreground", border: "border-status-success-foreground/30" },
  undecided:       { bg: "bg-status-warning", text: "text-status-warning-foreground", border: "border-status-warning-foreground/30" },
  come_back_later: { bg: "bg-status-warning", text: "text-status-warning-foreground", border: "border-status-warning-foreground/30" },
  refused:         { bg: "bg-status-error", text: "text-status-error-foreground", border: "border-status-error-foreground/30" },
  opposed:         { bg: "bg-status-error", text: "text-status-error-foreground", border: "border-status-error-foreground/30" },
  not_home:        { bg: "bg-status-neutral", text: "text-status-neutral-foreground", border: "border-status-neutral-foreground/30" },
  moved:           { bg: "bg-status-neutral", text: "text-status-neutral-foreground", border: "border-status-neutral-foreground/30" },
  deceased:        { bg: "bg-status-neutral", text: "text-status-neutral-foreground", border: "border-status-neutral-foreground/30" },
  inaccessible:    { bg: "bg-status-neutral", text: "text-status-neutral-foreground", border: "border-status-neutral-foreground/30" },
}

/** Human-readable labels for outcome codes */
export const OUTCOME_LABELS: Record<DoorKnockResultCode, string> = {
  not_home: "Not Home",
  refused: "Refused",
  supporter: "Supporter",
  undecided: "Undecided",
  opposed: "Opposed",
  moved: "Moved",
  deceased: "Deceased",
  come_back_later: "Come Back",
  inaccessible: "Inaccessible",
}

/** Canvassing outcome configs for generalized OutcomeGrid */
export const CANVASSING_OUTCOMES: OutcomeConfig[] = [
  { code: "supporter",       label: "Supporter",    color: OUTCOME_COLORS.supporter },
  { code: "undecided",       label: "Undecided",    color: OUTCOME_COLORS.undecided },
  { code: "not_home",        label: "Not Home",     color: OUTCOME_COLORS.not_home },
  { code: "come_back_later", label: "Come Back",    color: OUTCOME_COLORS.come_back_later },
  { code: "refused",         label: "Refused",      color: OUTCOME_COLORS.refused },
  { code: "opposed",         label: "Opposed",      color: OUTCOME_COLORS.opposed },
  { code: "moved",           label: "Moved",        color: OUTCOME_COLORS.moved },
  { code: "deceased",        label: "Deceased",     color: OUTCOME_COLORS.deceased },
  { code: "inaccessible",    label: "Inaccessible", color: OUTCOME_COLORS.inaccessible },
]

/** Group flat entries list by household_key into address-based Household objects */
export function groupByHousehold(entries: EnrichedWalkListEntry[]): Household[] {
  const map = new Map<string, EnrichedWalkListEntry[]>()
  for (const entry of entries) {
    const key = entry.household_key || entry.id  // null household_key = own group
    const group = map.get(key) || []
    group.push(entry)
    map.set(key, group)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1][0].sequence - b[1][0].sequence)
    .map(([key, entries]) => ({
      householdKey: key,
      address: formatAddress(entries[0].voter),
      entries,
    }))
}

/** Any object with registration address fields — works with both VoterDetail and Voter types */
export type HasRegistrationAddress = Pick<VoterDetail,
  'registration_line1' | 'registration_city' | 'registration_state' | 'registration_zip'
>

/** Returns true if voter has at least one address component */
export function hasAddress(voter: HasRegistrationAddress): boolean {
  return Boolean(
    voter.registration_line1 || voter.registration_city ||
    voter.registration_state || voter.registration_zip
  )
}

/** Format voter registration address into a single display string */
export function formatAddress(voter: HasRegistrationAddress): string {
  return [
    voter.registration_line1,
    voter.registration_city,
    voter.registration_state,
    voter.registration_zip,
  ].filter(Boolean).join(", ")
}

/** Google Maps navigation URL with walking directions per project feedback */
export function getGoogleMapsUrl(voter: HasRegistrationAddress): string {
  const address = formatAddress(voter)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=walking`
}

/** Propensity score display with color badge */
export function getPropensityDisplay(score: number | null): { label: string; color: string } {
  if (score == null) return { label: "N/A", color: "bg-status-neutral text-status-neutral-foreground" }
  if (score >= 70) return { label: `${score}%`, color: "bg-status-success text-status-success-foreground" }
  if (score >= 40) return { label: `${score}%`, color: "bg-status-warning text-status-warning-foreground" }
  return { label: `${score}%`, color: "bg-status-error text-status-error-foreground" }
}

/** Party badge color — nonpartisan semantic tokens, not political red/blue */
export function getPartyColor(party: string | null): { bg: string; text: string } {
  if (!party) return { bg: "bg-status-neutral", text: "text-status-neutral-foreground" }
  const lower = party.toLowerCase()
  if (lower.includes("democrat")) return { bg: "bg-status-info", text: "text-status-info-foreground" }
  if (lower.includes("republican")) return { bg: "bg-status-error", text: "text-status-error-foreground" }
  return { bg: "bg-status-neutral", text: "text-status-neutral-foreground" }
}
