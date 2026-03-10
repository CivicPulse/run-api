import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAssignCanvasser } from "@/hooks/useWalkLists"

const schema = z.object({
  user_id: z.string().min(1, "User ID is required"),
})

type FormValues = z.infer<typeof schema>

interface CanvasserAssignDialogProps {
  campaignId: string
  walkListId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CanvasserAssignDialog({
  campaignId,
  walkListId,
  open,
  onOpenChange,
}: CanvasserAssignDialogProps) {
  const assign = useAssignCanvasser(campaignId, walkListId)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { user_id: "" },
  })

  const onSubmit = (values: FormValues) => {
    assign.mutate(values, {
      onSuccess: () => {
        reset()
        onOpenChange(false)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Canvasser</DialogTitle>
          <DialogDescription>Add a canvasser to this walk list.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-id">User ID</Label>
            <Input id="user-id" {...register("user_id")} />
            {errors.user_id && <p className="text-sm text-destructive">{errors.user_id.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={assign.isPending}>
              {assign.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
