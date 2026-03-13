import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useCallList, useCallListEntries, useAppendFromList } from "@/hooks/useCallLists"
import { useMembers } from "@/hooks/useMembers"
import { useVoterLists } from "@/hooks/useVoterLists"
import { useFormGuard } from "@/hooks/useFormGuard"
import { DataTable } from "@/components/shared/DataTable"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RequireRole } from "@/components/shared/RequireRole"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Phone } from "lucide-react"
import type { CallListEntry } from "@/types/call-list"
import type { CampaignMember } from "@/types/campaign"
import type { ColumnDef } from "@tanstack/react-table"

type StatusVariant = "default" | "success" | "warning" | "error" | "info"
const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}

function resolveCallerName(
  membersById: Map<string, CampaignMember>,
  userId: string,
): string {
  const member = membersById.get(userId)
  return member ? member.display_name : `${userId.slice(0, 12)}...`
}

function resolveCallerRole(
  membersById: Map<string, CampaignMember>,
  userId: string,
): string | null {
  return membersById.get(userId)?.role ?? null
}

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

interface AddTargetsFormValues {
  voter_list_id: string
}

function AddTargetsDialog({
  open,
  onOpenChange,
  campaignId,
  callListId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  callListId: string
}) {
  const form = useForm<AddTargetsFormValues>({
    defaultValues: { voter_list_id: "" },
  })

  useFormGuard({ form })

  const { data: voterLists } = useVoterLists(campaignId)
  const lists = voterLists ?? []

  const appendMutation = useAppendFromList(campaignId, callListId)

  const selectedListId = form.watch("voter_list_id")

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset({ voter_list_id: "" })
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await appendMutation.mutateAsync(values.voter_list_id)
      toast.success(`Added ${result.added} voters (${result.skipped} already present)`)
      handleOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred"
      toast.error(`Failed to add targets: ${message}`)
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Targets</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-targets-voter-list">Voter List</Label>
            <Select
              value={selectedListId}
              onValueChange={(val) =>
                form.setValue("voter_list_id", val, { shouldDirty: true })
              }
            >
              <SelectTrigger id="add-targets-voter-list">
                <SelectValue placeholder="Select a voter list" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((vl) => (
                  <SelectItem key={vl.id} value={vl.id}>
                    {vl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={appendMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedListId || appendMutation.isPending}
            >
              {appendMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CallListDetailPage() {
  const { campaignId, callListId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/call-lists/$callListId",
  })

  const [selectedStatus, setSelectedStatus] = useState("all")
  const [addTargetsOpen, setAddTargetsOpen] = useState(false)

  const { data: callList, isLoading: callListLoading } = useCallList(
    campaignId,
    callListId,
  )
  const { data: entriesData, isLoading: entriesLoading } = useCallListEntries(
    campaignId,
    callListId,
    selectedStatus === "all" ? undefined : selectedStatus,
  )

  const { data: membersData } = useMembers(campaignId)

  const membersById = useMemo(() => {
    const map = new Map<string, CampaignMember>()
    for (const m of membersData?.items ?? []) {
      map.set(m.user_id, m)
    }
    return map
  }, [membersData])

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
      cell: ({ row }) => {
        const claimedBy = row.original.claimed_by
        if (!claimedBy) {
          return <span className="text-muted-foreground">--</span>
        }
        const member = membersById.get(claimedBy)
        if (!member) {
          return (
            <span className="text-muted-foreground">
              {claimedBy.slice(0, 12)}...
            </span>
          )
        }
        return (
          <div className="flex items-center gap-2">
            <span>{member.display_name}</span>
            <StatusBadge
              status={member.role}
              variant={roleVariant[member.role] ?? "default"}
            />
          </div>
        )
      },
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{callList.name}</h1>
          <StatusBadge status={callList.status} />
        </div>
        <RequireRole minimum="manager">
          <Button size="sm" onClick={() => setAddTargetsOpen(true)}>
            + Add Targets
          </Button>
        </RequireRole>
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

      {/* Add Targets Dialog */}
      {addTargetsOpen && (
        <AddTargetsDialog
          open={addTargetsOpen}
          onOpenChange={setAddTargetsOpen}
          campaignId={campaignId}
          callListId={callListId}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/phone-banking/call-lists/$callListId",
)({ component: CallListDetailPage })
