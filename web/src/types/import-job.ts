export type ImportStatus =
  | "pending"
  | "uploaded"
  | "queued"
  | "processing"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed"

export interface ImportJob {
  id: string
  campaign_id: string
  original_filename: string
  status: ImportStatus
  total_rows: number | null
  imported_rows: number
  skipped_rows: number
  error_report_key: string | null
  error_message: string | null
  cancelled_at: string | null
  phones_created: number | null
  source_type: string
  field_mapping: Record<string, string> | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ImportUploadResponse {
  job_id: string
  upload_url: string
  file_key: string
}

export interface FieldMapping {
  field: string | null
  match_type: "exact" | "fuzzy" | null
}

export interface ImportDetectResponse {
  detected_columns: string[]
  suggested_mapping: Record<string, FieldMapping>
  format_detected: "l2" | "generic" | null
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
