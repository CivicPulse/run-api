import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Vote, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/api/client"
import { useAuthStore } from "@/stores/authStore"
import type { Campaign } from "@/types/campaign"
import type { PaginatedResponse } from "@/types/common"

function CampaignList() {
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get("api/v1/campaigns").json<PaginatedResponse<Campaign>>(),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    )
  }

  const campaigns = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Button asChild>
          <Link to="/campaigns/new">
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </div>
      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Vote className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">Create your first campaign to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              to="/campaigns/$campaignId/dashboard"
              params={{ campaignId: campaign.id }}
              className="block"
            >
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{campaign.name}</CardTitle>
                    <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                      {campaign.status}
                    </Badge>
                  </div>
                  <CardDescription>{campaign.type}</CardDescription>
                </CardHeader>
                <CardContent>
                  {campaign.candidate_name && (
                    <p className="text-sm text-muted-foreground">{campaign.candidate_name}{campaign.party_affiliation ? ` (${campaign.party_affiliation})` : ""}</p>
                  )}
                  {campaign.election_date && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Election: {new Date(campaign.election_date).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function LandingPage() {
  return (
    <div className="flex h-svh items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">CivicPulse Run</h1>
        <p className="mt-2 text-muted-foreground">Campaign management platform</p>
        <Button className="mt-6" asChild>
          <Link to="/login">Sign In</Link>
        </Button>
      </div>
    </div>
  )
}

function HomePage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return <CampaignList />
}

export const Route = createFileRoute("/")({ component: HomePage })
