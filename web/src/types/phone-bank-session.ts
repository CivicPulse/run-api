export type SessionStatus = "draft" | "active" | "paused" | "completed"

export interface PhoneBankSession {
  id: string
  name: string
  status: SessionStatus
  call_list_id: string
  scheduled_start: string | null
  scheduled_end: string | null
  created_by: string
  created_at: string
  updated_at: string
  caller_count: number
}

export interface SessionCaller {
  id: string
  session_id: string
  user_id: string
  check_in_at: string | null
  check_out_at: string | null
  created_at: string
}

export interface SessionCreate {
  name: string
  call_list_id: string
  scheduled_start?: string | null
  scheduled_end?: string | null
}

export interface SessionUpdate {
  name?: string
  status?: SessionStatus
  scheduled_start?: string | null
  scheduled_end?: string | null
}

export interface RecordCallPayload {
  call_list_entry_id: string
  result_code: string
  phone_number_used: string
  call_started_at: string
  call_ended_at: string
  notes?: string
  survey_responses?: Array<{ question_id: string; answer_value: string }>
  survey_complete?: boolean
}

export interface CallerProgressItem {
  user_id: string
  calls_made: number
  check_in_at: string | null
  check_out_at: string | null
}

export interface SessionProgressResponse {
  session_id: string
  total_entries: number
  completed: number
  in_progress: number
  available: number
  callers: CallerProgressItem[]
}

// Status transition map: what actions are valid from each status
export const STATUS_ACTIONS: Record<SessionStatus, Array<{ label: string; status: SessionStatus; variant?: "outline" | "default" }>> = {
  draft: [{ label: "Activate", status: "active" }],
  active: [
    { label: "Pause", status: "paused", variant: "outline" },
    { label: "Complete", status: "completed", variant: "outline" },
  ],
  paused: [
    { label: "Resume", status: "active" },
    { label: "Complete", status: "completed", variant: "outline" },
  ],
  completed: [],
}

// Outcome button groups for the calling screen
export const OUTCOME_GROUPS = [
  {
    label: "Connected",
    outcomes: [{ code: "answered", label: "Answered" }],
  },
  {
    label: "Unanswered",
    outcomes: [
      { code: "no_answer", label: "No Answer" },
      { code: "busy", label: "Busy" },
      { code: "voicemail", label: "Voicemail" },
    ],
  },
  {
    label: "Terminal",
    outcomes: [
      { code: "wrong_number", label: "Wrong #" },
      { code: "refused", label: "Refused" },
      { code: "disconnected", label: "Disconnected" },
      { code: "deceased", label: "Deceased" },
    ],
  },
] as const
