import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { useAuthStore } from "@/stores/authStore"

function CallbackPage() {
  const handleCallback = useAuthStore((state) => state.handleCallback)
  const navigate = useNavigate()
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    handleCallback()
      .then(() => {
        navigate({ to: "/" })
      })
      .catch(() => {
        navigate({ to: "/login" })
      })
  }, [handleCallback, navigate])

  return (
    <div className="flex h-svh items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/callback")({ component: CallbackPage })
