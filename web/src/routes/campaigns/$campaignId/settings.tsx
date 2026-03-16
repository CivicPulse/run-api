import { createFileRoute, useRouterState } from "@tanstack/react-router"
import { ModuleLayout } from "@/components/shared/ModuleLayout"

function SettingsLayout() {
  const location = useRouterState({ select: (s) => s.location })
  const campaignId = location.pathname.match(/^\/campaigns\/([^/]+)/)?.[1] ?? ""

  const navItems = [
    { to: `/campaigns/${campaignId}/settings/general`, label: "General" },
    { to: `/campaigns/${campaignId}/settings/members`, label: "Members" },
    { to: `/campaigns/${campaignId}/settings/danger`, label: "Danger Zone", variant: "destructive" as const },
  ]

  return <ModuleLayout title="Campaign Settings" navItems={navItems} titleClassName="font-bold" />
}

export const Route = createFileRoute("/campaigns/$campaignId/settings")({
  component: SettingsLayout,
})
