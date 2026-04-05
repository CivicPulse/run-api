import {
  createRootRoute,
  Link,
  Navigate,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect } from "react"
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  LogOut,
  Map,
  Navigation,
  Phone,
  Settings,
  Users,
  Vote,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { RequireRole } from "@/components/shared/RequireRole"
import { RequireOrgRole } from "@/components/shared/RequireOrgRole"
import { OrgSwitcher } from "@/components/org/OrgSwitcher"
import { SkipNav } from "@/components/shared/SkipNav"
import { Separator } from "@/components/ui/separator"
import { Toaster } from "@/components/ui/sonner"
import { useAuthStore } from "@/stores/authStore"

const PUBLIC_ROUTES = ["/login", "/callback"]

function AppSidebar() {
  const location = useRouterState({ select: (s) => s.location })
  const campaignMatch = location.pathname.match(/^\/campaigns\/([^/]+)/)
  const campaignId = campaignMatch?.[1]

  const navItems = [
    { to: `/campaigns/${campaignId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { to: `/campaigns/${campaignId}/voters`, label: "Voters", icon: Users },
    { to: `/campaigns/${campaignId}/canvassing`, label: "Canvassing", icon: Map },
    { to: `/campaigns/${campaignId}/phone-banking`, label: "Phone Banking", icon: Phone },
    { to: `/campaigns/${campaignId}/volunteers`, label: "Volunteers", icon: ClipboardList },
    { to: `/field/${campaignId}`, label: "Field Operations", icon: Navigation },
  ]

  return (
    <Sidebar aria-label="Main navigation">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Vote className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">CivicPulse Run</span>
                  <span className="text-xs text-muted-foreground">Campaign Manager</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {campaignId && campaignId !== "new" && (
          <SidebarGroup>
            <SidebarGroupLabel>Campaign</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith(item.to)}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Organization</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.pathname === "/"}>
                  <Link to="/">
                    <BarChart3 />
                    <span>All Campaigns</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <RequireOrgRole minimum="org_admin">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/org/members"}>
                    <Link to="/org/members">
                      <Users />
                      <span>Members</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/org/settings"}>
                    <Link to="/org/settings">
                      <Settings />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </RequireOrgRole>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {campaignId && campaignId !== "new" && (
        <RequireRole minimum="admin">
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname.includes("/settings")}
                >
                  <Link to="/campaigns/$campaignId/settings" params={{ campaignId }}>
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </RequireRole>
      )}
      <SidebarRail />
    </Sidebar>
  )
}

function UserMenu() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const displayName = user?.profile?.name || user?.profile?.email || "User"
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const handleLogout = () => {
    logout().catch(() => {
      // If OIDC logout fails, clear local state and redirect
      navigate({ to: "/login" })
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full" aria-label="User menu">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 max-w-[calc(100vw-2rem)]" align="end" forceMount>
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            <p className="text-sm font-medium">{displayName}</p>
            {user?.profile?.email && (
              <p className="text-xs text-muted-foreground">{user.profile.email}</p>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
    <SidebarProvider defaultOpen={true}>
      <SkipNav />
      <AppSidebar />
      <SidebarInset>
        <header role="banner" aria-label="Top navigation bar" className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" aria-label="Open sidebar" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <OrgSwitcher />
          <div className="flex-1" />
          <UserMenu />
        </header>
        <main id="main-content" className="flex-1 overflow-x-hidden p-4">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}

export const Route = createRootRoute({ component: RootLayout })
