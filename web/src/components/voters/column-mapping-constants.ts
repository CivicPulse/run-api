// Radix UI SelectItem requires a non-empty string value.
// "__skip__" is the internal sentinel that maps to "" (skip) in the parent.
export const SKIP_VALUE = "__skip__"

export const FIELD_GROUPS: Record<string, string[]> = {
  Personal: [
    "first_name", "middle_name", "last_name", "suffix",
    "date_of_birth", "gender", "age",
  ],
  "Registration Address": [
    "registration_line1", "registration_line2", "registration_city",
    "registration_state", "registration_zip", "registration_zip4",
    "registration_county", "registration_apartment_type",
  ],
  "Mailing Address": [
    "mailing_line1", "mailing_line2", "mailing_city",
    "mailing_state", "mailing_zip", "mailing_zip4",
    "mailing_country", "mailing_type",
  ],
  Demographics: [
    "ethnicity", "spoken_language", "marital_status", "military_status",
  ],
  Propensity: [
    "propensity_general", "propensity_primary", "propensity_combined",
  ],
  Household: [
    "household_id", "household_party_registration", "household_size", "family_id",
  ],
  Political: [
    "party", "precinct", "congressional_district",
    "state_senate_district", "state_house_district",
    "registration_date",
  ],
  Other: [
    "source_id", "email", "phone", "cell_phone_confidence",
    "party_change_indicator", "latitude", "longitude", "notes",
    "full_name", "address", "last_vote_date",
  ],
}

export const FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  middle_name: "Middle Name",
  last_name: "Last Name",
  suffix: "Suffix",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  age: "Age",
  registration_line1: "Registration Line 1",
  registration_line2: "Registration Line 2",
  registration_city: "Registration City",
  registration_state: "Registration State",
  registration_zip: "Registration ZIP",
  registration_zip4: "Registration ZIP+4",
  registration_county: "Registration County",
  registration_apartment_type: "Apartment Type",
  mailing_line1: "Mailing Line 1",
  mailing_line2: "Mailing Line 2",
  mailing_city: "Mailing City",
  mailing_state: "Mailing State",
  mailing_zip: "Mailing ZIP",
  mailing_zip4: "Mailing ZIP+4",
  mailing_country: "Mailing Country",
  mailing_type: "Mailing Type",
  ethnicity: "Ethnicity",
  spoken_language: "Language",
  marital_status: "Marital Status",
  military_status: "Military Status",
  propensity_general: "General Propensity",
  propensity_primary: "Primary Propensity",
  propensity_combined: "Combined Propensity",
  household_id: "Household ID",
  household_party_registration: "Household Party Reg.",
  household_size: "Household Size",
  family_id: "Family ID",
  party: "Party",
  precinct: "Precinct",
  congressional_district: "Congressional District",
  state_senate_district: "State Senate District",
  state_house_district: "State House District",
  registration_date: "Registration Date",
  source_id: "Voter ID",
  email: "Email",
  phone: "Phone",
  cell_phone_confidence: "Cell Phone Confidence",
  party_change_indicator: "Party Change Indicator",
  latitude: "Latitude",
  longitude: "Longitude",
  notes: "Notes",
  full_name: "Full Name",
  address: "Address",
  last_vote_date: "Last Vote Date",
}

// Flat array for backward compatibility and validation
export const CANONICAL_FIELDS = Object.values(FIELD_GROUPS).flat()
