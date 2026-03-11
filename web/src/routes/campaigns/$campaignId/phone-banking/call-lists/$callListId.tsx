import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { useCallList, useCallListEntries } from "@/hooks/useCallLists"
import { DataTable } from "@/components/shared/DataTable"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Phone } from "lucide-react"
import type { CallListEntry } from "@/types/call-list"
import type { ColumnDef } from "@tanstack/react-table"

const STATUS_LABELS: Record<string, string> = {
  available: "Unclaimed",
  in_progress: "Claimed",
  completed: "Completed",
  max_attempts: "Skipped",
  terminal: "Error",
}

const FILTER_TABS = [
  { label: "All", value: "all" },
  { label: "Unclaimed", value: "available" },
  { label: "Claimed", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Skipped", value: "max_attempts" },
]

function CallListDetailPage() {
  const { campaignId, callListId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/call-lists/$callListId",
  })

  const [selectedStatus, setSelectedStatus] = useState("all")

  const { data: callList, isLoading: callListLoading } = useCallList(
    campaignId,
    callListId,
  )
  const { data: entriesData, isLoading: entriesLoading } = useCallListEntries(
    campaignId,
    callListId,
    selectedStatus === "all" ? undefined : selectedStatus,
  )

  const entries = entriesData?.items ?? []

  // Compute per-status counts from loaded entries
  const countByStatus = (status: string) =>
    entries.filter((e) => e.status === status).length

  const columns: ColumnDef<CallListEntry, unknown>[] = [
    {
      id: "voter_name",
      header: "Voter Name",
      cell: ({ row }) => (
        <Link
          to="/campaigns/$campaignId/voters/$voterId"
          params={{ campaignId, voterId: row.original.voter_id }}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.voter_name ?? "Unknown"}
        </Link>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: ({ row }) => {
        const primary = row.original.phone_numbers.find((p) => p.is_primary)
        const phone = primary?.value ?? row.original.phone_numbers[0]?.value ?? "—"
        return <span className="text-muted-foreground">{phone}</span>
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const label = STATUS_LABELS[row.original.status] ?? row.original.status
        return <StatusBadge status={label} />
      },
    },
    {
      id: "assigned_caller",
      header: "Assigned Caller",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.claimed_by ?? "—"}
        </span>
      ),
    },
  ]

  if (callListLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-24 rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!callList) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Call list not found.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{callList.name}</h1>
        <StatusBadge status={callList.status} />
      </div>

      {/* Stats row */}
      <div className="flex gap-4 text-sm flex-wrap">
        <div className="flex flex-col items-center rounded-lg border bg-card px-4 py-2">
          <span className="text-2xl font-semibold">{callList.total_entries}</span>
          <span className="text-muted-foreground">Total</span>
        </div>
        {entriesLoading ? (
          <>
            {["Unclaimed", "Claimed", "Completed", "Skipped"].map((label) => (
              <div
                key={label}
                className="flex flex-col items-center rounded-lg border bg-card px-4 py-2"
              >
                <Skeleton className="h-8 w-8 mb-1" />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center rounded-lg border bg-card px-4 py-2">
              <span className="text-2xl font-semibold">
                {countByStatus("available")}
              </span>
              <span className="text-muted-foreground">Unclaimed</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border bg-card px-4 py-2">
              <span className="text-2xl font-semibold">
                {countByStatus("in_progress")}
              </span>
              <span className="text-muted-foreground">Claimed</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border bg-card px-4 py-2">
              <span className="text-2xl font-semibold">
                {countByStatus("completed")}
              </span>
              <span className="text-muted-foreground">Completed</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border bg-card px-4 py-2">
              <span className="text-2xl font-semibold">
                {countByStatus("max_attempts")}
              </span>
              <span className="text-muted-foreground">Skipped</span>
            </div>
          </>
        )}
      </div>

      {/* Status filter tabs */}
      <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
        <TabsList>
          {FILTER_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Entries DataTable */}
      <DataTable
        columns={columns}
        data={entries}
        isLoading={entriesLoading}
        emptyIcon={Phone}
        emptyTitle={
          selectedStatus === "all"
            ? "This call list has no entries"
            : "No entries with this status"
        }
        emptyDescription={
          selectedStatus === "all"
            ? "Entries will appear here once the call list is populated."
            : "Try a different filter to see more entries."
        }
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/phone-banking/call-lists/$callListId",
)({ component: CallListDetailPage })
