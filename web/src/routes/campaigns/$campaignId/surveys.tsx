import { createFileRoute, Outlet } from "@tanstack/react-router"
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"

function SurveysLayout() {
  return <Outlet />
}

export const Route = createFileRoute("/campaigns/$campaignId/surveys")({
  component: SurveysLayout,
  errorComponent: RouteErrorBoundary,
})
