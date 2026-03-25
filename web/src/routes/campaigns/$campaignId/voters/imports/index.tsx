import { useState, useMemo } from "react"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { MoreHorizontal, Upload } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable } from "@/components/shared/DataTable"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RequireRole } from "@/components/shared/RequireRole"
import { useImports, useDeleteImport } from "@/hooks/useImports"
import type { ImportJob, ImportStatus } from "@/types/import-job"

// ---------------------------------------------------------------------------
// Status → badge variant
// ---------------------------------------------------------------------------
function importStatusVariant(status: ImportStatus | string) {
  switch (status) {
    case "completed":
      return "success" as const
    case "failed":
      return "error" as const
    case "processing":
    case "queued":
      return "info" as const
    case "pending":
    default:
      return "default" as const
  }
}

// ---------------------------------------------------------------------------
// ImportsHistoryPage
// ---------------------------------------------------------------------------
function ImportsHistoryPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/voters/imports/",
  })
  const navigate = useNavigate()

  const { data, isLoading } = useImports(campaignId)
  const items = data?.items ?? []

  // Delete dialog state
  const [deleteJob, setDeleteJob] = useState<ImportJob | null>(null)
  const deleteImport = useDeleteImport(campaignId)

  const handleDelete = async () => {
    if (!deleteJob) return
    await deleteImport.mutateAsync(deleteJob.id).catch(() => {})
    setDeleteJob(null)
  }

  const columns: ColumnDef<ImportJob>[] = useMemo(() => [
    {
      accessorKey: "original_filename",
      header: "Filename",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          variant={importStatusVariant(row.original.status)}
        />
      ),
    },
    {
      accessorKey: "imported_rows",
      header: "Imported",
    },
    {
      accessorKey: "phones_created",
      header: "Phones",
      cell: ({ row }) => {
        const count = row.original.phones_created
        if (count === null) return <span className="text-muted-foreground">{"\u2014"}</span>
        if (count === 0) return null
        return <span className="font-medium text-status-info-foreground">{count.toLocaleString()}</span>
      },
    },
    {
      accessorKey: "created_at",
      header: "Started",
      cell: ({ row }) =>
        new Date(row.original.created_at).toLocaleDateString(),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const job = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 min-h-11 min-w-11 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  navigate({
                    to: "/campaigns/$campaignId/voters/imports/new",
                    params: { campaignId },
                    search: { jobId: job.id, step: 1 },
                  })
                }
              >
                View details
              </DropdownMenuItem>
              {job.error_report_key && (
                <DropdownMenuItem disabled>
                  Download error report
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteJob(job)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [campaignId, navigate])

  return (
    <RequireRole minimum="admin">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Import History</h1>
          <Button
            onClick={() =>
              navigate({
                to: "/campaigns/$campaignId/voters/imports/new",
                params: { campaignId },
                search: { jobId: "", step: 1 },
              })
            }
          >
            New Import
          </Button>
        </div>
        {!isLoading && items.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="No imports yet"
            description="Import a CSV file to add voters to your campaign."
            action={
              <Button
                onClick={() =>
                  navigate({
                    to: "/campaigns/$campaignId/voters/imports/new",
                    params: { campaignId },
                    search: { jobId: "", step: 1 },
                  })
                }
              >
                Start your first import
              </Button>
            }
          />
        ) : (
          <DataTable columns={columns} data={items} isLoading={isLoading} />
        )}

        {/* Delete Import Dialog */}
        <DestructiveConfirmDialog
          open={!!deleteJob}
          onOpenChange={(open) => {
            if (!open) setDeleteJob(null)
          }}
          title={`Delete import "${deleteJob?.original_filename ?? "import"}"?`}
          description="This will permanently remove the import record. Voters already imported will not be affected."
          confirmText={deleteJob?.original_filename ?? ""}
          onConfirm={handleDelete}
          isPending={deleteImport.isPending}
        />
      </div>
    </RequireRole>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/imports/")({
  component: ImportsHistoryPage,
})
