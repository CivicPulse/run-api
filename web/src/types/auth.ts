export type CampaignRole = "owner" | "admin" | "manager" | "volunteer" | "viewer"

export interface UserProfile {
  id: string
  email: string
  name: string
  given_name: string
  family_name: string
}

export interface CampaignMembership {
  campaign_id: string
  campaign_name: string
  role: CampaignRole
}

export interface AuthUser extends UserProfile {
  memberships: CampaignMembership[]
}
