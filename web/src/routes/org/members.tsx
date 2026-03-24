import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RoleMatrixTable } from "@/components/org/RoleMatrixTable"
import { AddToCampaignDialog } from "@/components/org/AddToCampaignDialog"
import { useOrgMembers, useOrgCampaigns } from "@/hooks/useOrg"
import type { OrgMember } from "@/types/org"

function MembersPage() {
  const { data: members, isLoading: membersLoading } = useOrgMembers()
  const { data: campaigns, isLoading: campaignsLoading } = useOrgCampaigns()
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null)

  const isLoading = membersLoading || campaignsLoading
  const activeCampaigns = (campaigns ?? []).filter(
    (c) => c.status !== "archived",
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Members</h1>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-28" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (!members || members.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Members</h1>
        <div className="flex flex-col items-center justify-center py-12">
          <Users className="h-10 w-10 text-muted-foreground/60 mb-3" />
          <h2 className="text-lg font-semibold">No members yet</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add members to your organization.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Members</h1>
      <RoleMatrixTable
        members={members}
        campaigns={activeCampaigns}
        onAddToCampaign={setSelectedMember}
      />
      <AddToCampaignDialog
        member={selectedMember}
        open={!!selectedMember}
        onOpenChange={(open) => !open && setSelectedMember(null)}
        campaigns={activeCampaigns}
      />
    </div>
  )
}

export const Route = createFileRoute("/org/members")({
  component: MembersPage,
  errorComponent: RouteErrorBoundary,
})
