export interface VoterList {
  id: string
  campaign_id: string
  name: string
  description?: string
  list_type: string
  filter_query?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface VoterListCreate {
  name: string
  description?: string
  list_type: string
  filter_query?: string
}

export interface VoterListUpdate {
  name?: string
  description?: string
  list_type?: string
  filter_query?: string
}

export interface VoterListMemberUpdate {
  voter_ids: string[]
}
