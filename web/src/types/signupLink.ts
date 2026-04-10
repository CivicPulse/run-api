export interface SignupLink {
  id: string
  campaign_id: string
  label: string
  token: string
  status: "active" | "disabled" | "regenerated"
  expires_at: string | null
  disabled_at: string | null
  regenerated_at: string | null
  created_at: string
  updated_at: string
}

export interface SignupLinkCreate {
  label: string
}

export interface PublicSignupLink {
  token: string
  status: "valid" | "unavailable"
  campaign_id: string | null
  campaign_name: string | null
  organization_name: string | null
  candidate_name: string | null
  jurisdiction_name: string | null
  election_date: string | null
  link_label: string | null
}
