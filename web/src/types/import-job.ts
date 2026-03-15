export type ImportStatus =
  | "pending"
  | "uploaded"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled" // Defensive: backend enum does not currently include this

export interface ImportJob {
  id: string
  campaign_id: string
  filename: string
  status: ImportStatus
  total_rows: number | null
  imported_rows: number
  skipped_rows: number
  error_count: number
  error_report_key: string | null
  phones_created: number | null
  created_at: string
  updated_at: string
}

export interface ImportUploadResponse {
  job_id: string
  upload_url: string
  expires_in: number
}

export interface ImportDetectResponse {
  detected_columns: string[]
  suggested_mapping: Record<string, string | null>
}

export interface ImportConfirmRequest {
  field_mapping: Record<string, string>
  save_as_template?: string
}

export interface ImportTemplate {
  id: string
  name: string
  field_mapping: Record<string, string>
  created_at: string
}
