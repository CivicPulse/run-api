import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router"

function SettingsLayout() {
  const location = useRouterState({ select: (s) => s.location })
  const campaignId = location.pathname.match(/^\/campaigns\/([^/]+)/)?.[1] ?? ""

  const navItems = [
    { to: `/campaigns/${campaignId}/settings/general`, label: "General" },
    { to: `/campaigns/${campaignId}/settings/members`, label: "Members" },
    { to: `/campaigns/${campaignId}/settings/danger`, label: "Danger Zone" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Settings</h1>
      </div>
      <div className="flex gap-0">
        <nav className="w-48 shrink-0 border-r pr-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="block"
                >
                  {({ isActive }) => (
                    <span
                      className={[
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        item.label === "Danger Zone" && isActive
                          ? "text-destructive"
                          : item.label === "Danger Zone"
                            ? "text-destructive/70 hover:text-destructive"
                            : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-1 pl-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/settings")({
  component: SettingsLayout,
})
