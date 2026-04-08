import type { TwilioBudgetSummary } from "@/types/org"
import type { PhoneValidationSummary } from "@/types/voter-contact"

export interface SmsEligibility {
  allowed: boolean
  reason_code?: string | null
  reason_detail?: string | null
  voter_phone_id?: string | null
  normalized_phone_number?: string | null
  opt_out_status: string
  validation?: PhoneValidationSummary | null
}

export interface SmsMessage {
  id: string
  conversation_id: string
  direction: "inbound" | "outbound"
  body: string
  message_type: string
  provider_status: string
  twilio_message_sid?: string | null
  from_number: string
  to_number: string
  error_code?: string | null
  error_message?: string | null
  delivered_at?: string | null
  read_at?: string | null
  created_at: string
}

export interface SmsConversation {
  id: string
  voter_id: string
  voter_phone_id?: string | null
  org_phone_number_id: string
  normalized_to_number: string
  last_message_preview?: string | null
  last_message_direction: "inbound" | "outbound"
  last_message_status: string
  last_message_at?: string | null
  unread_count: number
  opt_out_status: string
  opted_out_at?: string | null
}

export interface SmsConversationDetail {
  conversation: SmsConversation
  messages: SmsMessage[]
  eligibility: SmsEligibility
  budget?: TwilioBudgetSummary | null
}

export interface SmsComposePayload {
  voter_id: string
  voter_phone_id: string
  body: string
}

export interface SmsSendResponse {
  conversation: SmsConversation
  message: SmsMessage
  eligibility: SmsEligibility
  budget?: TwilioBudgetSummary | null
}

export interface SmsBulkSendPayload {
  voter_phone_ids: string[]
  body: string
}

export interface SmsBulkSendResponse {
  job_id: string
  queued_count: number
  blocked_count: number
  budget?: TwilioBudgetSummary | null
}
