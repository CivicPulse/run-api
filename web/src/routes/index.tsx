import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { BarChart3, ChevronDown, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/authStore"
import { useOrgCampaigns, useArchiveCampaign, useUnarchiveCampaign } from "@/hooks/useOrg"
import { useOrgPermissions } from "@/hooks/useOrgPermissions"
import { RequireOrgRole } from "@/components/shared/RequireOrgRole"
import { CampaignCard } from "@/components/org/CampaignCard"
import { StatsBar } from "@/components/org/StatsBar"
import type { OrgCampaign } from "@/types/org"

function OrgDashboard() {
  const { data: campaigns, isLoading } = useOrgCampaigns()
  const { currentOrg } = useOrgPermissions()

  // Separate active and archived
  const activeCampaigns = campaigns?.filter((c) => c.status !== "archived") ?? []
  const archivedCampaigns = campaigns?.filter((c) => c.status === "archived") ?? []

  // Archive state
  const [archiveTarget, setArchiveTarget] = useState<OrgCampaign | null>(null)
  const archiveMutation = useArchiveCampaign()
  const unarchiveMutation = useUnarchiveCampaign()
  const [archivedOpen, setArchivedOpen] = useState(false)

  // Calculate total member count from campaign data
  const totalMembers = campaigns?.reduce((sum, c) => sum + c.member_count, 0) ?? 0

  const handleArchiveConfirm = () => {
    if (!archiveTarget) return
    archiveMutation.mutate(archiveTarget.id, {
      onSuccess: () => {
        toast(`${archiveTarget.name} archived.`)
        setArchiveTarget(null)
      },
    })
  }

  const handleUnarchive = (campaign: OrgCampaign) => {
    unarchiveMutation.mutate(campaign.id, {
      onSuccess: () => {
        toast(`${campaign.name} restored.`)
      },
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    )
  }

  const hasCampaigns = activeCampaigns.length > 0 || archivedCampaigns.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{currentOrg?.name ?? "Organization"}</h1>
        <RequireOrgRole minimum="org_admin">
          <Button asChild>
            <Link to="/campaigns/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Campaign
            </Link>
          </Button>
        </RequireOrgRole>
      </div>

      {hasCampaigns ? (
        <>
          <StatsBar
            activeCampaignCount={activeCampaigns.length}
            memberCount={totalMembers}
          />

          {activeCampaigns.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeCampaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onArchive={setArchiveTarget}
                />
              ))}
            </div>
          )}

          {archivedCampaigns.length > 0 && (
            <div>
              <Button
                variant="ghost"
                onClick={() => setArchivedOpen(!archivedOpen)}
                className="gap-1"
              >
                Archived ({archivedCampaigns.length})
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${archivedOpen ? "rotate-180" : ""}`}
                />
              </Button>
              {archivedOpen && (
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {archivedCampaigns.map((campaign) => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      onArchive={setArchiveTarget}
                      onUnarchive={handleUnarchive}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first campaign to start running field operations.
            </p>
            <RequireOrgRole minimum="org_admin">
              <Button className="mt-4" asChild>
                <Link to="/campaigns/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Campaign
                </Link>
              </Button>
            </RequireOrgRole>
          </CardContent>
        </Card>
      )}

      {/* Archive confirmation dialog */}
      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {archiveTarget?.name}?</DialogTitle>
            <DialogDescription>
              Archived campaigns become read-only. Team members will still be able to
              view data but cannot make changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Keep Campaign
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveConfirm}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? "Archiving..." : "Archive Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          <Link to="/login" search={{ redirect: undefined }}>Sign In</Link>
        </Button>
      </div>
    </div>
  )
}

function HomePage() {
  const isAuthenticated = useAuthStore((state) => state.status === "authenticated")

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return <OrgDashboard />
}

export const Route = createFileRoute("/")({ component: HomePage })
