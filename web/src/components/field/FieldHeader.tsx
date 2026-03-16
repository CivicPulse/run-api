import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, HelpCircle, LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/stores/authStore"

interface FieldHeaderProps {
  campaignId: string
  title: string
  showBack?: boolean
  onHelpClick?: () => void
}

export function FieldHeader({ campaignId, title, showBack = false, onHelpClick }: FieldHeaderProps) {
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
      navigate({ to: "/login" })
    })
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
      {showBack ? (
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          asChild
        >
          <Link to={`/field/${campaignId}`} aria-label="Back to hub">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
      ) : (
        <div className="w-11" />
      )}

      <h1 className="flex-1 text-center text-sm font-semibold truncate">
        {title}
      </h1>

      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Help"
        data-tour="help-button"
        disabled={!onHelpClick}
        onClick={onHelpClick}
      >
        <HelpCircle className={`h-5 w-5 ${onHelpClick ? "text-muted-foreground" : "text-muted-foreground/50"}`} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-8 w-8 min-h-11 min-w-11 rounded-full"
            aria-label="User menu"
            data-tour="avatar-menu"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              <p className="text-sm font-medium">{displayName}</p>
              {user?.profile?.email && (
                <p className="text-xs text-muted-foreground">
                  {user.profile.email}
                </p>
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
    </header>
  )
}
