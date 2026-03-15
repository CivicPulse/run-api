import { ClipboardList } from "lucide-react"

export function FieldEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
      <ClipboardList className="h-12 w-12 text-muted-foreground/30" />
      <div className="text-center">
        <h2 className="text-lg font-semibold">No assignment yet</h2>
        <p className="text-sm text-muted-foreground">
          Check with your campaign coordinator
        </p>
      </div>
    </div>
  )
}
