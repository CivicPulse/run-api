import { createFileRoute, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, UserPlus, Users } from "lucide-react"
import { TooltipIcon } from "@/components/shared/TooltipIcon"
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/shared/DataTable"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { RequireRole } from "@/components/shared/RequireRole"
import { useMembers, useUpdateMemberRole, useRemoveMember } from "@/hooks/useMembers"
import { useInvites, useCreateInvite, useRevokeInvite } from "@/hooks/useInvites"
import { usePermissions } from "@/hooks/usePermissions"
import { useAuthStore } from "@/stores/authStore"
import type { CampaignMember } from "@/types/campaign"
import type { Invite } from "@/types/invite"
type StatusVariant = "default" | "success" | "warning" | "error" | "info"

// Role badge variants
const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}

// Selectable roles (owner excluded — owner transfer is in Danger Zone)
const ASSIGNABLE_ROLES = ["viewer", "volunteer", "manager", "admin"] as const
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

// ----- Invite form schema -----
const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: z.enum(["viewer", "volunteer", "manager", "admin"], {
    error: "Select a role",
  }),
})

type InviteFormValues = z.infer<typeof inviteSchema>

// ----- Members tab component -----
function MembersSettings() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/settings/members",
  })

  const { hasRole } = usePermissions()
  const currentUserId = useAuthStore((s) => s.user?.profile?.sub as string | undefined)

  // Queries
  const { data: membersData, isLoading: membersLoading } = useMembers(campaignId)
  const { data: invitesData, isLoading: invitesLoading } = useInvites(campaignId)

  // Mutations
  const updateMemberRole = useUpdateMemberRole(campaignId)
  const removeMember = useRemoveMember(campaignId)
  const createInvite = useCreateInvite(campaignId)
  const revokeInvite = useRevokeInvite(campaignId)

  // Dialog state — role change
  const [roleDialogMember, setRoleDialogMember] = useState<CampaignMember | null>(null)
  const [selectedRole, setSelectedRole] = useState<AssignableRole>("viewer")

  // Dialog state — remove member
  const [removeDialogMember, setRemoveDialogMember] = useState<CampaignMember | null>(null)

  // Dialog state — invite member
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  // Dialog state — revoke invite
  const [revokeDialogInvite, setRevokeDialogInvite] = useState<Invite | null>(null)

  // ---- Invite form ----
  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "volunteer" },
  })

  const handleInviteSubmit = inviteForm.handleSubmit(async (data) => {
    try {
      await createInvite.mutateAsync(data)
      toast.success(`Invite sent to ${data.email}`)
      inviteForm.reset()
      setInviteDialogOpen(false)
    } catch {
      toast.error("Failed to send invite")
    }
  })

  // ---- Role change handler ----
  const handleRoleChange = async () => {
    if (!roleDialogMember) return
    try {
      await updateMemberRole.mutateAsync({
        userId: roleDialogMember.user_id,
        role: selectedRole,
      })
      toast.success("Role updated")
      setRoleDialogMember(null)
    } catch {
      toast.error("Failed to update role")
    }
  }

  // ---- Remove member handler ----
  const handleRemoveMember = async () => {
    if (!removeDialogMember) return
    try {
      await removeMember.mutateAsync(removeDialogMember.user_id)
      toast.success("Member removed")
      setRemoveDialogMember(null)
    } catch {
      toast.error("Failed to remove member")
    }
  }

  // ---- Revoke invite handler ----
  const handleRevokeInvite = async () => {
    if (!revokeDialogInvite) return
    try {
      await revokeInvite.mutateAsync(revokeDialogInvite.id)
      toast.success("Invite revoked")
      setRevokeDialogInvite(null)
    } catch {
      toast.error("Failed to revoke invite")
    }
  }

  // ---- Member columns ----
  const memberColumns: ColumnDef<CampaignMember, unknown>[] = [
    {
      accessorKey: "display_name",
      header: "Name",
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.display_name}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => {
        const email = row.original.email
        return (
          <span className="text-muted-foreground">
            {email || "No email"}
          </span>
        )
      },
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.role}
          variant={roleVariant[row.original.role] ?? "default"}
        />
      ),
    },
    {
      accessorKey: "synced_at",
      header: "Joined",
      cell: ({ row }) => {
        const date = new Date(row.original.synced_at)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const label =
          diffDays === 0
            ? "Today"
            : diffDays === 1
              ? "1 day ago"
              : diffDays < 30
                ? `${diffDays} days ago`
                : date.toLocaleDateString()
        return <span className="text-muted-foreground text-sm">{label}</span>
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const member = row.original
        const isOwner = member.role === "owner"
        const isSelf = member.user_id === currentUserId

        // Owner row or insufficient role: no actions shown
        if (isOwner || !hasRole("admin")) return null

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isSelf && (
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedRole(
                      ASSIGNABLE_ROLES.includes(member.role as AssignableRole)
                        ? (member.role as AssignableRole)
                        : "viewer"
                    )
                    setRoleDialogMember(member)
                  }}
                >
                  Change role
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setRemoveDialogMember(member)}
              >
                Remove member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  // ---- Invite columns ----
  const inviteColumns: ColumnDef<Invite, unknown>[] = [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span>{row.original.email}</span>,
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.role}
          variant={roleVariant[row.original.role] ?? "default"}
        />
      ),
    },
    {
      accessorKey: "created_at",
      header: "Invited",
      cell: ({ row }) => {
        const date = new Date(row.original.created_at)
        return (
          <span className="text-muted-foreground text-sm">
            {date.toLocaleDateString()}
          </span>
        )
      },
    },
    {
      id: "revoke",
      header: "",
      cell: ({ row }) => (
        <RequireRole minimum="admin">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setRevokeDialogInvite(row.original)}
          >
            Revoke
          </Button>
        </RequireRole>
      ),
    },
  ]

  const members = membersData ?? []
  const invites = invitesData?.items ?? []

  return (
    <div className="space-y-10">
      {/* Section 1: Current Members */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Members</h2>
          <Badge variant="secondary">{members.length}</Badge>
        </div>

        <DataTable
          columns={memberColumns}
          data={members}
          isLoading={membersLoading}
          emptyIcon={Users}
          emptyTitle="No members"
          emptyDescription="This campaign has no members yet."
        />
      </div>

      {/* Section 2: Pending Invites */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Pending Invites</h2>
            <Badge variant="secondary">{invites.length}</Badge>
          </div>

          <RequireRole minimum="admin">
            <Button
              size="sm"
              onClick={() => {
                inviteForm.reset()
                setInviteDialogOpen(true)
              }}
            >
              <UserPlus className="mr-2 size-4" />
              Invite member
            </Button>
          </RequireRole>
        </div>

        <DataTable
          columns={inviteColumns}
          data={invites}
          isLoading={invitesLoading}
          emptyIcon={UserPlus}
          emptyTitle="No pending invites"
          emptyDescription="All invites have been accepted or there are none yet."
        />
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
            <DialogDescription>
              Send an invitation to add someone to this campaign.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInviteSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                {...inviteForm.register("email")}
              />
              {inviteForm.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {inviteForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center">
                <Label htmlFor="invite-role">Role</Label>
                <TooltipIcon content="Viewer: read-only access. Volunteer: can log voter interactions. Manager: can create lists and assign turfs. Admin: full campaign management. Owner: can transfer or delete the campaign." />
              </div>
              <Select
                value={inviteForm.watch("role")}
                onValueChange={(value) =>
                  inviteForm.setValue("role", value as AssignableRole, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="invite-role">
                  <SelectValue placeholder="Select a role..." />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {inviteForm.formState.errors.role && (
                <p className="text-sm text-destructive">
                  {inviteForm.formState.errors.role.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInviteDialogOpen(false)}
                disabled={createInvite.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending ? "Sending..." : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog
        open={!!roleDialogMember}
        onOpenChange={(open) => {
          if (!open) setRoleDialogMember(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Update the role for{" "}
              <strong>{roleDialogMember?.display_name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value as AssignableRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role..." />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRoleDialogMember(null)}
              disabled={updateMemberRole.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRoleChange}
              disabled={updateMemberRole.isPending}
            >
              {updateMemberRole.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirm Dialog */}
      <ConfirmDialog
        open={!!removeDialogMember}
        onOpenChange={(open) => {
          if (!open) setRemoveDialogMember(null)
        }}
        title={`Remove ${removeDialogMember?.display_name ?? "member"}?`}
        description="They will lose access to this campaign."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemoveMember}
        isPending={removeMember.isPending}
      />

      {/* Revoke Invite Confirm Dialog */}
      <ConfirmDialog
        open={!!revokeDialogInvite}
        onOpenChange={(open) => {
          if (!open) setRevokeDialogInvite(null)
        }}
        title="Revoke invite?"
        description={`Revoke the invitation for ${revokeDialogInvite?.email ?? "this address"}?`}
        confirmLabel="Revoke"
        variant="destructive"
        onConfirm={handleRevokeInvite}
        isPending={revokeInvite.isPending}
      />
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/settings/members")({
  component: MembersSettings,
})
