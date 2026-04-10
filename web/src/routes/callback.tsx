import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { AlertCircle } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import { api } from "@/api/client"
import { getConfig } from "@/config"
import { getHighestRoleFromClaims } from "@/lib/auth-claims"
import { isSafeRedirect } from "@/lib/safeRedirect"
import { POST_LOGIN_REDIRECT_KEY } from "@/routes/login"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { UserCampaign } from "@/types/user"
import type { FieldMeResponse } from "@/types/field"
import { hasCallbackProcessed, markCallbackProcessed } from "./callback-state"

async function resolveVolunteerCampaign(campaigns: UserCampaign[]) {
  if (campaigns.length === 0) return null

  for (const campaign of campaigns) {
    try {
      const fieldMe = await api
        .get(`api/v1/campaigns/${campaign.campaign_id}/field/me`)
        .json<FieldMeResponse>()
      if (fieldMe.canvassing || fieldMe.phone_banking) {
        return campaign.campaign_id
      }
    } catch {
      // Ignore per-campaign field probes and continue checking others.
    }
  }

  return campaigns[0]?.campaign_id ?? null
}

function CallbackPage() {
  const handleCallback = useAuthStore((state) => state.handleCallback)
  const navigate = useNavigate()
  const { code, state, error, error_description } = Route.useSearch()
  const hasError = Boolean(error || error_description)

  useEffect(() => {
    if (hasError) return
    if (hasCallbackProcessed()) return
    markCallbackProcessed()

    // Reconstruct the callback URL with the OIDC params that
    // TanStack Router would otherwise strip from window.location.
    // encodeURIComponent ensures base64 characters (+, /, =) in
    // the OIDC state/code aren't corrupted.
    const url = `${window.location.origin}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`

    handleCallback(url)
      .then(async () => {
        // Honor the stored post-login redirect (SEC-08) — validated
        // same-origin again at read time. Clear it unconditionally so a
        // stale value can't leak into a future session.
        const saved = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)
        sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
        if (isSafeRedirect(saved)) {
          navigate({ to: saved })
          return
        }

        // After callback completes, store is updated with the user
        const user = useAuthStore.getState().user
        if (!user) {
          navigate({ to: "/" })
          return
        }

        const highestRole = getHighestRoleFromClaims(
          (user as unknown as { profile: Record<string, unknown> }).profile,
          getConfig().zitadel_project_id,
        )

        const roleClaims = ((user as unknown as { profile: Record<string, unknown> }).profile[
          `urn:zitadel:iam:org:project:${getConfig().zitadel_project_id}:roles`
        ] ?? {}) as Record<string, unknown>
        const hasVolunteerRole = Object.prototype.hasOwnProperty.call(
          roleClaims,
          "volunteer",
        )

        // Any user with volunteer scope should prefer the campaign that
        // actually has a live field assignment after login.
        if (highestRole === "volunteer" || hasVolunteerRole) {
          try {
            const campaigns = await api
              .get("api/v1/me/campaigns")
              .json<UserCampaign[]>()
            const campaignId = await resolveVolunteerCampaign(campaigns)
            if (campaignId) {
              navigate({ to: `/field/${campaignId}` })
              return
            }
          } catch {
            // Fall through to default navigation
          }
        }

        navigate({ to: "/" })
      })
      .catch((err) => {
        console.error("OIDC callback failed:", err)
        navigate({ to: "/login", search: { redirect: undefined } })
      })
  }, [handleCallback, navigate, code, state, hasError])

  if (hasError) {
    const primary = error_description
      ? error_description
      : error
        ? `Sign-in error: ${error}`
        : "Something went wrong during sign-in. Please try again."
    const showSecondary = Boolean(error_description && error)

    return (
      <div className="flex h-svh items-center justify-center">
        <div className="max-w-sm w-full mx-auto px-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>
              <p className="text-sm">{primary}</p>
              {showSecondary && (
                <p className="text-sm text-muted-foreground mt-1">
                  Error code: {error}
                </p>
              )}
            </AlertDescription>
          </Alert>
          <Button
            variant="default"
            className="w-full mt-4"
            autoFocus
            onClick={() => navigate({ to: "/login", search: { redirect: undefined } })}
          >
            Back to login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/callback")({
  component: CallbackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) ?? "",
    state: (search.state as string) ?? "",
    error: (search.error as string) ?? "",
    error_description: (search.error_description as string) ?? "",
  }),
})
