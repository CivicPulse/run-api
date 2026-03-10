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
