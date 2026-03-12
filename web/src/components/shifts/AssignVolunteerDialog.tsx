import { useState, useMemo } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useVolunteerList } from "@/hooks/useVolunteers"
import { useAssignVolunteer } from "@/hooks/useShifts"

interface AssignVolunteerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  shiftId: string
  existingVolunteerIds: string[]
}

export function AssignVolunteerDialog({
  open,
  onOpenChange,
  campaignId,
  shiftId,
  existingVolunteerIds,
}: AssignVolunteerDialogProps) {
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: volunteersData, isLoading: volunteersLoading } =
    useVolunteerList(campaignId, { status: "active" })
  const assignMutation = useAssignVolunteer(campaignId, shiftId)

  // Filter out already-assigned volunteers and apply search
  const filteredVolunteers = useMemo(() => {
    const all = volunteersData?.items ?? []
    const existingSet = new Set(existingVolunteerIds)
    const available = all.filter((v) => !existingSet.has(v.id))

    if (!search.trim()) return available

    const term = search.toLowerCase()
    return available.filter((v) => {
      const fullName = `${v.first_name} ${v.last_name}`.toLowerCase()
      return fullName.includes(term)
    })
  }, [volunteersData, existingVolunteerIds, search])

  const handleAssign = async () => {
    if (!selectedId) return
    try {
      await assignMutation.mutateAsync(selectedId)
      toast.success("Volunteer assigned")
      setSelectedId(null)
      setSearch("")
      onOpenChange(false)
    } catch {
      toast.error("Failed to assign volunteer")
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedId(null)
      setSearch("")
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Volunteer</DialogTitle>
          <DialogDescription>
            Select an active volunteer to assign to this shift.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-60 overflow-y-auto space-y-1">
          {volunteersLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading volunteers...
            </p>
          ) : filteredVolunteers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No available volunteers to assign
            </p>
          ) : (
            filteredVolunteers.map((v) => (
              <label
                key={v.id}
                className={`flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                  selectedId === v.id ? "bg-muted" : ""
                }`}
              >
                <input
                  type="radio"
                  name="volunteer"
                  value={v.id}
                  checked={selectedId === v.id}
                  onChange={() => setSelectedId(v.id)}
                  className="accent-primary"
                />
                <span className="text-sm">
                  {v.first_name} {v.last_name}
                </span>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={assignMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedId || assignMutation.isPending}
          >
            {assignMutation.isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
