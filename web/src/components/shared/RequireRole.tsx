import React from "react"
import { usePermissions } from "@/hooks/usePermissions"
import type { CampaignRole } from "@/types/auth"

interface RequireRoleProps {
  minimum: CampaignRole
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequireRole({ minimum, children, fallback = null }: RequireRoleProps) {
  const { hasRole } = usePermissions()
  return hasRole(minimum) ? <>{children}</> : <>{fallback}</>
}
