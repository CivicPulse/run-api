export type ScriptStatus = "draft" | "active" | "archived"
export type QuestionType = "multiple_choice" | "scale" | "free_text"

export interface ScriptCreate {
  title: string
  description?: string
}

export interface ScriptUpdate {
  title?: string
  description?: string
  status?: ScriptStatus
}

export interface ScriptResponse {
  id: string
  campaign_id: string
  title: string
  description: string | null
  status: ScriptStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface QuestionCreate {
  question_text: string
  question_type: QuestionType
  options?: Record<string, unknown>
  position?: number
}

export interface QuestionUpdate {
  question_text?: string
  question_type?: QuestionType
  position?: number
  options?: Record<string, unknown>
}

export interface QuestionResponse {
  id: string
  script_id: string
  position: number
  question_text: string
  question_type: QuestionType
  options: Record<string, unknown> | null
}

export interface ScriptDetailResponse extends ScriptResponse {
  questions: QuestionResponse[]
}

export interface ResponseCreate {
  question_id: string
  voter_id: string
  answer_value: string
}

export interface BatchResponseCreate {
  voter_id: string
  responses: ResponseCreate[]
}

export interface SurveyResponseOut {
  id: string
  script_id: string
  question_id: string
  voter_id: string
  answer_value: string
  answered_by: string
  answered_at: string
}
