import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { OrgCampaign, OrgMember } from "@/types/org"

function getInitials(name: string | null): string {
  if (!name) return "?"
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

interface RoleMatrixTableProps {
  members: OrgMember[]
  campaigns: OrgCampaign[]
  onAddToCampaign: (member: OrgMember) => void
}

export function RoleMatrixTable({
  members,
  campaigns,
  onAddToCampaign,
}: RoleMatrixTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            {campaigns.map((campaign) => (
              <TableHead key={campaign.id}>{campaign.name}</TableHead>
            ))}
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.user_id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {getInitials(member.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {member.display_name ?? "Unknown"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {member.email ?? "--"}
                </span>
              </TableCell>
              {campaigns.map((campaign) => {
                const entry = member.campaign_roles.find(
                  (cr) => cr.campaign_id === campaign.id,
                )
                return (
                  <TableCell key={campaign.id}>
                    <span className="text-sm text-muted-foreground">
                      {entry ? entry.role : "--"}
                    </span>
                  </TableCell>
                )
              })}
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddToCampaign(member)}
                >
                  Add to Campaign
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
