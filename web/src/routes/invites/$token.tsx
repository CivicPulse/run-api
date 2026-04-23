import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { HTTPError } from "ky"
import { Loader2, MailCheck, MailX } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { api, AuthenticationError } from "@/api/client"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/authStore"
import type { PublicInvite } from "@/types/invite"

function InviteEntryPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((state) => state.status === "authenticated")
  const [acceptedCampaignId, setAcceptedCampaignId] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const inviteQuery = useQuery({
    queryKey: ["public-invite", token],
    queryFn: () => api.get(`api/v1/public/invites/${token}`).json<PublicInvite>(),
  })

  const acceptInvite = useMutation({
    mutationFn: () =>
      api.post(`api/v1/invites/${token}/accept`).json<{
        message: string
        campaign_id: string
        role: string
      }>(),
    onSuccess: async (data) => {
      setAcceptError(null)
      setAcceptedCampaignId(data.campaign_id)
      toast.success("Invite accepted")
      await queryClient.invalidateQueries({ queryKey: ["public-invite", token] })
    },
    onError: async (error) => {
      if (error instanceof AuthenticationError) {
        navigate({ to: "/login", search: { redirect: `/invites/${token}` } })
        return
      }
      if (error instanceof HTTPError) {
        try {
          const body = await error.response.json<{ detail?: string }>()
          setAcceptError(body.detail ?? "Failed to accept invite")
        } catch {
          setAcceptError("Failed to accept invite")
        }
        return
      }
      setAcceptError("Failed to accept invite")
    },
  })

  const invite = inviteQuery.data
  const effectiveStatus =
    acceptedCampaignId !== null ? "accepted" : (invite?.status ?? "not_found")

  const handleLogin = () => {
    navigate({ to: "/login", search: { redirect: `/invites/${token}` } })
  }

  const handleOpenCampaign = () => {
    if (!acceptedCampaignId) return
    navigate({
      to: "/campaigns/$campaignId",
      params: { campaignId: acceptedCampaignId },
    })
  }

  return (
    <div className="min-h-svh bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 rounded-3xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          {effectiveStatus === "valid" ? (
            <MailCheck className="size-6 text-primary" />
          ) : (
            <MailX className="size-6 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              Campaign invite
            </p>
            <h1 className="text-2xl font-semibold">
              {invite?.campaign_name ?? "Invite link"}
            </h1>
          </div>
        </div>

        {inviteQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading invite details...</span>
          </div>
        ) : null}

        {invite ? (
          <div className="space-y-3 text-sm">
            <p>
              {invite.inviter_name ?? "A team member"} invited you to join{" "}
              <strong>{invite.campaign_name ?? "this campaign"}</strong>
              {invite.organization_name ? ` for ${invite.organization_name}` : ""} as{" "}
              <strong>{invite.role ?? "a member"}</strong>.
            </p>
            {invite.expires_at ? (
              <p className="text-muted-foreground">
                Expires {format(new Date(invite.expires_at), "PPP p")}
              </p>
            ) : null}
          </div>
        ) : null}

        {inviteQuery.isError ? (
          <p className="text-sm text-destructive">
            Unable to load this invite right now.
          </p>
        ) : null}

        {effectiveStatus === "not_found" ? (
          <p className="text-sm text-muted-foreground">
            This invite link is invalid or no longer exists.
          </p>
        ) : null}
        {effectiveStatus === "expired" ? (
          <p className="text-sm text-muted-foreground">
            This invite expired before it could be accepted. Ask your campaign admin to send a new one.
          </p>
        ) : null}
        {effectiveStatus === "revoked" ? (
          <p className="text-sm text-muted-foreground">
            This invite was revoked. Contact the campaign admin if you still need access.
          </p>
        ) : null}
        {effectiveStatus === "accepted" ? (
          <p className="text-sm text-muted-foreground">
            This invite has already been accepted.
          </p>
        ) : null}
        {acceptError ? (
          <p className="text-sm text-destructive">{acceptError}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {effectiveStatus === "valid" && !isAuthenticated ? (
            <Button onClick={handleLogin}>Sign in to accept invite</Button>
          ) : null}
          {effectiveStatus === "valid" && isAuthenticated ? (
            <Button
              onClick={() => acceptInvite.mutate()}
              disabled={acceptInvite.isPending}
            >
              {acceptInvite.isPending ? "Accepting..." : "Accept invite"}
            </Button>
          ) : null}
          {acceptedCampaignId ? (
            <Button variant="outline" onClick={handleOpenCampaign}>
              Open campaign
            </Button>
          ) : null}
          {!acceptedCampaignId && effectiveStatus !== "valid" ? (
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back to app
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/invites/$token")({
  component: InviteEntryPage,
})
