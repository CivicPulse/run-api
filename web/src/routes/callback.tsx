import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { api } from "@/api/client"
import { getConfig } from "@/config"
import { getHighestRoleFromClaims } from "@/lib/auth-claims"
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
  const { code, state } = Route.useSearch()

  useEffect(() => {
    if (callbackProcessed) return
    callbackProcessed = true

    // Reconstruct the callback URL with the OIDC params that
    // TanStack Router would otherwise strip from window.location.
    // encodeURIComponent ensures base64 characters (+, /, =) in
    // the OIDC state/code aren't corrupted.
    const url = `${window.location.origin}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`

    handleCallback(url)
      .then(async () => {
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
        navigate({ to: "/login" })
      })
  }, [handleCallback, navigate, code, state])

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
  }),
})
