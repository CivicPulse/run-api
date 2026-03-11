import { useState } from "react"
import { createFileRoute, useParams, Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { Users } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/shared/DataTable"
import { RequireRole } from "@/components/shared/RequireRole"
import { VoterFilterBuilder } from "@/components/voters/VoterFilterBuilder"
import { AddVotersDialog } from "@/components/voters/AddVotersDialog"
import {
  useVoterList,
  useVoterListVoters,
  useUpdateVoterList,
  useRemoveListMembers,
} from "@/hooks/useVoterLists"
import type { Voter, VoterFilter } from "@/types/voter"

function ListDetailPage() {
  const { campaignId, listId } = useParams({
    from: "/campaigns/$campaignId/voters/lists/$listId",
  })

  const { data: list, isLoading: listLoading } = useVoterList(campaignId, listId)
  const { data: membersData, isLoading: membersLoading } = useVoterListVoters(
    campaignId,
    listId,
  )

  const updateMutation = useUpdateVoterList(campaignId, listId)
  const removeMembersMutation = useRemoveListMembers(campaignId, listId)

  // Add voters dialog (static lists only)
  const [addVotersOpen, setAddVotersOpen] = useState(false)

  // Edit filters dialog (dynamic lists only)
  const [editFiltersOpen, setEditFiltersOpen] = useState(false)
  const [editFilters, setEditFilters] = useState<VoterFilter>({})

  const handleEditFiltersOpen = () => {
    if (!list) return
    setEditFilters(
      list.filter_query ? (JSON.parse(list.filter_query) as VoterFilter) : {},
    )
    setEditFiltersOpen(true)
  }

  const handleEditFiltersSave = async () => {
    try {
      await updateMutation.mutateAsync({
        filter_query: JSON.stringify(editFilters),
      })
      toast.success("Filters updated")
      setEditFiltersOpen(false)
    } catch {
      toast.error("Failed to update filters")
    }
  }

  const handleRemoveVoter = async (voterId: string) => {
    try {
      await removeMembersMutation.mutateAsync({ voter_ids: [voterId] })
      toast.success("Voter removed from list")
    } catch {
      toast.error("Failed to remove voter")
    }
  }

  const members: Voter[] = membersData?.items ?? []

  // Parse filter criteria for display
  const parsedFilters: VoterFilter =
    list?.filter_query ? (JSON.parse(list.filter_query) as VoterFilter) : {}

  const filterChips = Object.entries(parsedFilters).filter(
    ([, val]) => val !== undefined && val !== null && (!Array.isArray(val) || val.length > 0),
  )

  const memberColumns: ColumnDef<Voter, unknown>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const voter = row.original
        const name =
          [voter.first_name, voter.last_name].filter(Boolean).join(" ") ||
          "Unknown"
        return (
          <Link
            to="/campaigns/$campaignId/voters/$voterId"
            params={{ campaignId, voterId: voter.id }}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {name}
          </Link>
        )
      },
    },
    {
      accessorKey: "party",
      header: "Party",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.party ?? "-"}</span>
      ),
    },
    {
      accessorKey: "city",
      header: "City",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.city ?? "-"}</span>
      ),
    },
    ...(list?.list_type === "static"
      ? [
          {
            id: "remove",
            header: "",
            cell: ({ row }: { row: { original: Voter } }) => (
              <RequireRole minimum="manager">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveVoter(row.original.id)
                  }}
                  disabled={removeMembersMutation.isPending}
                >
                  Remove
                </Button>
              </RequireRole>
            ),
          } as ColumnDef<Voter, unknown>,
        ]
      : []),
  ]

  if (listLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    )
  }

  if (!list) {
    return (
      <div className="text-center py-12 text-muted-foreground">List not found.</div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{list.name}</h2>
          <Badge variant={list.list_type === "dynamic" ? "default" : "secondary"}>
            {list.list_type === "dynamic" ? "Dynamic" : "Static"}
          </Badge>
        </div>

        <RequireRole minimum="manager">
          {list.list_type === "static" ? (
            <Button size="sm" onClick={() => setAddVotersOpen(true)}>
              + Add Voters
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleEditFiltersOpen}>
              Edit Filters
            </Button>
          )}
        </RequireRole>
      </div>

      {/* Dynamic list: filter criteria summary */}
      {list.list_type === "dynamic" && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Filter Criteria
          </p>
          {filterChips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filters set — matches all voters.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filterChips.map(([key, val]) => {
                const display = Array.isArray(val) ? val.join(", ") : String(val)
                return (
                  <Badge key={key} variant="secondary">
                    {key}: {display}
                  </Badge>
                )
              })}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {(list as typeof list & { voter_count?: number }).voter_count ?? members.length} members
          </p>
        </div>
      )}

      {/* Member table */}
      <DataTable
        columns={memberColumns}
        data={members}
        isLoading={membersLoading}
        emptyIcon={Users}
        emptyTitle="No members yet"
        emptyDescription={
          list.list_type === "static"
            ? "Add voters to get started."
            : "No voters match the current filter criteria."
        }
      />

      {/* Add Voters Dialog (static lists only) */}
      {list.list_type === "static" && (
        <AddVotersDialog
          campaignId={campaignId}
          listId={listId}
          open={addVotersOpen}
          onOpenChange={setAddVotersOpen}
        />
      )}

      {/* Edit Filters Dialog (dynamic lists only) */}
      <Dialog open={editFiltersOpen} onOpenChange={setEditFiltersOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Filter Criteria</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <VoterFilterBuilder
              value={editFilters}
              onChange={setEditFilters}
              campaignId={campaignId}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditFiltersOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEditFiltersSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Filters"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/lists/$listId")({
  component: ListDetailPage,
})
