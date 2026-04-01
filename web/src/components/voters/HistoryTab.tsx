import { useState } from "react"
import { MessageSquare, MoreVertical, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { HTTPError } from "ky"
import { formatEventType } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import {
  useVoterInteractions,
  useCreateInteraction,
  useUpdateInteraction,
  useDeleteInteraction,
} from "@/hooks/useVoters"

interface HistoryTabProps {
  campaignId: string
  voterId: string
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function HistoryTab({ campaignId, voterId }: HistoryTabProps) {
  const [noteText, setNoteText] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: interactionsData, isLoading } = useVoterInteractions(campaignId, voterId)
  const createInteraction = useCreateInteraction(campaignId, voterId)
  const updateInteraction = useUpdateInteraction(campaignId, voterId)
  const deleteInteraction = useDeleteInteraction(campaignId, voterId)

  const interactions = [...(interactionsData?.items ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  function startEdit(interaction: { id: string; payload: Record<string, unknown> }) {
    setEditingId(interaction.id)
    setEditText(typeof interaction.payload?.text === "string" ? interaction.payload.text : "")
  }

  async function handleAddNote() {
    const text = noteText.trim()
    if (!text) return
    try {
      await createInteraction.mutateAsync({ type: "note", payload: { text } })
      setNoteText("")
      toast.success("Note added")
    } catch (err) {
      let detail: string | null = null
      if (err instanceof HTTPError) {
        try {
          const body = await err.response.json()
          detail = body.detail
        } catch {
          // response not JSON
        }
      }
      toast.error(detail || "Failed to add note")
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !editText.trim()) return
    try {
      await updateInteraction.mutateAsync({
        interactionId: editingId,
        payload: { text: editText.trim() },
      })
      setEditingId(null)
      setEditText("")
      toast.success("Note updated")
    } catch (err) {
      let detail: string | null = null
      if (err instanceof HTTPError) {
        try {
          const body = await err.response.json()
          detail = body.detail
        } catch {
          // response not JSON
        }
      }
      toast.error(detail || "Failed to update note")
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    try {
      await deleteInteraction.mutateAsync(deletingId)
      setDeletingId(null)
      toast.success("Note deleted")
    } catch (err) {
      let detail: string | null = null
      if (err instanceof HTTPError) {
        try {
          const body = await err.response.json()
          detail = body.detail
        } catch {
          // response not JSON
        }
      }
      toast.error(detail || "Failed to delete note")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">Add a Note</h3>
        <div className="space-y-2">
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            rows={3}
            disabled={createInteraction.isPending}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!noteText.trim() || createInteraction.isPending}
            >
              {createInteraction.isPending ? "Adding..." : "Add Note"}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Interaction History</h3>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : interactions.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No interactions yet"
            description="Add the first interaction above."
            className="py-6"
          />
        ) : (
          <div className="space-y-3">
            {interactions.map((interaction) => (
              <div
                key={interaction.id}
                className="border rounded-lg p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {formatEventType(interaction.type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(interaction.created_at)}
                    </span>
                  </div>
                  {interaction.type === "note" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                        >
                          <MoreVertical className="h-3 w-3" />
                          <span className="sr-only">Note actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startEdit(interaction)}>
                          <Pencil className="mr-2 h-3 w-3" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletingId(interaction.id)}
                        >
                          <Trash2 className="mr-2 h-3 w-3" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {typeof interaction.payload?.text === "string" && (
                  <p className="text-sm text-foreground">
                    {interaction.payload.text}
                  </p>
                )}
                {interaction.created_by && (
                  <p className="text-xs text-muted-foreground">
                    by {interaction.created_by_name || interaction.created_by}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!editingId}
        onOpenChange={(open) => {
          if (!open) {
            setEditingId(null)
            setEditText("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-note-text">Note text</Label>
            <Textarea
              id="edit-note-text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              disabled={updateInteraction.isPending}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null)
                setEditText("")
              }}
              disabled={updateInteraction.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editText.trim() || updateInteraction.isPending}
            >
              {updateInteraction.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title="Delete Note"
        description="Are you sure you want to delete this note? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteInteraction.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
