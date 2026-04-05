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

// Module-level flag prevents signinRedirectCallback() from being called
// more than once. This is critical because:
// 1. React StrictMode unmounts/remounts components, re-triggering effects
// 2. Auth state changes can cause parent re-renders that remount this component
// The flag must NOT have a cleanup/reset — each login cycle involves a full
// page navigation through the OIDC provider, which reloads this module fresh.
let callbackProcessed = false

export function __resetCallbackProcessedForTests() {
  callbackProcessed = false
}

function CallbackPage() {
  const handleCallback = useAuthStore((state) => state.handleCallback)
  const navigate = useNavigate()
  const { code, state, error, error_description } = Route.useSearch()
  const hasError = Boolean(error || error_description)

  useEffect(() => {
    if (hasError) return
    if (callbackProcessed) return
    callbackProcessed = true

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

        // Volunteer-only users go directly to field mode
        if (highestRole === "volunteer") {
          try {
            const campaigns = await api
              .get("api/v1/me/campaigns")
              .json<UserCampaign[]>()
            if (campaigns.length > 0) {
              navigate({ to: `/field/${campaigns[0].campaign_id}` })
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
