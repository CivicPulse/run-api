export interface Turf {
  id: string
  name: string
  description: string | null
  status: string
  boundary: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

export interface WalkList {
  id: string
  name: string
  turf_id: string
  voter_list_id: string | null
  script_id: string | null
  total_entries: number
  visited_entries: number
  created_by: string
  created_at: string
}

export interface CallList {
  id: string
  name: string
  status: string
  total_entries: number
  completed_entries: number
  max_attempts: number
  claim_timeout_minutes: number
  cooldown_minutes: number
  voter_list_id: string | null
  script_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PhoneBankSession {
  id: string
  name: string
  status: string
  call_list_id: string
  scheduled_start: string | null
  scheduled_end: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Volunteer {
  id: string
  campaign_id: string
  user_id: string | null
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  street: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  notes: string | null
  status: string
  skills: string[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface Shift {
  id: string
  campaign_id: string
  name: string
  description: string | null
  type: string
  status: string
  start_at: string
  end_at: string
  max_volunteers: number
  location_name: string | null
  street: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  latitude: number | null
  longitude: number | null
  turf_id: string | null
  phone_bank_session_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  signed_up_count: number
  waitlist_count: number
}
