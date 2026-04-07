import { ShieldAlert } from "lucide-react"

export function DncBlockBanner() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="text-sm font-medium">On Do Not Call List</p>
        <p className="text-sm text-muted-foreground">
          This number is on the DNC list and cannot be called.
        </p>
      </div>
    </div>
  )
}
