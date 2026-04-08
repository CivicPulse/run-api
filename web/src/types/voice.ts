import type { TwilioBudgetSummary } from "@/types/org"

export type TwilioCallStatus =
  | "idle"
  | "connecting"
  | "ringing"
  | "open"
  | "closed"
  | "error"

export interface VoiceTokenResponse {
  token: string
}

export interface VoiceCapabilityResponse {
  browser_call_available: boolean
  reason: string | null
  budget?: TwilioBudgetSummary | null
}

export interface CallingHoursCheck {
  allowed: boolean
  message: string | null
  window_start: string | null
  window_end: string | null
  current_time: string | null
}

export interface DNCCheckResult {
  blocked: boolean
  message: string | null
}

export type CallMode = "browser" | "tel"
