export interface VolunteerApplicationReviewContext {
  has_existing_account: boolean
  existing_member: boolean
  existing_member_role: string | null
  prior_application_statuses: string[]
  approval_delivery: string | null
}

export interface VolunteerApplication {
  id: string
  campaign_id: string
  signup_link_id: string
  signup_link_label: string
  applicant_user_id: string | null
  first_name: string
  last_name: string
  email: string
  phone: string | null
  notes: string | null
  status: "pending" | "approved" | "rejected"
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  review_context: VolunteerApplicationReviewContext | null
  created_at: string
  updated_at: string
}

export interface VolunteerApplicationCreate {
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  notes?: string | null
}

export interface PublicVolunteerApplicationStatus {
  status: "none" | "pending" | "approved" | "rejected"
  application: VolunteerApplication | null
}
