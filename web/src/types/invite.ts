export interface Invite {
  id: string
  campaign_id: string
  email: string
  role: string
  status: "pending" | "accepted" | "expired" | "revoked"
  invited_by: string
  created_at: string
  expires_at: string
}

export interface InviteCreate {
  email: string
  role: string
}
