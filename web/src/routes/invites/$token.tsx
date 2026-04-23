import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { HTTPError } from "ky"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MailCheck,
  MailX,
  Vote,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { api } from "@/api/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuthStore } from "@/stores/authStore"
import type { PublicInvite } from "@/types/invite"

const acceptSchema = z
  .object({
    display_name: z.string().min(2, "Enter your name"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirm_password: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  })

type AcceptFormValues = z.infer<typeof acceptSchema>

interface AcceptResponse {
  message: string
  campaign_id: string
  role: string
}

function InviteEntryPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const fetchMe = useAuthStore((state) => state.fetchMe)

  const [acceptedCampaignId, setAcceptedCampaignId] = useState<string | null>(
    null,
  )
  const [serverError, setServerError] = useState<string | null>(null)

  const inviteQuery = useQuery({
    queryKey: ["public-invite", token],
    queryFn: () => api.get(`api/v1/public/invites/${token}`).json<PublicInvite>(),
  })

  const form = useForm<AcceptFormValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { display_name: "", password: "", confirm_password: "" },
  })

  // Prefill display_name if the invite response carries inviter metadata.
  // The current PublicInvite schema doesn't include an invitee display name,
  // but we honor it defensively if the backend adds one later.
  useEffect(() => {
    const invite = inviteQuery.data as
      | (PublicInvite & { display_name?: string | null })
      | undefined
    if (invite?.display_name && !form.getValues("display_name")) {
      form.setValue("display_name", invite.display_name)
    }
  }, [inviteQuery.data, form])

  const acceptInvite = useMutation({
    mutationFn: (values: AcceptFormValues) =>
      api
        .post(`api/v1/invites/${token}/accept`, {
          json: {
            password: values.password,
            display_name: values.display_name,
          },
        })
        .json<AcceptResponse>(),
    onSuccess: async (data) => {
      setServerError(null)
      setAcceptedCampaignId(data.campaign_id)
      toast.success("Invite accepted — welcome aboard")
      // Sync auth store with the freshly-issued cp_session cookie.
      await fetchMe()
      navigate({
        to: "/campaigns/$campaignId",
        params: { campaignId: data.campaign_id },
      })
    },
    onError: async (error) => {
      let message = "Failed to accept invite"
      if (error instanceof HTTPError) {
        const status = error.response.status
        try {
          const body = (await error.response.clone().json()) as { detail?: unknown }
          const detail = body.detail
          if (typeof detail === "string") {
            // Backend prefixes fastapi-users password-policy failures as
            // "Invalid password: <reason>" (code REGISTER_INVALID_PASSWORD).
            if (detail.toLowerCase().startsWith("invalid password")) {
              message = detail.replace(/^invalid password:?\s*/i, "") ||
                "Choose a stronger password."
            } else {
              message = detail
            }
          } else if (
            detail &&
            typeof detail === "object" &&
            "code" in detail &&
            (detail as { code?: string }).code === "REGISTER_INVALID_PASSWORD"
          ) {
            const reason = (detail as { reason?: string }).reason
            message = reason || "Choose a stronger password."
          }
        } catch {
          // ignore parse failure
        }
        if (status === 404) {
          message = "This invite link is invalid or no longer exists."
        } else if (status === 410) {
          message = "This invite has expired. Ask your campaign admin for a new one."
        }
      }
      setServerError(message)
    },
  })

  const invite = inviteQuery.data
  const effectiveStatus =
    acceptedCampaignId !== null ? "accepted" : (invite?.status ?? "not_found")

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null)
    acceptInvite.mutate(values)
  })

  // Non-valid invite states: render a minimal info card with a link to /login.
  if (
    !inviteQuery.isLoading &&
    (effectiveStatus === "not_found" ||
      effectiveStatus === "expired" ||
      effectiveStatus === "revoked" ||
      effectiveStatus === "accepted")
  ) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <MailX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle>
              {effectiveStatus === "expired"
                ? "Invite expired"
                : effectiveStatus === "revoked"
                  ? "Invite revoked"
                  : effectiveStatus === "accepted"
                    ? "Invite already accepted"
                    : "Invite not found"}
            </CardTitle>
            <CardDescription>
              {effectiveStatus === "expired"
                ? "This invite expired before it could be accepted. Ask your campaign admin to send a new one."
                : effectiveStatus === "revoked"
                  ? "This invite was revoked. Contact the campaign admin if you still need access."
                  : effectiveStatus === "accepted"
                    ? "This invite has already been accepted. Sign in to continue."
                    : "This invite link is invalid or no longer exists."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link to="/login" search={{ redirect: undefined, reset: undefined }}>Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            {effectiveStatus === "valid" ? (
              <MailCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            ) : acceptedCampaignId ? (
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            ) : (
              <Vote className="h-5 w-5 text-primary" aria-hidden="true" />
            )}
          </div>
          <CardTitle>
            {invite?.campaign_name ?? "Accept your campaign invite"}
          </CardTitle>
          <CardDescription>
            {invite ? (
              <>
                {invite.inviter_name ?? "A team member"} invited you to join{" "}
                <strong>{invite.campaign_name ?? "this campaign"}</strong>
                {invite.organization_name
                  ? ` for ${invite.organization_name}`
                  : ""}{" "}
                as <strong>{invite.role ?? "a member"}</strong>.
              </>
            ) : (
              "Set a password to finish creating your account."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inviteQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Loading invite details...</span>
            </div>
          ) : null}

          {inviteQuery.isError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Unable to load invite</AlertTitle>
              <AlertDescription>
                We couldn't fetch this invite right now. Please try again.
              </AlertDescription>
            </Alert>
          ) : null}

          {invite?.expires_at ? (
            <p className="mb-4 text-center text-xs text-muted-foreground">
              Expires {format(new Date(invite.expires_at), "PPP p")}
            </p>
          ) : null}

          {serverError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could not accept invite</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {effectiveStatus === "valid" ? (
            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="display_name">Full name</Label>
                <Input
                  id="display_name"
                  autoComplete="name"
                  autoFocus
                  aria-invalid={!!form.formState.errors.display_name}
                  {...form.register("display_name")}
                />
                {form.formState.errors.display_name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.display_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!form.formState.errors.password}
                  {...form.register("password")}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 12 characters. Avoid common passwords.
                </p>
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!form.formState.errors.confirm_password}
                  {...form.register("confirm_password")}
                />
                {form.formState.errors.confirm_password && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.confirm_password.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting || acceptInvite.isPending}
              >
                {(form.formState.isSubmitting || acceptInvite.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Accept invite & create account
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" search={{ redirect: undefined, reset: undefined }} className="underline hover:text-foreground">
                  Sign in
                </Link>
              </p>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/invites/$token")({
  component: InviteEntryPage,
})
