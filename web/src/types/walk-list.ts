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

export interface DoorKnockSurveyResponse {
  question_id: string
  voter_id: string
  answer_value: string
}

export interface DoorKnockCreate {
  // Plan 110-02 / OFFLINE-01: client-generated UUID used for end-to-end
  // idempotency. The offline queue store stamps this in push() so the
  // same ID flows to `QueueItem.id` AND `payload.client_uuid`; a mid-
  // flight retry of an online POST carries the same UUID so the server
  // can 409 the duplicate via its partial unique index.
  client_uuid: string
  walk_list_entry_id: string
  voter_id: string
  result_code: string
  notes?: string
  survey_responses?: DoorKnockSurveyResponse[]
  survey_complete?: boolean
  latitude?: number
  longitude?: number
}
