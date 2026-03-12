import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const tagSchema = z.object({
  name: z
    .string()
    .min(1, "Tag name is required")
    .max(50, "Tag name too long"),
})

type TagFormValues = z.infer<typeof tagSchema>

interface VolunteerTagFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  defaultValues?: { name: string }
  isPending: boolean
  onSubmit: (data: { name: string }) => void
}

export function VolunteerTagFormDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  isPending,
  onSubmit,
}: VolunteerTagFormDialogProps) {
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagSchema),
    defaultValues: defaultValues ?? { name: "" },
  })

  // Reset form when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      form.reset(defaultValues ?? { name: "" })
    }
  }, [open, defaultValues, form])

  const handleSubmit = form.handleSubmit(async (values) => {
    onSubmit(values)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="volunteer-tag-name">Tag name</Label>
            <Input
              id="volunteer-tag-name"
              placeholder="e.g. Spanish Speaker"
              disabled={isPending}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
