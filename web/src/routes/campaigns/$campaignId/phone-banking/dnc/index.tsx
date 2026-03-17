import { createFileRoute, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Ban } from "lucide-react"
import { toast } from "sonner"
import { useDNCEntries, useAddDNCEntry, useDeleteDNCEntry, useImportDNC } from "@/hooks/useDNC"
import { useFormGuard } from "@/hooks/useFormGuard"
import { usePermissions } from "@/hooks/usePermissions"
import { DataTable } from "@/components/shared/DataTable"
import { RequireRole } from "@/components/shared/RequireRole"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { DNCEntry } from "@/types/dnc"
import type { ColumnDef } from "@tanstack/react-table"

const REASON_LABELS: Record<string, string> = {
  refused: "Refused",
  voter_request: "Voter Request",
  registry_import: "Registry Import",
  manual: "Manual",
}

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking/dnc/")({
  component: DNCListPage,
})

interface AddFormValues {
  phone_number: string
  reason?: string
}

function DNCListPage() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/phone-banking/dnc/" })
  const { data, isLoading } = useDNCEntries(campaignId)
  const addMutation = useAddDNCEntry(campaignId)
  const deleteMutation = useDeleteDNCEntry(campaignId)
  const importMutation = useImportDNC(campaignId)

  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importReason, setImportReason] = useState("manual")

  const { hasRole } = usePermissions()
  const isManager = hasRole("manager")

  const form = useForm<AddFormValues>({
    defaultValues: { phone_number: "", reason: "" },
  })
  useFormGuard({ form })

  const entries = data ?? []
  const filteredEntries = search
    ? entries.filter((e) => {
        const normalizedSearch = search.toLowerCase()
        const phoneMatch = e.phone_number.includes(search.replace(/\D/g, ""))
        const reasonLabel = REASON_LABELS[e.reason] ?? e.reason
        const reasonMatch = reasonLabel.toLowerCase().includes(normalizedSearch)
        return phoneMatch || reasonMatch
      })
    : entries

  function handleRemove(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Number removed from DNC list"),
      onError: () => toast.error("Failed to remove number"),
    })
  }

  async function handleAddSubmit(values: AddFormValues) {
    try {
      await addMutation.mutateAsync({
        phone_number: values.phone_number.trim(),
        reason: values.reason || undefined,
      })
      toast.success("Number added to DNC list")
      setAddOpen(false)
      form.reset()
    } catch {
      toast.error("Failed to add number")
    }
  }

  async function handleImport() {
    if (!importFile) return
    try {
      const result = await importMutation.mutateAsync({ file: importFile, reason: importReason })
      let msg = `Imported ${result.added} numbers.`
      if (result.skipped > 0) msg += ` ${result.skipped} duplicates skipped.`
      if (result.invalid > 0) msg += ` ${result.invalid} invalid entries ignored.`
      toast.success(msg)
      setImportOpen(false)
      setImportFile(null)
      setImportReason("manual")
    } catch {
      toast.error("Import failed. Check your file format.")
    }
  }

  const columns: ColumnDef<DNCEntry>[] = [
    {
      accessorKey: "phone_number",
      header: "Phone Number",
      cell: ({ row }) => <span className="font-mono">{row.original.phone_number}</span>,
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm">
          {REASON_LABELS[row.original.reason] ?? row.original.reason}
        </span>
      ),
    },
    {
      accessorKey: "added_at",
      header: "Date Added",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.added_at).toLocaleDateString()}
        </span>
      ),
    },
    ...(isManager
      ? [
          {
            id: "actions",
            cell: ({ row }: { row: { original: DNCEntry } }) => (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => handleRemove(row.original.id)}
              >
                Remove
              </Button>
            ),
          },
        ]
      : []),
  ] as ColumnDef<DNCEntry>[]

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const emptyTitle = search ? "No numbers match your search" : "No DNC entries"
  const emptyDescription = search
    ? "Try a different search term."
    : "Add phone numbers to prevent them from being called."

  return (
    <div className="p-6 space-y-4">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">DNC List</h1>
        <div className="flex items-center gap-2">
          <RequireRole minimum="manager">
            <Button onClick={() => setAddOpen(true)}>Add Number</Button>
          </RequireRole>
          <RequireRole minimum="manager">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Import from file
            </Button>
          </RequireRole>
        </div>
      </div>

      {/* Search input */}
      <Input
        placeholder="Search phone numbers or reasons..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* DNC table */}
      <DataTable
        columns={columns}
        data={filteredEntries}
        emptyIcon={Ban}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />

      {/* Add Number Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => {
        setAddOpen(open)
        if (!open) form.reset()
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Number to DNC List</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleAddSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone number *</Label>
              <Input
                id="phone_number"
                {...form.register("phone_number", { required: true })}
                placeholder="e.g. 555-123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                {...form.register("reason")}
                placeholder="e.g. Requested removal"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setAddOpen(false); form.reset() }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Adding..." : "Add Number"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import from File Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => {
        setImportOpen(open)
        if (!open) { setImportFile(null); setImportReason("manual") }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import DNC Numbers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-file">CSV or text file</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.txt"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-sm text-muted-foreground">
                CSV file with one phone number per row. Headers optional.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-reason">Reason for all entries</Label>
              <Select value={importReason} onValueChange={setImportReason}>
                <SelectTrigger id="import-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voter_request">Voter Request</SelectItem>
                  <SelectItem value="registry_import">Registry Import</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                "Refused" is auto-applied by the system on call refusal.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setImportOpen(false); setImportFile(null); setImportReason("manual") }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!importFile || importMutation.isPending}
              onClick={handleImport}
            >
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
