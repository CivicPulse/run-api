// Canvassing types - shared between canvassing wizard and phone banking
// Created as dependency for field components (Plan 01 parallel artifact)

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

export const OUTCOME_COLORS: Record<
  DoorKnockResultCode,
  { bg: string; text: string; border: string }
> = {
  supporter: { bg: "bg-green-50", text: "text-green-800", border: "border-green-300" },
  undecided: { bg: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-300" },
  not_home: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-300" },
  come_back_later: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-300" },
  refused: { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-300" },
  opposed: { bg: "bg-red-50", text: "text-red-800", border: "border-red-300" },
  moved: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-300" },
  deceased: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-400" },
  inaccessible: { bg: "bg-stone-50", text: "text-stone-700", border: "border-stone-300" },
}

export const OUTCOME_LABELS: Record<DoorKnockResultCode, string> = {
  supporter: "Supporter",
  undecided: "Undecided",
  not_home: "Not Home",
  come_back_later: "Come Back Later",
  refused: "Refused",
  opposed: "Opposed",
  moved: "Moved",
  deceased: "Deceased",
  inaccessible: "Inaccessible",
}

export function formatAddress(voter: VoterDetail): string {
  const parts = [
    voter.registration_line1,
    voter.registration_line2,
    voter.registration_city,
    voter.registration_state,
    voter.registration_zip,
  ].filter(Boolean)
  return parts.join(", ") || "Unknown Address"
}

export function getGoogleMapsUrl(voter: VoterDetail): string {
  const address = formatAddress(voter)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}

export function getPropensityDisplay(
  score: number | null
): { label: string; color: string } {
  if (score === null) return { label: "N/A", color: "bg-gray-100 text-gray-600" }
  if (score >= 80) return { label: "High", color: "bg-green-100 text-green-800" }
  if (score >= 50) return { label: "Med", color: "bg-yellow-100 text-yellow-800" }
  return { label: "Low", color: "bg-red-100 text-red-800" }
}

export function getPartyColor(
  party: string | null
): { bg: string; text: string } {
  if (!party) return { bg: "bg-gray-100", text: "text-gray-700" }
  const p = party.toLowerCase()
  if (p === "dem" || p === "democrat" || p === "democratic")
    return { bg: "bg-blue-100", text: "text-blue-800" }
  if (p === "rep" || p === "republican")
    return { bg: "bg-red-100", text: "text-red-800" }
  if (p === "ind" || p === "independent" || p === "npa" || p === "unaffiliated")
    return { bg: "bg-purple-100", text: "text-purple-800" }
  return { bg: "bg-gray-100", text: "text-gray-700" }
}
