import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"
import { useWalkList, useWalkListEntries, useListCanvassers, useAssignCanvasser, useRemoveCanvasser, useDeleteWalkList, useRenameWalkList } from "@/hooks/useWalkLists"
import { useCurrentUser } from "@/hooks/useUsers"
import { CanvasserAssignDialog } from "@/components/canvassing/CanvasserAssignDialog"
import { DoorKnockDialog } from "@/components/canvassing/DoorKnockDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ArrowLeft, ClipboardList, ExternalLink, Pencil, Plus, Trash2, UserMinus, Users } from "lucide-react"
import { useState } from "react"

function WalkListDetailPage() {
  const { campaignId, walkListId } = useParams({
    from: "/campaigns/$campaignId/canvassing/walk-lists/$walkListId",
  })
  const navigate = useNavigate()
  const { data: walkList, isLoading } = useWalkList(campaignId, walkListId)
  const { data: entriesData, isLoading: entriesLoading } = useWalkListEntries(campaignId, walkListId)
  const { data: canvassers } = useListCanvassers(campaignId, walkListId)
  const { data: currentUser } = useCurrentUser()
  const assignCanvasser = useAssignCanvasser(campaignId, walkListId)
  const removeCanvasser = useRemoveCanvasser(campaignId, walkListId)
  const deleteWalkList = useDeleteWalkList(campaignId)
  const renameWalkList = useRenameWalkList(campaignId)

  const entries = entriesData?.items ?? []

  const [assignOpen, setAssignOpen] = useState(false)
  const [doorKnockEntryId, setDoorKnockEntryId] = useState<string | null>(null)
  const [doorKnockVoterId, setDoorKnockVoterId] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [removeUserId, setRemoveUserId] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")

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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Rename walk list"
            onClick={() => {
              setRenameValue(walkList.name)
              setRenameOpen(true)
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
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
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!currentUser || assignCanvasser.isPending}
              onClick={() => {
                if (currentUser) {
                  assignCanvasser.mutate({ user_id: currentUser.id })
                }
              }}
            >
              Assign Me
            </Button>
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Assign
            </Button>
          </div>
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

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRenameOpen(false)
            setRenameValue("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Walk List</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-detail-input">Name</Label>
            <Input
              id="rename-detail-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              disabled={renameWalkList.isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) {
                  renameWalkList.mutate(
                    { walkListId: walkListId, name: renameValue.trim() },
                    { onSuccess: () => { setRenameOpen(false); setRenameValue("") } },
                  )
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRenameOpen(false); setRenameValue("") }}
              disabled={renameWalkList.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameValue.trim()) {
                  renameWalkList.mutate(
                    { walkListId: walkListId, name: renameValue.trim() },
                    { onSuccess: () => { setRenameOpen(false); setRenameValue("") } },
                  )
                }
              }}
              disabled={!renameValue.trim() || renameWalkList.isPending}
            >
              {renameWalkList.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/canvassing/walk-lists/$walkListId",
)({
  component: WalkListDetailPage,
})
