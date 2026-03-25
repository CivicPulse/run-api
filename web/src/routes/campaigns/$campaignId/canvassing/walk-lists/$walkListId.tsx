import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"
import { useWalkList, useWalkListEntries, useListCanvassers, useRemoveCanvasser, useDeleteWalkList } from "@/hooks/useWalkLists"
import { CanvasserAssignDialog } from "@/components/canvassing/CanvasserAssignDialog"
import { DoorKnockDialog } from "@/components/canvassing/DoorKnockDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, ClipboardList, ExternalLink, Plus, Trash2, UserMinus, Users } from "lucide-react"
import { useState } from "react"

function WalkListDetailPage() {
  const { campaignId, walkListId } = useParams({
    from: "/campaigns/$campaignId/canvassing/walk-lists/$walkListId",
  })
  const navigate = useNavigate()
  const { data: walkList, isLoading } = useWalkList(campaignId, walkListId)
  const { data: entriesData, isLoading: entriesLoading } = useWalkListEntries(campaignId, walkListId)
  const { data: canvassers } = useListCanvassers(campaignId, walkListId)
  const removeCanvasser = useRemoveCanvasser(campaignId, walkListId)
  const deleteWalkList = useDeleteWalkList(campaignId)

  const entries = entriesData?.items ?? []

  const [assignOpen, setAssignOpen] = useState(false)
  const [doorKnockEntryId, setDoorKnockEntryId] = useState<string | null>(null)
  const [doorKnockVoterId, setDoorKnockVoterId] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [removeUserId, setRemoveUserId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!walkList) {
    return <p className="text-sm text-muted-foreground">Walk list not found.</p>
  }

  const progress =
    walkList.total_entries > 0
      ? Math.round((walkList.visited_entries / walkList.total_entries) * 100)
      : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Back to canvassing" onClick={() => navigate({ to: `/campaigns/${campaignId}/canvassing` })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">{walkList.name}</h1>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Progress: {walkList.visited_entries}/{walkList.total_entries} ({progress}%)</span>
        <div className="h-2 w-32 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Canvassers Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-medium flex items-center gap-2">
            <Users className="h-4 w-4" /> Canvassers
          </h3>
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Assign
          </Button>
        </div>
        {canvassers && canvassers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {canvassers.map((c) => (
              <Badge key={c.user_id} variant="secondary" className="gap-1">
                {c.user_id}
                <button
                  onClick={() => setRemoveUserId(c.user_id)}
                  className="ml-1 rounded-full hover:bg-destructive/20"
                >
                  <UserMinus className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No canvassers assigned.</p>
        )}
      </section>

      {/* Entries Table */}
      <section className="space-y-3">
        <h3 className="text-md font-medium">Entries</h3>
        {entriesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No entries"
            description="This walk list has no entries yet."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Household</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.sequence}</TableCell>
                  <TableCell>{entry.household_key ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {entry.household_key && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(entry.household_key)}&travelmode=walking`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        aria-label={`View ${entry.household_key} on map`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDoorKnockEntryId(entry.id)
                        setDoorKnockVoterId(entry.voter_id)
                      }}
                    >
                      Knock
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <CanvasserAssignDialog
        campaignId={campaignId}
        walkListId={walkListId}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />

      {doorKnockEntryId && doorKnockVoterId && (
        <DoorKnockDialog
          campaignId={campaignId}
          walkListId={walkListId}
          entryId={doorKnockEntryId}
          voterId={doorKnockVoterId}
          open={!!doorKnockEntryId}
          onOpenChange={(open) => { if (!open) { setDoorKnockEntryId(null); setDoorKnockVoterId(null) } }}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Walk List"
        description="Are you sure? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteWalkList.isPending}
        onConfirm={() =>
          deleteWalkList.mutate(walkListId, {
            onSuccess: () => navigate({ to: `/campaigns/${campaignId}/canvassing` }),
          })
        }
      />

      <ConfirmDialog
        open={!!removeUserId}
        onOpenChange={(open) => { if (!open) setRemoveUserId(null) }}
        title="Remove Canvasser"
        description="Remove this canvasser from the walk list?"
        confirmLabel="Remove"
        variant="destructive"
        isPending={removeCanvasser.isPending}
        onConfirm={() => {
          if (removeUserId) {
            removeCanvasser.mutate(removeUserId, { onSuccess: () => setRemoveUserId(null) })
          }
        }}
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/canvassing/walk-lists/$walkListId",
)({
  component: WalkListDetailPage,
})
