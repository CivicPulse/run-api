export type OrgRole = "org_owner" | "org_admin"

export interface OrgCampaign {
  id: string
  name: string
  slug: string | null
  campaign_type: string | null
  election_date: string | null
  created_at: string
  member_count: number
  status: string | null
}

export interface CampaignRoleEntry {
  campaign_id: string
  campaign_name: string
  role: string
}

export interface OrgMember {
  user_id: string
  display_name: string | null
  email: string | null
  role: string
  joined_at: string | null
  created_at: string
  campaign_roles: CampaignRoleEntry[]
}

export interface UserOrg {
  id: string
  name: string
  zitadel_org_id: string
  role: string
}

export interface AddMemberRequest {
  user_id: string
  role: string
}
