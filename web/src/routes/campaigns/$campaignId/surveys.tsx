import { createFileRoute, Outlet } from "@tanstack/react-router"

function SurveysLayout() {
  return <Outlet />
}

export const Route = createFileRoute("/campaigns/$campaignId/surveys")({
  component: SurveysLayout,
})
