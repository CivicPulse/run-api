import { createFileRoute, useParams } from "@tanstack/react-router"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useCampaign, useUpdateCampaign } from "@/hooks/useCampaigns"
import { useFormGuard } from "@/hooks/useFormGuard"

const generalSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(100, "Name must be at most 100 characters"),
  description: z.string().optional(),
  election_date: z.string().optional(),
})

type GeneralFormValues = z.infer<typeof generalSchema>

function GeneralSettings() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/settings/general" })
  const { data: campaign, isLoading } = useCampaign(campaignId)
  const updateCampaign = useUpdateCampaign(campaignId)

  const form = useForm<GeneralFormValues>({
    resolver: zodResolver(generalSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: "",
      election_date: "",
    },
  })

  // Reset form when campaign data loads to establish a clean baseline
  useEffect(() => {
    if (campaign) {
      form.reset({
        name: campaign.name,
        description: "",
        election_date: campaign.election_date ?? "",
      })
    }
  }, [campaign, form])

  const { isBlocked, proceed, reset: resetGuard } = useFormGuard({ form })

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await updateCampaign.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        election_date: data.election_date || null,
      })
      form.reset(data) // Reset dirty state after successful save
      toast.success("Campaign updated")
    } catch {
      toast.error("Failed to update campaign")
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Update your campaign details.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="name">Campaign Name</Label>
          <Input
            id="name"
            {...form.register("name")}
            placeholder="Enter campaign name"
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            {...form.register("description")}
            placeholder="Brief description of your campaign (optional)"
            rows={3}
          />
          {form.formState.errors.description && (
            <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="election_date">Election Date</Label>
          <Input
            id="election_date"
            type="date"
            {...form.register("election_date")}
          />
          {form.formState.errors.election_date && (
            <p className="text-sm text-destructive">{form.formState.errors.election_date.message}</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={updateCampaign.isPending}>
            {updateCampaign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
          {form.formState.isDirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => form.reset()}
            >
              Discard
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={isBlocked}
        onOpenChange={(open) => {
          if (!open) resetGuard()
        }}
        title="Unsaved changes"
        description="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        variant="destructive"
        onConfirm={proceed}
      />
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/settings/general")({
  component: GeneralSettings,
})
