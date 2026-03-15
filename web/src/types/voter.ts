export interface Voter {
  id: string
  campaign_id: string
  source_type: string
  source_id: string | null

  first_name: string | null
  middle_name: string | null
  last_name: string | null
  suffix: string | null
  date_of_birth: string | null
  gender: string | null

  // Registration Address
  registration_line1: string | null
  registration_line2: string | null
  registration_city: string | null
  registration_state: string | null
  registration_zip: string | null
  registration_zip4: string | null
  registration_county: string | null
  registration_apartment_type: string | null

  // Mailing Address
  mailing_line1: string | null
  mailing_line2: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
  mailing_zip4: string | null
  mailing_country: string | null
  mailing_type: string | null

  // Political
  party: string | null
  precinct: string | null
  congressional_district: string | null
  state_senate_district: string | null
  state_house_district: string | null
  registration_date: string | null

  // Voting history
  voting_history: string[] | null

  // Propensity Scores
  propensity_general: number | null
  propensity_primary: number | null
  propensity_combined: number | null

  // Demographics
  ethnicity: string | null
  age: number | null
  spoken_language: string | null
  marital_status: string | null
  military_status: string | null
  party_change_indicator: string | null
  cell_phone_confidence: number | null

  // Geographic
  latitude: number | null
  longitude: number | null

  // Household
  household_id: string | null
  household_party_registration: string | null
  household_size: number | null
  family_id: string | null

  // Extras
  extra_data: Record<string, unknown> | null

  // Metadata
  created_at: string
  updated_at: string
}

export interface VoterFilter {
  search?: string
  party?: string
  parties?: string[]
  registration_city?: string
  registration_state?: string
  registration_zip?: string
  registration_county?: string
  precinct?: string
  congressional_district?: string
  age_min?: number
  age_max?: number
  gender?: string
  voted_in?: string[]
  not_voted_in?: string[]
  tags?: string[]
  tags_any?: string[]
  registered_after?: string
  registered_before?: string
  has_phone?: boolean

  // Propensity score ranges
  propensity_general_min?: number
  propensity_general_max?: number
  propensity_primary_min?: number
  propensity_primary_max?: number
  propensity_combined_min?: number
  propensity_combined_max?: number

  // Multi-select demographics
  ethnicities?: string[]
  spoken_languages?: string[]
  military_statuses?: string[]

  // Mailing address
  mailing_city?: string
  mailing_state?: string
  mailing_zip?: string

  logic?: "AND" | "OR"
}

export interface VoterCreate {
  first_name?: string
  middle_name?: string
  last_name?: string
  suffix?: string
  date_of_birth?: string
  gender?: string

  // Registration Address
  registration_line1?: string
  registration_line2?: string
  registration_city?: string
  registration_state?: string
  registration_zip?: string
  registration_zip4?: string
  registration_county?: string
  registration_apartment_type?: string

  // Mailing Address
  mailing_line1?: string
  mailing_line2?: string
  mailing_city?: string
  mailing_state?: string
  mailing_zip?: string
  mailing_zip4?: string
  mailing_country?: string
  mailing_type?: string

  // Political
  party?: string
  precinct?: string
  congressional_district?: string
  state_senate_district?: string
  state_house_district?: string
  registration_date?: string
  party_change_indicator?: string

  // Voting history
  voting_history?: string[]

  // Propensity Scores
  propensity_general?: number
  propensity_primary?: number
  propensity_combined?: number

  // Demographics
  ethnicity?: string
  age?: number
  spoken_language?: string
  marital_status?: string
  military_status?: string
  cell_phone_confidence?: number

  // Geographic
  latitude?: number
  longitude?: number

  // Household
  household_id?: string
  household_party_registration?: string
  household_size?: number
  family_id?: string

  // Extras
  extra_data?: Record<string, unknown>
  source_id?: string
  source_type?: string
}

export interface VoterUpdate extends Partial<VoterCreate> {}

export interface VoterSearchBody {
  filters: VoterFilter
  cursor?: string
  limit?: number
  sort_by?: string
  sort_dir?: "asc" | "desc"
}

export interface VoterInteraction {
  id: string
  campaign_id: string
  voter_id: string
  type: string
  payload: Record<string, unknown>
  created_by: string
  created_at: string
}
