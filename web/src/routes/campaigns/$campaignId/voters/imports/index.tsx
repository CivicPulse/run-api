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
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RequireRole } from "@/components/shared/RequireRole"
import { useImports } from "@/hooks/useImports"
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

  const columns: ColumnDef<ImportJob>[] = [
    {
      accessorKey: "filename",
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
      accessorKey: "error_count",
      header: "Errors",
    },
    {
      accessorKey: "phones_created",
      header: "Phones",
      cell: ({ row }) => {
        const count = row.original.phones_created
        if (count === null) return <span className="text-muted-foreground">{"\u2014"}</span>
        if (count === 0) return null
        return <span className="font-medium text-blue-600">{count.toLocaleString()}</span>
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
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
                    search: { jobId: job.id },
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
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <RequireRole minimum="admin">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Import History</h2>
          <Button
            onClick={() =>
              navigate({
                to: "/campaigns/$campaignId/voters/imports/new",
                params: { campaignId },
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
            description="Upload a CSV file to import voter data into your campaign"
            action={
              <Button
                onClick={() =>
                  navigate({
                    to: "/campaigns/$campaignId/voters/imports/new",
                    params: { campaignId },
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
      </div>
    </RequireRole>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/imports/")({
  component: ImportsHistoryPage,
})
