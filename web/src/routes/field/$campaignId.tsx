import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { FieldHeader } from "@/components/field/FieldHeader"
import { OfflineBanner } from "@/components/field/OfflineBanner"
import { ConnectivitySheet } from "@/components/field/ConnectivitySheet"
import { useSyncEngine } from "@/hooks/useSyncEngine"
import { useFieldMe } from "@/hooks/useFieldMe"
import { useAuthStore } from "@/stores/authStore"
import { useTour } from "@/hooks/useTour"
import { tourKey } from "@/stores/tourStore"

function FieldLayout() {
  const { campaignId } = Route.useParams()
  const location = useRouterState({ select: (s) => s.location })
  const { data } = useFieldMe(campaignId)

  // Activate offline sync engine for all field screens
  useSyncEngine()

  // Plan 110-05 / OFFLINE-02: ConnectivitySheet open state. Pill tap
  // in FieldHeader flips this on; Sheet onOpenChange flips it off.
  const [connectivityOpen, setConnectivityOpen] = useState(false)

  // Tour context
  const user = useAuthStore((state) => state.user)
  const userId = user?.id
  const key = userId ? tourKey(campaignId, userId) : ""
  const { startSegment } = useTour(key)

  const handleHelpClick = useCallback(() => {
    if (!key) return
    const pathname = location.pathname
    void import("@/components/field/tour/tourSteps").then(
      ({ welcomeSteps, canvassingSteps, phoneBankingSteps }) => {
        if (pathname.includes("/canvassing")) {
          void startSegment("canvassing", canvassingSteps)
        } else if (pathname.includes("/phone-banking")) {
          void startSegment("phoneBanking", phoneBankingSteps)
        } else {
          void startSegment("welcome", welcomeSteps)
        }
      },
    )
  }, [key, location.pathname, startSegment])

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
        onHelpClick={userId ? handleHelpClick : undefined}
        onConnectivityClick={() => setConnectivityOpen(true)}
      />
      <OfflineBanner />
      <ConnectivitySheet
        open={connectivityOpen}
        onOpenChange={setConnectivityOpen}
      />
      <main className="flex-1 px-4 pb-4" aria-label="Field mode content">
        <Outlet />
      </main>
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId")({
  component: FieldLayout,
})
