import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAddAvailability } from "@/hooks/useVolunteerAvailability"

interface AddAvailabilityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  volunteerId: string
}

export function AddAvailabilityDialog({
  open,
  onOpenChange,
  campaignId,
  volunteerId,
}: AddAvailabilityDialogProps) {
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [error, setError] = useState("")

  const addAvailability = useAddAvailability(campaignId, volunteerId)

  const resetForm = () => {
    setDate("")
    setStartTime("")
    setEndTime("")
    setError("")
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm()
    }
    onOpenChange(isOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!date || !startTime || !endTime) {
      setError("All fields are required")
      return
    }

    const start_at = new Date(`${date}T${startTime}`).toISOString()
    const end_at = new Date(`${date}T${endTime}`).toISOString()

    if (new Date(end_at) <= new Date(start_at)) {
      setError("End time must be after start time")
      return
    }

    try {
      await addAvailability.mutateAsync({ start_at, end_at })
      toast.success("Availability added")
      resetForm()
      onOpenChange(false)
    } catch {
      toast.error("Failed to add availability")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Availability</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="avail_date" className="text-xs">
              Date
            </Label>
            <Input
              id="avail_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={addAvailability.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="avail_start" className="text-xs">
                Start Time
              </Label>
              <Input
                id="avail_start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={addAvailability.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="avail_end" className="text-xs">
                End Time
              </Label>
              <Input
                id="avail_end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={addAvailability.isPending}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={addAvailability.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addAvailability.isPending}>
              {addAvailability.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
