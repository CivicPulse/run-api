export interface Invite {
  id: string
  campaign_id: string
  email: string
  role: string
  token?: string | null
  created_at: string
  expires_at: string
  accepted_at?: string | null
  revoked_at?: string | null
  email_delivery_status?:
    | "pending"
    | "queued"
    | "submitted"
    | "delivered"
    | "failed"
    | "bounced"
    | "complained"
    | "suppressed"
    | "skipped"
  email_delivery_queued_at?: string | null
  email_delivery_sent_at?: string | null
  email_delivery_error?: string | null
  email_delivery_last_event_at?: string | null
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
