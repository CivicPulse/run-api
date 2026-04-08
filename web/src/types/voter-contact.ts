export interface PhoneValidationSummary {
  normalized_phone_number: string
  status: string
  is_valid?: boolean | null
  carrier_name?: string | null
  line_type?: string | null
  sms_capable?: boolean | null
  validated_at?: string | null
  is_stale: boolean
  reason_code?: string | null
  reason_detail?: string | null
}

export interface PhoneContact {
  id: string
  campaign_id: string
  voter_id: string
  value: string
  type: string
  is_primary: boolean
  source: string
  created_at: string
  updated_at: string
  validation?: PhoneValidationSummary | null
}

export interface PhoneContactCreate {
  value: string
  type: string
  is_primary?: boolean
  source?: string
}

export interface EmailContact {
  id: string
  campaign_id: string
  voter_id: string
  value: string
  type: string
  is_primary: boolean
  source: string
  created_at: string
  updated_at: string
}

export interface EmailContactCreate {
  value: string
  type: string
  is_primary?: boolean
  source?: string
}

export interface AddressContact {
  id: string
  campaign_id: string
  voter_id: string
  value: string
  type: string
  is_primary: boolean
  source: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  zip_code: string
  created_at: string
  updated_at: string
}

export interface AddressContactCreate {
  value: string
  type: string
  is_primary?: boolean
  source?: string
  address_line1: string
  address_line2?: string
  city: string
  state: string
  zip_code: string
}

export interface VoterContacts {
  phones: PhoneContact[]
  emails: EmailContact[]
  addresses: AddressContact[]
}
