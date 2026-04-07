export type OrgRole = "org_owner" | "org_admin"

export interface TwilioOrgStatus {
  account_sid: string | null
  account_sid_configured: boolean
  account_sid_updated_at: string | null
  auth_token_configured: boolean
  auth_token_hint: string | null
  auth_token_updated_at: string | null
  ready: boolean
}

export interface TwilioOrgUpdate {
  account_sid?: string
  auth_token?: string
}

export interface OrgDetail {
  id: string
  name: string
  zitadel_org_id: string
  created_at: string
  twilio: TwilioOrgStatus | null
}

export interface OrgUpdateRequest {
  name?: string
  twilio?: TwilioOrgUpdate
}

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

export interface OrgPhoneNumber {
  id: string
  phone_number: string
  friendly_name: string | null
  phone_type: string
  voice_capable: boolean
  sms_capable: boolean
  mms_capable: boolean
  twilio_sid: string
  capabilities_synced_at: string | null
  created_at: string
  is_default_voice: boolean
  is_default_sms: boolean
}
