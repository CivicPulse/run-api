import type { VoterFilter } from "@/types/voter"

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChipCategory = "demographics" | "location" | "scoring" | "voting" | "other"

export interface ChipDescriptor {
  label: string
  category: ChipCategory
  className: string
  tooltip?: string
}

// ─── Category Classes ────────────────────────────────────────────────────────

export const CATEGORY_CLASSES: Record<ChipCategory, string> = {
  demographics: "bg-status-info text-status-info-foreground",
  location: "bg-status-success text-status-success-foreground",
  scoring: "bg-status-warning text-status-warning-foreground",
  voting: "bg-status-error text-status-error-foreground",
  other: "",
}

// ─── Category Mapping ────────────────────────────────────────────────────────

const FILTER_CATEGORY_MAP: Record<string, ChipCategory> = {
  // Demographics
  party: "demographics",
  parties: "demographics",
  age_min: "demographics",
  age_max: "demographics",
  gender: "demographics",
  ethnicities: "demographics",
  spoken_languages: "demographics",
  military_statuses: "demographics",

  // Scoring
  propensity_general_min: "scoring",
  propensity_general_max: "scoring",
  propensity_primary_min: "scoring",
  propensity_primary_max: "scoring",
  propensity_combined_min: "scoring",
  propensity_combined_max: "scoring",

  // Location
  registration_city: "location",
  registration_state: "location",
  registration_zip: "location",
  registration_county: "location",
  precinct: "location",
  mailing_city: "location",
  mailing_state: "location",
  mailing_zip: "location",

  // Voting
  voted_in: "voting",
  not_voted_in: "voting",
  congressional_district: "voting",

  // Other
  tags: "other",
  tags_any: "other",
  registered_after: "other",
  registered_before: "other",
  has_phone: "other",
  logic: "other",
  search: "other",
}

/** Get the category for a given VoterFilter key. */
export function getFilterCategory(filterKey: string): ChipCategory {
  return FILTER_CATEGORY_MAP[filterKey] ?? "other"
}

// ─── Formatting Functions ────────────────────────────────────────────────────

/**
 * Format a propensity range chip label. Returns null if at default bounds.
 * min=0 or undefined is treated as "no lower bound" (default).
 * max=100 or undefined is treated as "no upper bound" (default).
 */
export function formatPropensityChip(
  prefix: string,
  min: number | undefined,
  max: number | undefined,
): string | null {
  const hasMin = min !== undefined && min > 0
  const hasMax = max !== undefined && max < 100
  if (!hasMin && !hasMax) return null
  const minStr = hasMin ? String(min) : ""
  const maxStr = hasMax ? String(max) : ""
  return `${prefix} Propensity: ${minStr}\u2013${maxStr}`
}

/**
 * Format a multi-select chip with optional truncation.
 * Shows up to maxVisible values inline, then "+N more" with a tooltip.
 */
export function formatMultiSelectChip(
  label: string,
  values: string[],
  maxVisible: number = 3,
): { display: string; tooltip?: string } {
  if (values.length <= maxVisible) {
    return { display: `${label}: ${values.join(", ")}` }
  }
  const visible = values.slice(0, maxVisible).join(", ")
  const remaining = values.length - maxVisible
  return {
    display: `${label}: ${visible} +${remaining} more`,
    tooltip: values.join(", "),
  }
}

// ─── Static Chip Descriptors ─────────────────────────────────────────────────

/**
 * Build an array of ChipDescriptors from a VoterFilter.
 * Used by voter list detail page for static (non-dismissible) chips.
 * Ordering follows category groups: Demographics -> Scoring -> Location -> Voting -> Other.
 */
export function buildStaticChipDescriptors(filters: VoterFilter): ChipDescriptor[] {
  const chips: ChipDescriptor[] = []

  function push(label: string, category: ChipCategory, tooltip?: string) {
    chips.push({ label, category, className: CATEGORY_CLASSES[category], tooltip })
  }

  // ── Demographics ─────────────────────────────────────────────────────────

  if (filters.parties && filters.parties.length > 0) {
    push(`Party: ${filters.parties.join(", ")}`, "demographics")
  }

  if (filters.age_min !== undefined || filters.age_max !== undefined) {
    push(`Age: ${filters.age_min ?? ""}\u2013${filters.age_max ?? ""}`, "demographics")
  }

  if (filters.gender) {
    push(`Gender: ${filters.gender}`, "demographics")
  }

  if (filters.ethnicities && filters.ethnicities.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Ethnicity", filters.ethnicities)
    push(display, "demographics", tooltip)
  }

  if (filters.spoken_languages && filters.spoken_languages.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Language", filters.spoken_languages)
    push(display, "demographics", tooltip)
  }

  if (filters.military_statuses && filters.military_statuses.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Military", filters.military_statuses)
    push(display, "demographics", tooltip)
  }

  // ── Scoring ──────────────────────────────────────────────────────────────

  const genLabel = formatPropensityChip("Gen.", filters.propensity_general_min, filters.propensity_general_max)
  if (genLabel) push(genLabel, "scoring")

  const priLabel = formatPropensityChip("Pri.", filters.propensity_primary_min, filters.propensity_primary_max)
  if (priLabel) push(priLabel, "scoring")

  const combLabel = formatPropensityChip("Comb.", filters.propensity_combined_min, filters.propensity_combined_max)
  if (combLabel) push(combLabel, "scoring")

  // ── Location ─────────────────────────────────────────────────────────────

  if (filters.registration_city) {
    push(`City: ${filters.registration_city}`, "location")
  }

  if (filters.registration_state) {
    push(`State: ${filters.registration_state}`, "location")
  }

  if (filters.registration_zip) {
    push(`Zip: ${filters.registration_zip}`, "location")
  }

  if (filters.registration_county) {
    push(`County: ${filters.registration_county}`, "location")
  }

  if (filters.precinct) {
    push(`Precinct: ${filters.precinct}`, "location")
  }

  if (filters.mailing_city) {
    push(`Mail City: ${filters.mailing_city}`, "location")
  }

  if (filters.mailing_state) {
    push(`Mail State: ${filters.mailing_state}`, "location")
  }

  if (filters.mailing_zip) {
    push(`Mail Zip: ${filters.mailing_zip}`, "location")
  }

  // ── Voting ───────────────────────────────────────────────────────────────

  if (filters.voted_in && filters.voted_in.length > 0) {
    push(`Voted in: ${filters.voted_in.join(", ")}`, "voting")
  }

  if (filters.not_voted_in && filters.not_voted_in.length > 0) {
    push(`Not voted in: ${filters.not_voted_in.join(", ")}`, "voting")
  }

  if (filters.congressional_district) {
    push(`CD: ${filters.congressional_district}`, "voting")
  }

  // ── Other ────────────────────────────────────────────────────────────────

  if (filters.tags && filters.tags.length > 0) {
    push(`Tags (all): ${filters.tags.length}`, "other")
  }

  if (filters.tags_any && filters.tags_any.length > 0) {
    push(`Tags (any): ${filters.tags_any.length}`, "other")
  }

  if (filters.registered_after) {
    push(`Registered after: ${filters.registered_after}`, "other")
  }

  if (filters.registered_before) {
    push(`Registered before: ${filters.registered_before}`, "other")
  }

  if (filters.has_phone !== undefined) {
    push(`Has phone: ${filters.has_phone ? "Yes" : "No"}`, "other")
  }

  if (filters.logic && filters.logic !== "AND") {
    push(`Logic: ${filters.logic}`, "other")
  }

  return chips
}
