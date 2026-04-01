import { Link, Outlet } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

interface NavItem {
  to: string
  label: string
  end?: boolean
  variant?: "destructive"
}

interface ModuleLayoutProps {
  title: string
  navItems: NavItem[]
  titleClassName?: string
}

export function ModuleLayout({ title, navItems, titleClassName }: ModuleLayoutProps) {
  return (
    <div className="space-y-6">
      <h1 className={cn("text-2xl font-semibold tracking-tight", titleClassName)}>
        {title}
      </h1>
      <div className="flex flex-col md:flex-row md:gap-0">
        <nav className="mb-4 overflow-x-auto border-b pb-2 md:mb-0 md:w-48 md:shrink-0 md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-4">
          <ul className="flex gap-1 md:flex-col md:gap-0 md:space-y-1">
            {navItems.map((item) => (
              <li key={item.to} className="shrink-0">
                <Link
                  to={item.to}
                  activeOptions={item.end ? { exact: true } : undefined}
                  className="block"
                >
                  {({ isActive }) => (
                    <span
                      className={cn(
                        // Mobile: pill style
                        "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                        // Desktop: block style
                        "md:whitespace-normal md:rounded-md md:px-3 md:py-2",
                        // Active / inactive base
                        isActive
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        // Destructive variant
                        item.variant === "destructive" && isActive && "text-destructive",
                        item.variant === "destructive" &&
                          !isActive &&
                          "text-destructive hover:text-destructive",
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 md:pl-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
