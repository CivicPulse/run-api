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
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  county: string | null
  party: string | null
  precinct: string | null
  congressional_district: string | null
  state_senate_district: string | null
  state_house_district: string | null
  registration_date: string | null
  voting_history: string[] | null
  ethnicity: string | null
  age: number | null
  latitude: number | null
  longitude: number | null
  household_id: string | null
  extra_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface VoterFilter {
  party?: string
  city?: string
  state?: string
  zip_code?: string
  county?: string
  age_min?: number
  age_max?: number
  gender?: string
  search?: string
  tags?: string[]
}

export interface VoterCreate {
  first_name?: string
  middle_name?: string
  last_name?: string
  suffix?: string
  date_of_birth?: string
  gender?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  zip_code?: string
  county?: string
  party?: string
  precinct?: string
  congressional_district?: string
  state_senate_district?: string
  state_house_district?: string
  ethnicity?: string
  source_type?: string
}

export interface VoterUpdate extends Partial<VoterCreate> {}

export interface VoterSearchRequest {
  filters?: VoterFilter
  query?: string
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
