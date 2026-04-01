export type CampaignType = "federal" | "state" | "local" | "ballot"
export type CampaignStatus = "active" | "suspended" | "archived" | "deleted"

export interface Campaign {
  id: string
  zitadel_org_id: string
  name: string
  type: CampaignType
  jurisdiction_fips: string | null
  jurisdiction_name: string | null
  election_date: string | null
  status: CampaignStatus
  candidate_name: string | null
  party_affiliation: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CampaignCreate {
  name: string
  type: CampaignType
  organization_id: string
  jurisdiction_fips?: string | null
  jurisdiction_name?: string | null
  election_date?: string | null
  candidate_name?: string | null
  party_affiliation?: string | null
}

export interface CampaignMember {
  user_id: string
  display_name: string
  email: string
  role: string
  synced_at: string
}
