// Volunteer types mirroring backend Pydantic schemas (app/schemas/volunteer.py)

export const VOLUNTEER_STATUSES = ["pending", "active", "inactive"] as const
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number]

export const VOLUNTEER_SKILLS = [
  "canvassing",
  "phone_banking",
  "data_entry",
  "event_setup",
  "social_media",
  "translation",
  "driving",
  "voter_registration",
  "fundraising",
  "graphic_design",
] as const
export type VolunteerSkill = (typeof VOLUNTEER_SKILLS)[number]

export interface VolunteerResponse {
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

export interface AvailabilityResponse {
  id: string
  volunteer_id: string
  start_at: string
  end_at: string
}

export interface VolunteerDetailResponse extends VolunteerResponse {
  tags: string[]
  availability: AvailabilityResponse[]
}

export interface VolunteerCreate {
  first_name: string
  last_name: string
  phone?: string
  email?: string
  street?: string
  city?: string
  state?: string
  zip_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  notes?: string
  skills?: string[]
}

export interface VolunteerUpdate {
  first_name?: string
  last_name?: string
  phone?: string
  email?: string
  street?: string
  city?: string
  state?: string
  zip_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  notes?: string
  skills?: string[]
  status?: string
}

export interface VolunteerTagResponse {
  id: string
  campaign_id: string
  name: string
  created_at: string
}

export interface VolunteerShiftRecord {
  shift_id: string
  shift_name: string
  hours: number
  check_in_at: string
  check_out_at: string | null
}

export interface VolunteerHoursResponse {
  volunteer_id: string
  total_hours: number
  shifts_worked: number
  shifts: VolunteerShiftRecord[]
}

/**
 * Convert a skill enum value like "phone_banking" to a display label like "Phone Banking".
 */
export function formatSkillLabel(skill: string): string {
  return skill
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
