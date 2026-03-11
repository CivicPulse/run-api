import { CheckCircle2, AlertTriangle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { ImportTemplate } from "@/types/import-job"

// Radix UI SelectItem requires a non-empty string value.
// "__skip__" is the internal sentinel that maps to "" (skip) in the parent.
export const SKIP_VALUE = "__skip__"

export const CANONICAL_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "county",
  "precinct",
  "party",
  "gender",
  "date_of_birth",
  "age",
  "voter_id",
  "registration_date",
  "last_vote_date",
  "notes",
  "congressional_district",
  "state_senate_district",
  "state_house_district",
  "latitude",
  "longitude",
] as const

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
                  {CANONICAL_FIELDS.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
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
