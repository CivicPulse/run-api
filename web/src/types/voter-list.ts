export interface VoterList {
  id: string
  campaign_id: string
  name: string
  description?: string
  list_type: string
  filter_query?: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface VoterListCreate {
  name: string
  description?: string
  list_type: string
  filter_query?: string | null
}

export interface VoterListUpdate {
  name?: string
  description?: string
  list_type?: string
  filter_query?: string | null
}

export interface VoterListMemberUpdate {
  voter_ids: string[]
}
