import { createFileRoute, Outlet } from "@tanstack/react-router"

function CanvassingLayout() {
  return <Outlet />
}

export const Route = createFileRoute("/campaigns/$campaignId/canvassing")({
  component: CanvassingLayout,
})
