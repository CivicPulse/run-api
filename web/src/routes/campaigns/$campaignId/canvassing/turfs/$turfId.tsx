import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"
import { useTurf, useUpdateTurf, useDeleteTurf } from "@/hooks/useTurfs"
import { TurfForm } from "@/components/canvassing/TurfForm"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Trash2, Download } from "lucide-react"
import { useState } from "react"

function exportGeoJson(
  boundary: Record<string, unknown>,
  turfName: string,
) {
  const feature = {
    type: "Feature",
    properties: { name: turfName },
    geometry: boundary,
  }
  const blob = new Blob([JSON.stringify(feature, null, 2)], {
    type: "application/geo+json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${turfName.replace(/\s+/g, "-").toLowerCase()}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}

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
    <section aria-labelledby="page-heading" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: `/campaigns/${campaignId}/canvassing` })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 id="page-heading" className="text-lg font-semibold">{turf.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportGeoJson(turf.boundary, turf.name)}
          >
            <Download className="mr-1 h-4 w-4" /> Export GeoJSON
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <TurfForm
        defaultValues={turf}
        isPending={updateTurf.isPending}
        submitLabel="Save Changes"
        campaignId={campaignId}
        turfId={turfId}
        onSubmit={(data) =>
          updateTurf.mutate({
            name: data.name,
            description: data.description,
            boundary: data.boundary,
          })
        }
      />

      <DestructiveConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Turf"
        description="Are you sure? This cannot be undone."
        confirmText={turf.name}
        confirmLabel="Delete"
        isPending={deleteTurf.isPending}
        onConfirm={() =>
          deleteTurf.mutate(turfId, {
            onSuccess: () => navigate({ to: `/campaigns/${campaignId}/canvassing` }),
          })
        }
      />
    </section>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/canvassing/turfs/$turfId",
)({
  component: TurfDetailPage,
})
