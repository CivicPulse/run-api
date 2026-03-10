export interface OutcomeBreakdown {
  not_home: number
  refused: number
  supporter: number
  undecided: number
  opposed: number
  moved: number
  deceased: number
  come_back_later: number
  inaccessible: number
}

export interface CanvassingSummary {
  doors_knocked: number
  contacts_made: number
  contact_rate: number
  outcomes: OutcomeBreakdown
}

export interface TurfBreakdown {
  turf_id: string
  turf_name: string
  doors_knocked: number
  contacts_made: number
  outcomes: OutcomeBreakdown
}

export interface CanvasserBreakdown {
  user_id: string
  display_name: string
  doors_knocked: number
  contacts_made: number
  outcomes: OutcomeBreakdown
}

export interface CallOutcomeBreakdown {
  answered: number
  no_answer: number
  busy: number
  wrong_number: number
  voicemail: number
  refused: number
  deceased: number
  disconnected: number
}

export interface PhoneBankingSummary {
  calls_made: number
  contacts_reached: number
  contact_rate: number
  outcomes: CallOutcomeBreakdown
}

export interface SessionBreakdown {
  session_id: string
  session_name: string
  status: string
  calls_made: number
  contacts_reached: number
  outcomes: CallOutcomeBreakdown
}

export interface CallerBreakdown {
  user_id: string
  display_name: string
  calls_made: number
  contacts_reached: number
  outcomes: CallOutcomeBreakdown
}

export interface VolunteerSummary {
  active_volunteers: number
  total_volunteers: number
  scheduled_shifts: number
  completed_shifts: number
  total_hours: number
}

export interface VolunteerBreakdown {
  volunteer_id: string
  first_name: string
  last_name: string
  shifts_completed: number
  hours_worked: number
  status: string
}

export interface ShiftBreakdown {
  shift_id: string
  shift_name: string
  type: string
  status: string
  max_volunteers: number
  signed_up: number
  checked_in: number
  checked_out: number
}

export interface OverviewResponse {
  canvassing: CanvassingSummary
  phone_banking: PhoneBankingSummary
  volunteers: VolunteerSummary
}
