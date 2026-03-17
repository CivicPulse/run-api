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
import { SKIP_VALUE, FIELD_GROUPS, FIELD_LABELS } from "./column-mapping-constants"

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
