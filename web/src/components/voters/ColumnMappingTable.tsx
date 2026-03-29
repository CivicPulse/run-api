import { CheckCircle2, AlertTriangle, Info, Sparkles } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import type { FieldMapping, ImportTemplate } from "@/types/import-job"
import { SKIP_VALUE, FIELD_GROUPS, FIELD_LABELS } from "./column-mapping-constants"

interface ColumnMappingTableProps {
  columns: string[]
  suggestedMapping: Record<string, FieldMapping>
  mapping: Record<string, string>
  onMappingChange: (col: string, field: string) => void
  formatDetected?: "l2" | "generic" | null
  templates?: ImportTemplate[]
}

export function ColumnMappingTable({
  columns,
  suggestedMapping,
  mapping,
  onMappingChange,
  formatDetected,
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
      {formatDetected === "l2" && (
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            L2 voter file detected — columns auto-mapped
          </AlertDescription>
        </Alert>
      )}
      {columns.map((col) => {
        const suggestedEntry = suggestedMapping[col]
        const suggestedField = suggestedEntry?.field ?? null
        const matchType = suggestedEntry?.match_type ?? null
        // External mapping uses "" for skip; internally map "" ↔ SKIP_VALUE
        const externalValue = mapping[col] ?? ""
        const selectValue = externalValue === "" ? SKIP_VALUE : externalValue
        const isChanged = externalValue !== (suggestedField ?? "")

        // Badge based on match_type when unchanged from suggestion
        const showExactBadge = !isChanged && matchType === "exact" && suggestedField != null
        const showFuzzyBadge = !isChanged && matchType === "fuzzy" && suggestedField != null
        const showUnmappedBadge = !isChanged && suggestedField == null

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
              {showExactBadge && (
                <span className="flex items-center gap-1 text-xs text-status-success-foreground" aria-label="Exact match — auto-mapped">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">auto</span>
                </span>
              )}
              {showFuzzyBadge && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" aria-label="Fuzzy match — review suggested">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">fuzzy</span>
                </span>
              )}
              {showUnmappedBadge && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning-foreground" aria-label="No suggestion available" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
