import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) {
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
