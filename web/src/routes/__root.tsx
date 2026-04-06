import {
  createRootRoute,
  Navigate,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { lazy, Suspense, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { SkipNav } from "@/components/shared/SkipNav"
import { Toaster } from "@/components/ui/sonner"
import { useAuthStore } from "@/stores/authStore"

const PUBLIC_ROUTES = ["/login", "/callback"]
const AuthenticatedAppShell = lazy(() =>
  import("@/components/layout/AuthenticatedAppShell").then((module) => ({
    default: module.AuthenticatedAppShell,
  })),
)

function RootLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isInitialized = useAuthStore((state) => state.isInitialized)
  const initialize = useAuthStore((state) => state.initialize)
  const location = useRouterState({ select: (s) => s.location })

  useEffect(() => {
    initialize()
  }, [initialize])

  // Let the callback route process the OIDC response immediately,
  // before initialize() can clear pending state from localStorage
  const isCallbackRoute = location.pathname === "/callback"

  if (!isInitialized && !isCallbackRoute) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  const isPublicRoute = PUBLIC_ROUTES.some((r) => location.pathname.startsWith(r))

  // Unauthenticated user hitting a non-public route → instant redirect to
  // /login with the original path preserved in the redirect query param
  // (SEC-07 / C7 fix, D-01).
  if (!isAuthenticated && !isPublicRoute) {
    const target = location.pathname + (location.searchStr ?? "")
    return <Navigate to="/login" search={{ redirect: target }} />
  }

  // Public routes render the minimal shell (no sidebar/layout)
  if (isPublicRoute) {
    return (
      <div className="min-h-svh bg-background text-foreground">
        <main id="main-content" className="flex-1">
          <Outlet />
        </main>
        <Toaster />
      </div>
    )
  }

  // Field routes use a mobile-optimized layout with no admin chrome
  const isFieldRoute = location.pathname.startsWith("/field")
  if (isFieldRoute) {
    return (
      <div className="min-h-svh bg-background text-foreground">
        <SkipNav />
        <Outlet />
        <Toaster />
      </div>
    )
  }

  return (
    <Suspense fallback={
      <div className="min-h-svh bg-background text-foreground">
        <div className="flex h-svh items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    }>
      <SkipNav />
      <AuthenticatedAppShell>
          <Outlet />
      </AuthenticatedAppShell>
      <Toaster />
    </Suspense>
  )
}

export const Route = createRootRoute({ component: RootLayout })
