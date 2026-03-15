import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { FieldHeader } from "@/components/field/FieldHeader"

function FieldLayout() {
  const { campaignId } = Route.useParams()
  const location = useRouterState({ select: (s) => s.location })

  // Hub is when there's no sub-path after the campaignId
  const isHub = location.pathname.replace(/\/$/, "") === `/field/${campaignId}`

  // Derive title from the sub-path segment
  let title = "Field"
  if (!isHub) {
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
