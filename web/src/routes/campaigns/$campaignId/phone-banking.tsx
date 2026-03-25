import { createFileRoute, useParams } from "@tanstack/react-router"
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"
import { ModuleLayout } from "@/components/shared/ModuleLayout"

function PhoneBankingLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/phone-banking" })

  const navItems = [
    { to: `/campaigns/${campaignId}/phone-banking/sessions`, label: "Sessions" },
    { to: `/campaigns/${campaignId}/phone-banking/call-lists`, label: "Call Lists" },
    { to: `/campaigns/${campaignId}/phone-banking/dnc`, label: "DNC List" },
    { to: `/campaigns/${campaignId}/phone-banking/my-sessions`, label: "My Sessions" },
  ]

  return <ModuleLayout title="Phone Banking" navItems={navItems} />
}

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking")({
  component: PhoneBankingLayout,
  errorComponent: RouteErrorBoundary,
})
