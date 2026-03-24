import { createFileRoute, useParams } from "@tanstack/react-router"
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"
import { ModuleLayout } from "@/components/shared/ModuleLayout"

function VotersLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/voters" })

  const navItems = [
    { to: `/campaigns/${campaignId}/voters`, label: "All Voters", end: true },
    { to: `/campaigns/${campaignId}/voters/lists`, label: "Lists" },
    { to: `/campaigns/${campaignId}/voters/tags`, label: "Tags" },
    { to: `/campaigns/${campaignId}/voters/imports`, label: "Imports" },
  ]

  return <ModuleLayout title="Voters" navItems={navItems} />
}

export const Route = createFileRoute("/campaigns/$campaignId/voters")({
  component: VotersLayout,
  errorComponent: RouteErrorBoundary,
})
