import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { FieldHeader } from "@/components/field/FieldHeader"
import { useFieldMe } from "@/hooks/useFieldMe"

function FieldLayout() {
  const { campaignId } = Route.useParams()
  const location = useRouterState({ select: (s) => s.location })
  const { data } = useFieldMe(campaignId)

  // Hub is when there's no sub-path after the campaignId
  const isHub = location.pathname.replace(/\/$/, "") === `/field/${campaignId}`

  // Derive title based on context
  let title = "Field"
  if (isHub) {
    title = data?.campaign_name || "Field"
  } else {
    const subPath = location.pathname
      .replace(`/field/${campaignId}/`, "")
      .split("/")[0]
    const titleMap: Record<string, string> = {
      canvassing: "Canvassing",
      "phone-banking": "Phone Banking",
    }
    title = titleMap[subPath] || "Field"
  }

  return (
    <div className="flex min-h-svh flex-col">
      <FieldHeader
        campaignId={campaignId}
        title={title}
        showBack={!isHub}
      />
      <main className="flex-1 px-4 pb-4">
        <Outlet />
      </main>
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId")({
  component: FieldLayout,
})
