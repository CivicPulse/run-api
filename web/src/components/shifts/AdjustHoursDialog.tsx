import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAdjustHours } from "@/hooks/useShifts"

interface AdjustHoursDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  shiftId: string
  volunteerId: string
  volunteerName: string
  computedHours: number | null
}

const adjustHoursSchema = z.object({
  adjusted_hours: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .positive("Hours must be greater than 0"),
  adjustment_reason: z
    .string()
    .min(3, "Reason must be at least 3 characters"),
})

type AdjustHoursFormValues = z.infer<typeof adjustHoursSchema>

export function AdjustHoursDialog({
  open,
  onOpenChange,
  campaignId,
  shiftId,
  volunteerId,
  volunteerName,
  computedHours,
}: AdjustHoursDialogProps) {
  const adjustMutation = useAdjustHours(campaignId, shiftId)

  const form = useForm<AdjustHoursFormValues>({
    resolver: zodResolver(adjustHoursSchema),
    defaultValues: {
      adjusted_hours: computedHours ?? 0,
      adjustment_reason: "",
    },
  })

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await adjustMutation.mutateAsync({
        volunteerId,
        data: {
          adjusted_hours: data.adjusted_hours,
          adjustment_reason: data.adjustment_reason,
        },
      })
      toast.success("Hours adjusted")
      form.reset()
      onOpenChange(false)
    } catch {
      toast.error("Failed to adjust hours")
    }
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset()
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Hours</DialogTitle>
          <DialogDescription>
            Adjust recorded hours for {volunteerName}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Volunteer name (read-only) */}
          <div className="space-y-1">
            <Label className="text-xs">Volunteer</Label>
            <p className="text-sm font-medium">{volunteerName}</p>
          </div>

          {/* Computed hours (read-only) */}
          <div className="space-y-1">
            <Label className="text-xs">Computed Hours</Label>
            <p className="text-sm font-medium">
              {computedHours != null ? computedHours.toFixed(1) : "--"}
            </p>
          </div>

          {/* Adjusted hours input */}
          <div className="space-y-1">
            <Label htmlFor="adjusted_hours" className="text-xs">
              Adjusted Hours
            </Label>
            <Input
              id="adjusted_hours"
              type="number"
              step="0.1"
              min="0"
              {...form.register("adjusted_hours")}
              disabled={adjustMutation.isPending}
            />
            {form.formState.errors.adjusted_hours && (
              <p className="text-xs text-destructive">
                {form.formState.errors.adjusted_hours.message}
              </p>
            )}
          </div>

          {/* Reason textarea */}
          <div className="space-y-1">
            <Label htmlFor="adjustment_reason" className="text-xs">
              Reason
            </Label>
            <Textarea
              id="adjustment_reason"
              placeholder="Reason for adjustment..."
              {...form.register("adjustment_reason")}
              disabled={adjustMutation.isPending}
            />
            {form.formState.errors.adjustment_reason && (
              <p className="text-xs text-destructive">
                {form.formState.errors.adjustment_reason.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={adjustMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? "Saving..." : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
