import { createFileRoute, Navigate, useParams } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Check, Copy, Link2, MoreHorizontal, RefreshCw, UserPlus, Users, X } from "lucide-react"
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
import {
  useCreateSignupLink,
  useDisableSignupLink,
  useRegenerateSignupLink,
  useSignupLinks,
} from "@/hooks/useSignupLinks"
import {
  useApproveVolunteerApplication,
  useRejectVolunteerApplication,
  useVolunteerApplications,
} from "@/hooks/useVolunteerApplications"
import { usePermissions } from "@/hooks/usePermissions"
import { useAuthStore } from "@/stores/authStore"
import type { CampaignMember } from "@/types/campaign"
import type { Invite } from "@/types/invite"
import type { SignupLink } from "@/types/signupLink"
import type { VolunteerApplication } from "@/types/volunteerApplication"
type StatusVariant = "default" | "success" | "warning" | "error" | "info"

// Role badge variants
const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}

const inviteDeliveryVariant: Record<string, StatusVariant> = {
  pending: "default",
  queued: "info",
  submitted: "info",
  delivered: "success",
  failed: "error",
  bounced: "error",
  complained: "warning",
  suppressed: "warning",
  skipped: "warning",
}

const inviteDeliveryLabel: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  submitted: "Submitted",
  delivered: "Delivered",
  failed: "Failed",
  bounced: "Bounced",
  complained: "Complained",
  suppressed: "Suppressed",
  skipped: "Skipped",
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

const signupLinkSchema = z.object({
  label: z.string().min(1, "Add a label for this signup link"),
})

type SignupLinkFormValues = z.infer<typeof signupLinkSchema>

function formatInviteEventTimestamp(value: string | null | undefined) {
  if (!value) return null

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function getInviteDeliveryContext(invite: Invite) {
  const status = invite.email_delivery_status ?? "pending"
  const label = inviteDeliveryLabel[status] ?? status
  const variant = inviteDeliveryVariant[status] ?? "default"
  const eventAt =
    invite.email_delivery_last_event_at ??
    invite.email_delivery_sent_at ??
    invite.email_delivery_queued_at

  let detail = "Awaiting delivery activity."
  if (status === "queued") detail = "Queued for background delivery."
  if (status === "submitted") detail = "Accepted by the provider."
  if (status === "delivered") detail = "Delivered to the recipient."
  if (status === "failed") detail = "Delivery failed. Review the latest error."
  if (status === "bounced") detail = "Mailbox or domain rejected delivery."
  if (status === "complained") detail = "Recipient marked the message as spam."
  if (status === "suppressed") detail = "Provider suppressed additional sends."
  if (status === "skipped") detail = "Invite is no longer deliverable."

  return {
    label,
    variant,
    detail,
    eventLabel: formatInviteEventTimestamp(eventAt),
  }
}

function getSignupLinkStatusVariant(status: SignupLink["status"]): StatusVariant {
  if (status === "active") return "success"
  if (status === "disabled") return "warning"
  return "default"
}

function getVolunteerApplicationStatusVariant(
  status: VolunteerApplication["status"],
): StatusVariant {
  if (status === "approved") return "success"
  if (status === "rejected") return "error"
  return "warning"
}

// ----- Members tab component -----
function MembersSettings() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/settings/members",
  })

  const { hasRole } = usePermissions()
  const currentUserId = useAuthStore((s) => s.user?.id)

  // Queries
  const { data: membersData, isLoading: membersLoading } = useMembers(campaignId)
  const { data: invitesData, isLoading: invitesLoading } = useInvites(campaignId)
  const { data: signupLinksData, isLoading: signupLinksLoading } = useSignupLinks(campaignId)
  const { data: applicationsData, isLoading: applicationsLoading } =
    useVolunteerApplications(campaignId)

  // Mutations
  const updateMemberRole = useUpdateMemberRole(campaignId)
  const removeMember = useRemoveMember(campaignId)
  const createInvite = useCreateInvite(campaignId)
  const revokeInvite = useRevokeInvite(campaignId)
  const createSignupLink = useCreateSignupLink(campaignId)
  const disableSignupLink = useDisableSignupLink(campaignId)
  const regenerateSignupLink = useRegenerateSignupLink(campaignId)
  const approveApplication = useApproveVolunteerApplication(campaignId)
  const rejectApplication = useRejectVolunteerApplication(campaignId)

  // Dialog state — role change
  const [roleDialogMember, setRoleDialogMember] = useState<CampaignMember | null>(null)
  const [selectedRole, setSelectedRole] = useState<AssignableRole>("viewer")

  // Dialog state — remove member
  const [removeDialogMember, setRemoveDialogMember] = useState<CampaignMember | null>(null)

  // Dialog state — invite member
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [signupLinkDialogOpen, setSignupLinkDialogOpen] = useState(false)

  // Dialog state — revoke invite
  const [revokeDialogInvite, setRevokeDialogInvite] = useState<Invite | null>(null)
  const [disableDialogLink, setDisableDialogLink] = useState<SignupLink | null>(null)
  const [approveDialogApplication, setApproveDialogApplication] =
    useState<VolunteerApplication | null>(null)
  const [rejectDialogApplication, setRejectDialogApplication] =
    useState<VolunteerApplication | null>(null)

  // D-10: Refs for focus management after delete actions
  const membersHeadingRef = useRef<HTMLHeadingElement>(null)
  const invitesHeadingRef = useRef<HTMLHeadingElement>(null)
  const signupLinksHeadingRef = useRef<HTMLHeadingElement>(null)
  const applicationsHeadingRef = useRef<HTMLHeadingElement>(null)

  // ---- Invite form ----
  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "volunteer" },
  })

  const signupLinkForm = useForm<SignupLinkFormValues>({
    resolver: zodResolver(signupLinkSchema),
    defaultValues: { label: "" },
  })

  const handleInviteSubmit = inviteForm.handleSubmit(async (data) => {
    try {
      const invite = await createInvite.mutateAsync(data)
      if (invite.email_delivery_status === "submitted") {
        toast.success(`Invite sent to ${data.email}`)
      } else if (invite.email_delivery_status === "failed") {
        toast.warning(
          `Invite created for ${data.email}, but email queueing failed. You can retry from the pending invites list.`,
        )
      } else {
        toast.success(`Invite queued for ${data.email}`)
      }
      inviteForm.reset()
      setInviteDialogOpen(false)
    } catch {
      toast.error("Failed to send invite")
    }
  })

  const handleSignupLinkSubmit = signupLinkForm.handleSubmit(async (data) => {
    try {
      const link = await createSignupLink.mutateAsync(data)
      signupLinkForm.reset()
      setSignupLinkDialogOpen(false)
      await navigator.clipboard.writeText(`${window.location.origin}/signup/${link.token}`)
      toast.success("Signup link created and copied")
    } catch {
      toast.error("Failed to create signup link")
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
      // D-10: Focus the members heading after removal so screen readers don't lose context
      requestAnimationFrame(() => membersHeadingRef.current?.focus())
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
      // D-10: Focus the invites heading after revocation so screen readers don't lose context
      requestAnimationFrame(() => invitesHeadingRef.current?.focus())
    } catch {
      toast.error("Failed to revoke invite")
    }
  }

  const handleDisableSignupLink = async () => {
    if (!disableDialogLink) return
    try {
      await disableSignupLink.mutateAsync(disableDialogLink.id)
      toast.success("Signup link disabled")
      setDisableDialogLink(null)
      requestAnimationFrame(() => signupLinksHeadingRef.current?.focus())
    } catch {
      toast.error("Failed to disable signup link")
    }
  }

  const handleApproveApplication = async () => {
    if (!approveDialogApplication) return
    try {
      await approveApplication.mutateAsync(approveDialogApplication.id)
      toast.success("Application approved")
      setApproveDialogApplication(null)
      requestAnimationFrame(() => applicationsHeadingRef.current?.focus())
    } catch {
      toast.error("Failed to approve application")
    }
  }

  const handleRejectApplication = async () => {
    if (!rejectDialogApplication) return
    try {
      await rejectApplication.mutateAsync({
        applicationId: rejectDialogApplication.id,
      })
      toast.success("Application rejected")
      setRejectDialogApplication(null)
      requestAnimationFrame(() => applicationsHeadingRef.current?.focus())
    } catch {
      toast.error("Failed to reject application")
    }
  }

  const copySignupLink = async (link: SignupLink) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/signup/${link.token}`)
      toast.success("Signup link copied")
    } catch {
      toast.error("Failed to copy signup link")
    }
  }

  const handleRegenerateSignupLink = async (link: SignupLink) => {
    try {
      const replacement = await regenerateSignupLink.mutateAsync(link.id)
      await navigator.clipboard.writeText(`${window.location.origin}/signup/${replacement.token}`)
      toast.success("Signup link regenerated and copied")
    } catch {
      toast.error("Failed to regenerate signup link")
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
      id: "delivery",
      header: "Delivery",
      cell: ({ row }) => {
        const delivery = getInviteDeliveryContext(row.original)
        return (
          <div className="space-y-1">
            <StatusBadge
              status={delivery.label}
              variant={delivery.variant}
            />
            <p className="text-muted-foreground text-xs">{delivery.detail}</p>
            {delivery.eventLabel ? (
              <p className="text-muted-foreground text-xs">
                Last event {delivery.eventLabel}
              </p>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "details",
      header: "Notes",
      cell: ({ row }) => {
        const error = row.original.email_delivery_error
        return (
          <span className={error ? "text-sm text-destructive" : "text-muted-foreground text-sm"}>
            {error ?? "No delivery issues reported."}
          </span>
        )
      },
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

  const signupLinkColumns: ColumnDef<SignupLink, unknown>[] = [
    {
      accessorKey: "label",
      header: "Label",
      cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          variant={getSignupLinkStatusVariant(row.original.status)}
        />
      ),
    },
    {
      id: "share",
      header: "Share link",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            void copySignupLink(row.original)
          }}
        >
          <Copy className="mr-2 size-4" />
          Copy link
        </Button>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {new Date(row.original.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2 justify-end">
          {row.original.status === "active" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation()
                  void handleRegenerateSignupLink(row.original)
                }}
              >
                <RefreshCw className="mr-2 size-4" />
                Regenerate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation()
                  setDisableDialogLink(row.original)
                }}
              >
                Disable
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ]

  const applicationColumns: ColumnDef<VolunteerApplication, unknown>[] = [
    {
      accessorKey: "first_name",
      header: "Applicant",
      cell: ({ row }) => (
        <div className="space-y-1">
          <p className="font-medium">
            {row.original.first_name} {row.original.last_name}
          </p>
          <p className="text-sm text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          variant={getVolunteerApplicationStatusVariant(row.original.status)}
        />
      ),
    },
    {
      accessorKey: "signup_link_label",
      header: "Source",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.signup_link_label}
        </span>
      ),
    },
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => (
        <div className="space-y-1 text-sm text-muted-foreground">
          {row.original.review_context ? (
            <>
              <p>
                Account:{" "}
                {row.original.review_context.has_existing_account ? "Existing CivicPulse user" : "Anonymous email-only applicant"}
              </p>
              <p>
                Campaign member:{" "}
                {row.original.review_context.existing_member
                  ? row.original.review_context.existing_member_role ?? "Existing member"
                  : "No"}
              </p>
              {row.original.review_context.prior_application_statuses.length ? (
                <p>
                  Prior decisions:{" "}
                  {row.original.review_context.prior_application_statuses.join(", ")}
                </p>
              ) : null}
              {row.original.review_context.approval_delivery ? (
                <p>
                  Access delivery: {row.original.review_context.approval_delivery}
                </p>
              ) : null}
            </>
          ) : null}
          {row.original.phone ? <p>Phone: {row.original.phone}</p> : null}
          {row.original.notes ? <p>{row.original.notes}</p> : <p>No notes</p>}
          {row.original.rejection_reason ? (
            <p className="text-destructive">
              Rejection note: {row.original.rejection_reason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Submitted",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {new Date(row.original.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        row.original.status === "pending" ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setApproveDialogApplication(row.original)}
            >
              <Check className="mr-2 size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setRejectDialogApplication(row.original)}
            >
              <X className="mr-2 size-4" />
              Reject
            </Button>
          </div>
        ) : null,
    },
  ]

  const members = membersData ?? []
  const invites = invitesData ?? []
  const signupLinks = signupLinksData ?? []
  const applications = applicationsData ?? []

  return (
    <div className="space-y-10">
      {/* Section 1: Current Members */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 ref={membersHeadingRef} tabIndex={-1} className="text-lg font-semibold outline-none">Members</h2>
          <Badge variant="secondary">{members.length}</Badge>
        </div>

        <DataTable
          columns={memberColumns}
          data={members}
          isLoading={membersLoading}
          emptyIcon={Users}
          emptyTitle="No team members"
          emptyDescription="Invite team members to collaborate on this campaign."
        />
      </div>

      {/* Section 2: Volunteer Signup Links */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 ref={signupLinksHeadingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
              Volunteer Signup Links
            </h2>
            <Badge variant="secondary">{signupLinks.length}</Badge>
          </div>

          <RequireRole minimum="admin">
            <Button
              size="sm"
              onClick={() => {
                signupLinkForm.reset()
                setSignupLinkDialogOpen(true)
              }}
            >
              <Link2 className="mr-2 size-4" />
              New signup link
            </Button>
          </RequireRole>
        </div>

        <DataTable
          columns={signupLinkColumns}
          data={signupLinks}
          isLoading={signupLinksLoading}
          emptyIcon={Link2}
          emptyTitle="No signup links"
          emptyDescription="Create a public volunteer signup link to share with supporters."
        />
      </div>

      {/* Section 3: Pending Invites */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 ref={invitesHeadingRef} tabIndex={-1} className="text-lg font-semibold outline-none">Pending Invites</h2>
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

      {/* Section 4: Volunteer Applications */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2
            ref={applicationsHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Volunteer Applications
          </h2>
          <Badge variant="secondary">{applications.length}</Badge>
        </div>

        <DataTable
          columns={applicationColumns}
          data={applications}
          isLoading={applicationsLoading}
          emptyIcon={UserPlus}
          emptyTitle="No volunteer applications"
          emptyDescription="Applications submitted from signup links will appear here for review."
        />
      </div>

      {/* Signup Link Dialog */}
      <Dialog open={signupLinkDialogOpen} onOpenChange={setSignupLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a signup link</DialogTitle>
            <DialogDescription>
              Create a public campaign-scoped volunteer signup URL. The new link will be copied after creation.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSignupLinkSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="signup-link-label">Label</Label>
              <Input
                id="signup-link-label"
                placeholder="Weekend volunteers"
                {...signupLinkForm.register("label")}
                aria-invalid={!!signupLinkForm.formState.errors.label}
                aria-describedby={signupLinkForm.formState.errors.label ? "signup-link-label-error" : undefined}
              />
              {signupLinkForm.formState.errors.label ? (
                <p id="signup-link-label-error" className="text-sm text-destructive" role="alert">
                  {signupLinkForm.formState.errors.label.message}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSignupLinkDialogOpen(false)}
                disabled={createSignupLink.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createSignupLink.isPending}>
                {createSignupLink.isPending ? "Creating..." : "Create link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                aria-invalid={!!inviteForm.formState.errors.email}
                aria-describedby={inviteForm.formState.errors.email ? "invite-email-error" : undefined}
              />
              {inviteForm.formState.errors.email && (
                <p id="invite-email-error" className="text-sm text-destructive" role="alert">
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
                <p id="invite-role-error" className="text-sm text-destructive" role="alert">
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

      <ConfirmDialog
        open={!!disableDialogLink}
        onOpenChange={(open) => {
          if (!open) setDisableDialogLink(null)
        }}
        title="Disable signup link?"
        description={`Disable "${disableDialogLink?.label ?? "this signup link"}" so the current public URL stops working immediately.`}
        confirmLabel="Disable"
        variant="destructive"
        onConfirm={handleDisableSignupLink}
        isPending={disableSignupLink.isPending}
      />

      <ConfirmDialog
        open={!!approveDialogApplication}
        onOpenChange={(open) => {
          if (!open) setApproveDialogApplication(null)
        }}
        title={`Approve ${approveDialogApplication?.first_name ?? "this applicant"}?`}
        description="Approval grants campaign membership and volunteer access."
        confirmLabel="Approve"
        onConfirm={handleApproveApplication}
        isPending={approveApplication.isPending}
      />

      <ConfirmDialog
        open={!!rejectDialogApplication}
        onOpenChange={(open) => {
          if (!open) setRejectDialogApplication(null)
        }}
        title={`Reject ${rejectDialogApplication?.first_name ?? "this applicant"}?`}
        description="The application will remain in the audit trail without granting campaign access."
        confirmLabel="Reject"
        variant="destructive"
        onConfirm={handleRejectApplication}
        isPending={rejectApplication.isPending}
      />
    </div>
  )
}

function GuardedMembersSettings() {
  return (
    <RequireRole minimum="admin" fallback={<Navigate to="/" />}>
      <MembersSettings />
    </RequireRole>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/settings/members")({
  component: GuardedMembersSettings,
})
