import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useVoters } from "@/hooks/useVoters"
import { useAddListMembers } from "@/hooks/useVoterLists"
import type { Voter } from "@/types/voter"

interface AddVotersDialogProps {
  campaignId: string
  listId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export function AddVotersDialog({
  campaignId,
  listId,
  open,
  onOpenChange,
}: AddVotersDialogProps) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string[]>([])

  const debouncedSearch = useDebounce(search, 300)

  const { data: searchData } = useVoters(campaignId, { search: debouncedSearch })

  // Take results from the first page only (max 20)
  const results: Voter[] = (searchData?.pages[0]?.items ?? []).slice(0, 20)

  const addMembers = useAddListMembers(campaignId, listId)

  const handleToggle = (voterId: string) => {
    setSelected((prev) =>
      prev.includes(voterId) ? prev.filter((id) => id !== voterId) : [...prev, voterId],
    )
  }

  const handleAdd = async () => {
    if (selected.length === 0) return
    try {
      await addMembers.mutateAsync({ voter_ids: selected })
      toast.success(
        `Added ${selected.length} voter${selected.length !== 1 ? "s" : ""}`,
      )
      setSelected([])
      setSearch("")
      onOpenChange(false)
    } catch {
      toast.error("Failed to add voters")
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearch("")
      setSelected([])
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Voters to List</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          <div className="max-h-72 overflow-y-auto space-y-1 border rounded-md p-1">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {debouncedSearch ? "No voters found." : "Type to search voters."}
              </p>
            ) : (
              results.map((voter) => {
                const name =
                  [voter.first_name, voter.last_name].filter(Boolean).join(" ") ||
                  "Unknown"
                const isSelected = selected.includes(voter.id)
                return (
                  <button
                    key={voter.id}
                    type="button"
                    onClick={() => handleToggle(voter.id)}
                    className={[
                      "w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggle(voter.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 shrink-0 accent-primary"
                      aria-label={`Select ${name}`}
                    />
                    <span className="flex-1 font-medium">{name}</span>
                    {voter.party && (
                      <span className="text-xs opacity-75">{voter.party}</span>
                    )}
                    {voter.registration_city && (
                      <span className="text-xs opacity-75">{voter.registration_city}</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={addMembers.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={selected.length === 0 || addMembers.isPending}
          >
            {addMembers.isPending
              ? "Adding..."
              : selected.length === 0
                ? "Add Voters"
                : `Add ${selected.length} Voter${selected.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
