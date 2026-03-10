import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"
import { useTurf, useUpdateTurf, useDeleteTurf } from "@/hooks/useTurfs"
import { TurfForm } from "@/components/canvassing/TurfForm"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useState } from "react"

function TurfDetailPage() {
  const { campaignId, turfId } = useParams({
    from: "/campaigns/$campaignId/canvassing/turfs/$turfId",
  })
  const navigate = useNavigate()
  const { data: turf, isLoading } = useTurf(campaignId, turfId)
  const updateTurf = useUpdateTurf(campaignId, turfId)
  const deleteTurf = useDeleteTurf(campaignId)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!turf) {
    return <p className="text-sm text-muted-foreground">Turf not found.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: `/campaigns/${campaignId}/canvassing` })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">{turf.name}</h2>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>

      <TurfForm
        defaultValues={turf}
        isPending={updateTurf.isPending}
        submitLabel="Save Changes"
        onSubmit={(data) =>
          updateTurf.mutate({
            name: data.name,
            description: data.description,
            boundary: data.boundary,
          })
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Turf"
        description="Are you sure? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteTurf.isPending}
        onConfirm={() =>
          deleteTurf.mutate(turfId, {
            onSuccess: () => navigate({ to: `/campaigns/${campaignId}/canvassing` }),
          })
        }
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/canvassing/turfs/$turfId",
)({
  component: TurfDetailPage,
})
