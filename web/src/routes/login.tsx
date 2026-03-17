import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

// Module-level flag prevents signinRedirect() from being called more than once.
// React StrictMode unmounts/remounts components, re-triggering effects — two
// concurrent signinRedirect() calls race and cancel each other. The flag must
// NOT have a cleanup/reset — the redirect to ZITADEL reloads this module fresh.
let loginInitiated = false

function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated && !loginInitiated) {
      loginInitiated = true
      login()
    }
  }, [isAuthenticated, login])

  return (
    <div className="flex h-svh items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/login")({ component: LoginPage })
