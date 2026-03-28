import { ClipboardList } from "lucide-react"

export function FieldEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <ClipboardList className="h-16 w-16 text-muted-foreground/40" />
      <div className="text-center">
        <h2 className="text-xl font-bold">No assignment yet</h2>
        <p className="text-sm text-muted-foreground">
          Your organizer will assign you a list soon. Pull down to refresh.
        </p>
      </div>
    </div>
  )
}
