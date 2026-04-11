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
  first_name?: string | null
  last_name?: string | null
  party?: string | null
  age?: number | null
  propensity_combined?: number | null
  registration_line1?: string | null
  registration_line2?: string | null
  registration_city?: string | null
  registration_state?: string | null
  registration_zip?: string | null
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
  latitude: number | null
  longitude: number | null
  voter: VoterDetail
  prior_interactions: PriorInteractions
}

export interface CoordinatePoint {
  latitude: number
  longitude: number
}

export function isValidCoordinatePoint(
  point: CoordinatePoint | null | undefined,
): point is CoordinatePoint {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      point.latitude >= -90 &&
      point.latitude <= 90 &&
      point.longitude >= -180 &&
      point.longitude <= 180,
  )
}

export interface Household {
  householdKey: string
  address: string
  entries: EnrichedWalkListEntry[]
  sequence: number
  latitude: number | null
  longitude: number | null
}

export interface MappableHousehold extends Household {
  latitude: number
  longitude: number
}

export const SURVEY_TRIGGER_OUTCOMES = new Set<DoorKnockResultCode>([
  "supporter", "undecided", "opposed", "refused",
])

export const AUTO_ADVANCE_OUTCOMES = new Set<DoorKnockResultCode>([
  "not_home", "come_back_later", "moved", "deceased", "inaccessible",
])

/**
 * House-level outcomes (per phase 107 D-18).
 *
 * These outcomes describe the HOUSEHOLD, not an individual voter. When a
 * volunteer records one of these against any voter at a household, the
 * canvassing wizard treats all remaining unrecorded voters at that household
 * as covered by the same outcome and advances to the next house immediately.
 *
 * `moved` and `deceased` are intentionally NOT house-level — those apply to
 * a single person and the volunteer should iterate through the remaining
 * residents at the address.
 *
 * Note: D-18 originally referenced `vacant` and `wrong_address`; neither
 * exists in `DoorKnockResultCode`. The closest semantic fits in the real
 * enum are `come_back_later` and `inaccessible`, which are included here.
 */
export const HOUSE_LEVEL_OUTCOMES = new Set<DoorKnockResultCode>([
  "not_home",
  "come_back_later",
  "inaccessible",
])

export const OUTCOME_COLORS: Record<DoorKnockResultCode, { bg: string; text: string; border: string }> = {
  supporter:       { bg: "bg-status-success", text: "text-status-success-foreground", border: "border-status-success-foreground/30" },
  undecided:       { bg: "bg-status-warning", text: "text-status-warning-foreground", border: "border-status-warning-foreground/30" },
  come_back_later: { bg: "bg-status-warning", text: "text-status-warning-foreground", border: "border-status-warning-foreground/30" },
  refused:         { bg: "bg-status-error", text: "text-status-error-foreground", border: "border-status-error-foreground/30" },
  opposed:         { bg: "bg-status-error", text: "text-status-error-foreground", border: "border-status-error-foreground/30" },
  not_home:        { bg: "bg-status-neutral", text: "text-foreground", border: "border-border" },
  moved:           { bg: "bg-status-neutral", text: "text-foreground", border: "border-border" },
  deceased:        { bg: "bg-status-neutral", text: "text-foreground", border: "border-border" },
  inaccessible:    { bg: "bg-status-neutral", text: "text-foreground", border: "border-border" },
}

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

export const CANVASSING_OUTCOMES: OutcomeConfig[] = [
  { code: "supporter", label: "Supporter", color: OUTCOME_COLORS.supporter },
  { code: "undecided", label: "Undecided", color: OUTCOME_COLORS.undecided },
  { code: "not_home", label: "Not Home", color: OUTCOME_COLORS.not_home },
  { code: "come_back_later", label: "Come Back", color: OUTCOME_COLORS.come_back_later },
  { code: "refused", label: "Refused", color: OUTCOME_COLORS.refused },
  { code: "opposed", label: "Opposed", color: OUTCOME_COLORS.opposed },
  { code: "moved", label: "Moved", color: OUTCOME_COLORS.moved },
  { code: "deceased", label: "Deceased", color: OUTCOME_COLORS.deceased },
  { code: "inaccessible", label: "Inaccessible", color: OUTCOME_COLORS.inaccessible },
]

function getHouseholdSequence(entries: EnrichedWalkListEntry[]): number {
  return entries.reduce(
    (lowest, entry) => Math.min(lowest, entry.sequence),
    Number.POSITIVE_INFINITY,
  )
}

function getEntryCoordinatePoint(entry: EnrichedWalkListEntry): CoordinatePoint | null {
  const candidate = {
    latitude: entry.latitude ?? Number.NaN,
    longitude: entry.longitude ?? Number.NaN,
  }
  if (!isValidCoordinatePoint(candidate)) {
    return null
  }
  return candidate
}

function getRepresentativeCoordinate(entries: EnrichedWalkListEntry[]): CoordinatePoint | null {
  for (const entry of entries) {
    const point = getEntryCoordinatePoint(entry)
    if (point) return point
  }
  return null
}

export function groupByHousehold(entries: EnrichedWalkListEntry[]): Household[] {
  const map = new Map<string, EnrichedWalkListEntry[]>()
  for (const entry of entries) {
    const key = entry.household_key || entry.id
    const group = map.get(key) || []
    group.push(entry)
    map.set(key, group)
  }

  return Array.from(map.entries())
    .map(([key, groupedEntries]) => {
      const coordinates = getRepresentativeCoordinate(groupedEntries)
      return {
        householdKey: key,
        address: formatAddress(groupedEntries[0].voter),
        entries: groupedEntries,
        sequence: getHouseholdSequence(groupedEntries),
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      }
    })
    .sort((a, b) => a.sequence - b.sequence)
}

export type HasRegistrationAddress = Pick<
  VoterDetail,
  "registration_line1" | "registration_city" | "registration_state" | "registration_zip"
>

export function hasAddress(voter: HasRegistrationAddress): boolean {
  return Boolean(
    voter.registration_line1 ||
      voter.registration_city ||
      voter.registration_state ||
      voter.registration_zip,
  )
}

export function formatAddress(voter: HasRegistrationAddress): string {
  return [
    voter.registration_line1,
    voter.registration_city,
    voter.registration_state,
    voter.registration_zip,
  ]
    .filter(Boolean)
    .join(", ")
}

export function getGoogleMapsUrl(voter: HasRegistrationAddress): string {
  const address = formatAddress(voter)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=walking`
}

export function getPropensityDisplay(score: number | null): { label: string; color: string } {
  if (score == null) return { label: "N/A", color: "bg-status-neutral text-foreground" }
  if (score >= 70) return { label: `${score}%`, color: "bg-status-success text-status-success-foreground" }
  if (score >= 40) return { label: `${score}%`, color: "bg-status-warning text-status-warning-foreground" }
  return { label: `${score}%`, color: "bg-status-error text-status-error-foreground" }
}

export function getPartyColor(party: string | null): { bg: string; text: string } {
  if (!party) return { bg: "bg-status-neutral", text: "text-foreground" }
  const lower = party.toLowerCase()
  if (lower.includes("democrat")) return { bg: "bg-status-info", text: "text-status-info-foreground" }
  if (lower.includes("republican")) return { bg: "bg-status-error", text: "text-status-error-foreground" }
  return { bg: "bg-status-neutral", text: "text-foreground" }
}

export function isMappableEntry(entry: EnrichedWalkListEntry): entry is EnrichedWalkListEntry & CoordinatePoint {
  return isValidCoordinatePoint({
    latitude: entry.latitude ?? Number.NaN,
    longitude: entry.longitude ?? Number.NaN,
  })
}

export function isMappableHousehold(household: Household): household is MappableHousehold {
  return isValidCoordinatePoint({
    latitude: household.latitude ?? Number.NaN,
    longitude: household.longitude ?? Number.NaN,
  })
}

export function orderHouseholdsBySequence(households: Household[]): Household[] {
  return [...households].sort((a, b) => a.sequence - b.sequence)
}

function calculateDistanceMeters(a: CoordinatePoint, b: CoordinatePoint): number {
  const toRadians = (value: number) => value * (Math.PI / 180)
  const earthRadiusMeters = 6_371_000
  const deltaLatitude = toRadians(b.latitude - a.latitude)
  const deltaLongitude = toRadians(b.longitude - a.longitude)
  const latitude1 = toRadians(a.latitude)
  const latitude2 = toRadians(b.latitude)

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function orderHouseholdsByDistance(
  households: Household[],
  origin: CoordinatePoint | null,
): Household[] {
  const bySequence = orderHouseholdsBySequence(households)
  if (!isValidCoordinatePoint(origin)) return bySequence

  return bySequence
    .map((household, index) => ({
      household,
      index,
      distance: isMappableHousehold(household)
        ? calculateDistanceMeters(origin, household)
        : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance
      if (a.household.sequence !== b.household.sequence) {
        return a.household.sequence - b.household.sequence
      }
      return a.index - b.index
    })
    .map(({ household }) => household)
}
