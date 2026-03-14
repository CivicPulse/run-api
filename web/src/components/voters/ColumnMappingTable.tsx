import { CheckCircle2, AlertTriangle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { ImportTemplate } from "@/types/import-job"

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

interface ColumnMappingTableProps {
  columns: string[]
  suggestedMapping: Record<string, string | null>
  mapping: Record<string, string>
  onMappingChange: (col: string, field: string) => void
  templates?: ImportTemplate[]
}

export function ColumnMappingTable({
  columns,
  suggestedMapping,
  mapping,
  onMappingChange,
}: ColumnMappingTableProps) {
  if (columns.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {columns.map((col) => {
        const suggested = suggestedMapping[col]
        // External mapping uses "" for skip; internally map "" ↔ SKIP_VALUE
        const externalValue = mapping[col] ?? ""
        const selectValue = externalValue === "" ? SKIP_VALUE : externalValue
        const isChanged = externalValue !== (suggested ?? "")
        const badge =
          !isChanged && suggested != null ? "green" :
          !isChanged && suggested == null ? "yellow" :
          null

        return (
          <div key={col} className="flex items-center gap-4 rounded-md border p-3">
            <span className="w-1/3 truncate text-sm font-medium">{col}</span>
            <div className="flex flex-1 items-center gap-2">
              <Select
                value={selectValue}
                onValueChange={(value) => {
                  // Translate SKIP_VALUE back to "" for the parent
                  onMappingChange(col, value === SKIP_VALUE ? "" : value)
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SKIP_VALUE}>(skip)</SelectItem>
                  {Object.entries(FIELD_GROUPS).map(([group, fields]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {fields.map((field) => (
                        <SelectItem key={field} value={field}>
                          {FIELD_LABELS[field] ?? field}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {badge === "green" && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" aria-label="High confidence match" />
              )}
              {badge === "yellow" && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" aria-label="No suggestion available" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
