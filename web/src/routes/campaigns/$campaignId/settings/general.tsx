import { createFileRoute, useParams } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
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
  const formRef = useRef<HTMLFormElement>(null)

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

  // D-10: Focus first invalid field after validation failure
  const handleInvalid = () => {
    requestAnimationFrame(() => {
      const firstInvalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      firstInvalid?.focus()
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Update your campaign details.</p>
      </div>

      <form ref={formRef} onSubmit={onSubmit} onInvalid={handleInvalid} className="space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="name">Campaign Name</Label>
          <Input
            id="name"
            {...form.register("name")}
            placeholder="Enter campaign name"
            disabled={isLoading}
            aria-invalid={!!form.formState.errors.name}
            aria-describedby={form.formState.errors.name ? "name-error" : undefined}
          />
          {form.formState.errors.name && (
            <p id="name-error" className="text-sm text-destructive" role="alert">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            {...form.register("description")}
            placeholder="Brief description of your campaign (optional)"
            rows={3}
            disabled={isLoading}
            aria-invalid={!!form.formState.errors.description}
            aria-describedby={form.formState.errors.description ? "description-error" : undefined}
          />
          {form.formState.errors.description && (
            <p id="description-error" className="text-sm text-destructive" role="alert">{form.formState.errors.description.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="election_date">Election Date</Label>
          <Input
            id="election_date"
            type="date"
            {...form.register("election_date")}
            disabled={isLoading}
            aria-invalid={!!form.formState.errors.election_date}
            aria-describedby={form.formState.errors.election_date ? "election-date-error" : undefined}
          />
          {form.formState.errors.election_date && (
            <p id="election-date-error" className="text-sm text-destructive" role="alert">{form.formState.errors.election_date.message}</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={isLoading || updateCampaign.isPending}>
            {(isLoading || updateCampaign.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
