export interface CanvassingAssignment {
  walk_list_id: string
  name: string
  total: number
  completed: number
}

export interface PhoneBankingAssignment {
  session_id: string
  name: string
  total: number
  completed: number
}

export interface FieldMeResponse {
  volunteer_name: string
  campaign_name: string
  canvassing: CanvassingAssignment | null
  phone_banking: PhoneBankingAssignment | null
}
