export interface WalkListCreate {
  turf_id: string
  voter_list_id?: string
  script_id?: string
  name: string
}

export interface WalkListResponse {
  id: string
  name: string
  turf_id: string
  voter_list_id: string | null
  script_id: string | null
  total_entries: number
  visited_entries: number
  created_by: string
  created_at: string
}

export interface WalkListEntryResponse {
  id: string
  voter_id: string
  household_key: string | null
  sequence: number
  status: string
}

export interface CanvasserAssignment {
  user_id: string
}

export interface DoorKnockCreate {
  walk_list_entry_id: string
  result_code: string
  notes?: string
  latitude?: number
  longitude?: number
}
