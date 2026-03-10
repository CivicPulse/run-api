import { createFileRoute, Outlet, Link, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  LayoutDashboard,
  Users,
  Map,
  Phone,
  ClipboardList,
  Loader2,
} from "lucide-react"
import { api } from "@/api/client"
import type { Campaign } from "@/types/campaign"

function CampaignLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" })

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaigns", campaignId],
    queryFn: () => api.get(`api/v1/campaigns/${campaignId}`).json<Campaign>(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tabs = [
    { to: `/campaigns/${campaignId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { to: `/campaigns/${campaignId}/voters`, label: "Voters", icon: Users },
    { to: `/campaigns/${campaignId}/canvassing`, label: "Canvassing", icon: Map },
    { to: `/campaigns/${campaignId}/phone-banking`, label: "Phone Banking", icon: Phone },
    { to: `/campaigns/${campaignId}/volunteers`, label: "Volunteers", icon: ClipboardList },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{campaign?.name ?? "Campaign"}</h1>
        {campaign?.candidate_name && (
          <p className="text-sm text-muted-foreground">
            {campaign.candidate_name}{campaign.party_affiliation ? ` (${campaign.party_affiliation})` : ""}
          </p>
        )}
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:border-primary [&.active]:text-foreground"
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId")({
  component: CampaignLayout,
})
