import { createFileRoute, useParams } from "@tanstack/react-router"
import { ModuleLayout } from "@/components/shared/ModuleLayout"

function VolunteerLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/volunteers" })

  const navItems = [
    { to: `/campaigns/${campaignId}/volunteers/roster`, label: "Roster" },
    { to: `/campaigns/${campaignId}/volunteers/tags`, label: "Tags" },
    { to: `/campaigns/${campaignId}/volunteers/register`, label: "Register" },
    { to: `/campaigns/${campaignId}/volunteers/shifts`, label: "Shifts" },
  ]

  return <ModuleLayout title="Volunteers" navItems={navItems} />
}

export const Route = createFileRoute("/campaigns/$campaignId/volunteers")({
  component: VolunteerLayout,
})
