import { createFileRoute, Outlet } from "@tanstack/react-router"
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"

function CanvassingLayout() {
  return <Outlet />
}

export const Route = createFileRoute("/campaigns/$campaignId/canvassing")({
  component: CanvassingLayout,
  errorComponent: RouteErrorBoundary,
})
