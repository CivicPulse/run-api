import { useState } from "react"
import { MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/shared/EmptyState"
import { useVoterInteractions, useCreateInteraction } from "@/hooks/useVoters"

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

  const { data: interactionsData, isLoading } = useVoterInteractions(campaignId, voterId)
  const createInteraction = useCreateInteraction(campaignId, voterId)

  const interactions = [...(interactionsData?.items ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  async function handleAddNote() {
    const text = noteText.trim()
    if (!text) return
    try {
      await createInteraction.mutateAsync({ type: "note", payload: { text } })
      setNoteText("")
      toast.success("Note added")
    } catch {
      toast.error("Failed to add note")
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
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {interaction.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(interaction.created_at)}
                  </span>
                </div>
                {typeof interaction.payload?.text === "string" && (
                  <p className="text-sm text-foreground">{interaction.payload.text}</p>
                )}
                {interaction.created_by && (
                  <p className="text-xs text-muted-foreground">by {interaction.created_by}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
