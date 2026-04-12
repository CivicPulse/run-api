import {
  createRootRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { SkipNav } from "@/components/shared/SkipNav"
import { Toaster } from "@/components/ui/sonner"
import { useAuthStore } from "@/stores/authStore"

const PUBLIC_ROUTES = ["/login", "/callback", "/invites", "/signup"]
const AuthenticatedAppShell = lazy(() =>
  import("@/components/layout/AuthenticatedAppShell").then((module) => ({
    default: module.AuthenticatedAppShell,
  })),
)

function RootLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useRouterState({ select: (s) => s.location })

  const isPublicRoute = PUBLIC_ROUTES.some((r) =>
    location.pathname.startsWith(r),
  )

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

  if (!isAuthenticated) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

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
    <Suspense
      fallback={
        <div className="min-h-svh bg-background text-foreground">
          <div className="flex h-svh items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading...</span>
            </div>
          </div>
        </div>
      }
    >
      <SkipNav />
      <AuthenticatedAppShell>
        <Outlet />
      </AuthenticatedAppShell>
      <Toaster />
    </Suspense>
  )
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    // Callback processes the OIDC response itself via handleCallback()
    if (location.pathname === "/callback") return

    await useAuthStore.getState().initialize()

    const isPublicRoute = PUBLIC_ROUTES.some((r) =>
      location.pathname.startsWith(r),
    )
    if (isPublicRoute) return

    const { isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname + (location.searchStr ?? "") },
      })
    }
  },
  component: RootLayout,
})
