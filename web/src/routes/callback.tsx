import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

// Module-level flag prevents signinRedirectCallback() from being called
// more than once. This is critical because:
// 1. React StrictMode unmounts/remounts components, re-triggering effects
// 2. Auth state changes can cause parent re-renders that remount this component
// The flag must NOT have a cleanup/reset — each login cycle involves a full
// page navigation through the OIDC provider, which reloads this module fresh.
let callbackProcessed = false

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
      .then(() => {
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
