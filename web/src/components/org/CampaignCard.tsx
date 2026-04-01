import { Link } from "@tanstack/react-router"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { OrgCampaign } from "@/types/org"

interface CampaignCardProps {
  campaign: OrgCampaign
  onArchive: (campaign: OrgCampaign) => void
  onUnarchive?: (campaign: OrgCampaign) => void
}

export function CampaignCard({ campaign, onArchive, onUnarchive }: CampaignCardProps) {
  const isArchived = campaign.status === "archived"

  return (
    <Link
      to="/campaigns/$campaignId/dashboard"
      params={{ campaignId: campaign.id }}
      className="block"
    >
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{campaign.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={isArchived ? "secondary" : "default"}>
                {isArchived ? "Archived" : "Active"}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Campaign actions"
                    className="h-8 w-8 min-h-11 min-w-11"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem asChild>
                    <Link
                      to="/campaigns/$campaignId/dashboard"
                      params={{ campaignId: campaign.id }}
                    >
                      Open Campaign
                    </Link>
                  </DropdownMenuItem>
                  {!isArchived && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault()
                        onArchive(campaign)
                      }}
                    >
                      Archive Campaign
                    </DropdownMenuItem>
                  )}
                  {isArchived && onUnarchive && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault()
                        onUnarchive(campaign)
                      }}
                    >
                      Unarchive Campaign
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {campaign.election_date && (
            <p className="text-sm text-muted-foreground">
              Election: {new Date(campaign.election_date).toLocaleDateString()}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {campaign.member_count} members
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
