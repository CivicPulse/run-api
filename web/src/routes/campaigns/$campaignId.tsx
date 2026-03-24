import { createFileRoute, Outlet, Link, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  LayoutDashboard,
  Users,
  Map,
  Phone,
  ClipboardList,
  FileText,
} from "lucide-react"
import { api } from "@/api/client"
import { Skeleton } from "@/components/ui/skeleton"
import type { Campaign } from "@/types/campaign"

function CampaignLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" })

  const { data: campaign, isLoading, isError } = useQuery({
    queryKey: ["campaigns", campaignId],
    queryFn: () => api.get(`api/v1/campaigns/${campaignId}`).json<Campaign>(),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    )
  }

  if (isError || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <p className="text-muted-foreground">Campaign not found</p>
        <Link to="/" className="text-sm text-primary hover:underline">
          Back to campaigns
        </Link>
      </div>
    )
  }

  const tabs = [
    { to: `/campaigns/${campaignId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { to: `/campaigns/${campaignId}/voters`, label: "Voters", icon: Users },
    { to: `/campaigns/${campaignId}/canvassing`, label: "Canvassing", icon: Map },
    { to: `/campaigns/${campaignId}/phone-banking`, label: "Phone Banking", icon: Phone },
    { to: `/campaigns/${campaignId}/surveys`, label: "Surveys", icon: FileText },
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
      <nav className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:border-primary [&.active]:text-foreground"
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
