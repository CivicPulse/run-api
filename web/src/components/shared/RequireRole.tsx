import React from "react"
import { usePermissions } from "@/hooks/usePermissions"
import type { CampaignRole } from "@/types/auth"

interface RequireRoleProps {
  minimum: CampaignRole
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequireRole({ minimum, children, fallback = null }: RequireRoleProps) {
  const { hasRole, isLoading } = usePermissions()
  // While permissions are still loading, render nothing rather than firing
  // the fallback — prevents false-positive redirects on initial mount before
  // the campaign role has been fetched.
  if (isLoading) return null
  return hasRole(minimum) ? <>{children}</> : <>{fallback}</>
}
