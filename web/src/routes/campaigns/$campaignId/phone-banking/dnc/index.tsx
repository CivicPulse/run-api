import { createFileRoute, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Ban } from "lucide-react"
import { toast } from "sonner"
import { useDNCEntries, useAddDNCEntry, useDeleteDNCEntry, useImportDNC } from "@/hooks/useDNC"
import { useFormGuard } from "@/hooks/useFormGuard"
import { DataTable } from "@/components/shared/DataTable"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import type { DNCEntry } from "@/types/dnc"
import type { ColumnDef } from "@tanstack/react-table"

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

  const form = useForm<AddFormValues>({
    defaultValues: { phone_number: "", reason: "" },
  })
  useFormGuard({ form })

  const entries = data ?? []
  const filteredEntries = search
    ? entries.filter(e => e.phone_number.includes(search.replace(/\D/g, "")))
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
      const result = await importMutation.mutateAsync(importFile)
      let msg = `Imported ${result.added} numbers.`
      if (result.skipped > 0) msg += ` ${result.skipped} duplicates skipped.`
      if (result.invalid > 0) msg += ` ${result.invalid} invalid entries ignored.`
      toast.success(msg)
      setImportOpen(false)
      setImportFile(null)
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
      accessorKey: "added_at",
      header: "Date Added",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.added_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">DNC List</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)}>Add Number</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Import from file
          </Button>
        </div>
      </div>

      {/* Search input */}
      <Input
        placeholder="Search phone numbers..."
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
        if (!open) setImportFile(null)
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setImportOpen(false); setImportFile(null) }}
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
