export interface CallListSummary {
  id: string
  name: string
  status: string  // "draft" | "active" | "completed"
  total_entries: number
  completed_entries: number
  created_at: string
}

export interface CallListDetail extends CallListSummary {
  max_attempts: number
  claim_timeout_minutes: number
  cooldown_minutes: number
  voter_list_id: string | null
  script_id: string | null
  created_by: string
  updated_at: string
}

// Backend EntryStatus → UI label mapping:
// available → Unclaimed | in_progress → Claimed | completed → Completed
// max_attempts → Skipped | terminal → Error
export interface CallListEntry {
  id: string
  voter_id: string
  voter_name: string | null
  priority_score: number
  phone_numbers: Array<{
    phone_id: string
    value: string
    type: string
    is_primary: boolean
  }>
  status: "available" | "in_progress" | "completed" | "max_attempts" | "terminal"
  attempt_count: number
  claimed_by: string | null
  claimed_at: string | null
  last_attempt_at: string | null
  phone_attempts: Record<string, { result: string; at: string }> | null
}

export interface CallListCreate {
  name: string
  voter_list_id?: string
  max_attempts?: number
  claim_timeout_minutes?: number
  cooldown_minutes?: number
}

export interface CallListUpdate {
  name?: string
  voter_list_id?: string | null
}
