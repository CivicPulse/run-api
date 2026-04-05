import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { isSafeRedirect } from "@/lib/safeRedirect"
import { useAuthStore } from "@/stores/authStore"

// Module-level flag prevents signinRedirect() from being called more than once.
// React StrictMode unmounts/remounts components, re-triggering effects — two
// concurrent signinRedirect() calls race and cancel each other. The flag must
// NOT have a cleanup/reset — the redirect to ZITADEL reloads this module fresh.
let loginInitiated = false

export const POST_LOGIN_REDIRECT_KEY = "post_login_redirect"

function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const { redirect } = Route.useSearch()

  useEffect(() => {
    if (isAuthenticated || loginInitiated) return
    loginInitiated = true
    // Persist the intended post-login destination BEFORE kicking off the
    // OIDC redirect (D-07): the ZITADEL round-trip reloads the whole
    // module, so sessionStorage is our vehicle across the hop. Validate
    // same-origin first (D-06) to defeat open-redirect attacks.
    if (isSafeRedirect(redirect)) {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, redirect)
    } else {
      sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
    }
    login()
  }, [isAuthenticated, login, redirect])

  return (
    <div className="flex h-svh items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" ? search.redirect : undefined,
  }),
})
