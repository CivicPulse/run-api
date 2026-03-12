export const SHIFT_TYPES = ["canvassing", "phone_banking", "general"] as const
export type ShiftType = (typeof SHIFT_TYPES)[number]

export const SHIFT_STATUSES = [
  "scheduled",
  "active",
  "completed",
  "cancelled",
] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

export const SIGNUP_STATUSES = [
  "signed_up",
  "waitlisted",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const
export type SignupStatus = (typeof SIGNUP_STATUSES)[number]

export interface ShiftCreate {
  name: string
  description?: string
  type: ShiftType
  start_at: string
  end_at: string
  max_volunteers: number
  location_name?: string
  street?: string
  city?: string
  state?: string
  zip_code?: string
  turf_id?: string
  phone_bank_session_id?: string
}

export interface ShiftUpdate {
  name?: string
  description?: string
  type?: ShiftType
  start_at?: string
  end_at?: string
  max_volunteers?: number
  location_name?: string
  street?: string
  city?: string
  state?: string
  zip_code?: string
  turf_id?: string
  phone_bank_session_id?: string
}

export interface ShiftSignupResponse {
  id: string
  shift_id: string
  volunteer_id: string
  status: string
  waitlist_position: number | null
  check_in_at: string | null
  check_out_at: string | null
  signed_up_at: string
}

export interface CheckInResponse {
  id: string
  shift_id: string
  volunteer_id: string
  status: string
  check_in_at: string | null
  check_out_at: string | null
  adjusted_hours: number | null
  adjusted_by: string | null
  adjusted_at: string | null
  signed_up_at: string
  hours: number | null
}

export interface HoursAdjustment {
  adjusted_hours: number
  adjustment_reason: string
}

export interface ShiftStatusUpdate {
  status: string
}

export const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["active", "cancelled"],
  active: ["completed"],
  completed: [],
  cancelled: [],
}

export function shiftStatusVariant(
  status: string,
): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "active":
      return "success"
    case "scheduled":
      return "info"
    case "completed":
      return "default"
    case "cancelled":
      return "error"
    default:
      return "default"
  }
}

export function signupStatusVariant(
  status: string,
): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "signed_up":
      return "info"
    case "waitlisted":
      return "warning"
    case "checked_in":
      return "success"
    case "checked_out":
      return "default"
    case "cancelled":
      return "error"
    case "no_show":
      return "error"
    default:
      return "default"
  }
}

export function shiftTypeLabel(type: string): string {
  switch (type) {
    case "canvassing":
      return "Canvassing"
    case "phone_banking":
      return "Phone Banking"
    case "general":
      return "General"
    default:
      return type
  }
}
