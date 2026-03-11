export interface DNCEntry {
  id: string
  phone_number: string
  reason: string
  added_by: string
  added_at: string
}

export interface DNCImportResult {
  added: number
  skipped: number
  invalid: number
}
