import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router"

function PhoneBankingLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/phone-banking" })

  const navItems = [
    { to: `/campaigns/${campaignId}/phone-banking/call-lists`, label: "Call Lists" },
    { to: `/campaigns/${campaignId}/phone-banking/dnc`, label: "DNC List" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Phone Banking</h1>
      </div>
      <div className="flex gap-0">
        <nav className="w-48 shrink-0 border-r pr-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  params={{ campaignId }}
                  activeProps={{ className: "bg-muted text-foreground font-medium" }}
                  inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                  className="block rounded-md px-3 py-2 text-sm transition-colors"
                >
                  {item.label}
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

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking")({
  component: PhoneBankingLayout,
})
