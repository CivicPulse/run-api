// --- OutcomeConfig (shared by canvassing and phone banking) ---
export interface OutcomeConfig {
  code: string
  label: string
  color: { bg: string; text: string; border: string }
}

// --- Phone banking specific ---
export type CallResultCode =
  | "answered" | "no_answer" | "busy" | "voicemail"
  | "wrong_number" | "refused" | "deceased" | "disconnected"

export const CALL_OUTCOME_CONFIGS: OutcomeConfig[] = [
  { code: "answered",     label: "Answered",     color: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" } },
  { code: "no_answer",    label: "No Answer",    color: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" } },
  { code: "busy",         label: "Busy",         color: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" } },
  { code: "voicemail",    label: "Voicemail",    color: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" } },
  { code: "wrong_number", label: "Wrong #",      color: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" } },
  { code: "refused",      label: "Refused",      color: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" } },
  { code: "deceased",     label: "Deceased",     color: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" } },
  { code: "disconnected", label: "Disconnected", color: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" } },
]

// Survey triggers on ANSWERED only
export const CALL_SURVEY_TRIGGER: CallResultCode = "answered"

// Phone number helpers
export interface PhoneAttempt {
  result: string
  at: string
}

export function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4)
    const prefix = digits.slice(4, 7)
    const line = digits.slice(7)
    return `(${area}) ${prefix}-${line}`
  }
  return e164
}

export function getPhoneStatus(
  phoneValue: string,
  phoneAttempts: Record<string, PhoneAttempt> | null,
): { isTerminal: boolean; priorTries: number; lastResult: string | null } {
  if (!phoneAttempts || !phoneAttempts[phoneValue]) {
    return { isTerminal: false, priorTries: 0, lastResult: null }
  }
  const attempt = phoneAttempts[phoneValue]
  const isTerminal = attempt.result === "wrong_number" || attempt.result === "disconnected"
  return { isTerminal, priorTries: 1, lastResult: attempt.result }
}

// Session stats for completion summary
export interface SessionStats {
  totalCalls: number
  answered: number
  noAnswer: number
  voicemail: number
  other: number
}

// Enriched calling entry (CallListEntry + voter context for phone banking)
export interface CallingEntry {
  id: string
  voter_id: string
  voter_name: string | null
  phone_numbers: Array<{
    phone_id: string
    value: string
    type: string
    is_primary: boolean
  }>
  phone_attempts: Record<string, PhoneAttempt> | null
  attempt_count: number
  priority_score: number
}
