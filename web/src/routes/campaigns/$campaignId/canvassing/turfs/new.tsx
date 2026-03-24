import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"
import { useCreateTurf } from "@/hooks/useTurfs"
import { TurfForm } from "@/components/canvassing/TurfForm"
import { Button } from "@/components/ui/button"
import { TooltipIcon } from "@/components/shared/TooltipIcon"
import { ArrowLeft } from "lucide-react"

function NewTurfPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/canvassing/turfs/new",
  })
  const navigate = useNavigate()
  const createTurf = useCreateTurf(campaignId)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: `/campaigns/${campaignId}/canvassing` })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">New Turf</h2>
        <TooltipIcon content="A good turf size is 50-200 households. Smaller turfs are easier for a single canvasser to complete in one shift. Larger turfs work for teams." />
      </div>

      <TurfForm
        isPending={createTurf.isPending}
        submitLabel="Create Turf"
        campaignId={campaignId}
        onSubmit={(data) =>
          createTurf.mutate(data, {
            onSuccess: () =>
              navigate({ to: `/campaigns/${campaignId}/canvassing` }),
          })
        }
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/canvassing/turfs/new",
)({
  component: NewTurfPage,
})
