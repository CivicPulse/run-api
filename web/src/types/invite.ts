export interface Invite {
  id: string
  campaign_id: string
  email: string
  role: string
  status: "pending" | "accepted" | "expired" | "revoked"
  invited_by: string
  created_at: string
  expires_at: string
  email_delivery_status?: "pending" | "queued" | "submitted" | "failed" | "skipped"
  email_delivery_queued_at?: string | null
  email_delivery_sent_at?: string | null
}

export interface InviteCreate {
  email: string
  role: string
}

export interface PublicInvite {
  token: string
  status: "valid" | "accepted" | "expired" | "revoked" | "not_found"
  campaign_id: string | null
  campaign_name: string | null
  organization_name: string | null
  inviter_name: string | null
  role: string | null
  expires_at: string | null
}
