import React from "react"
import { useOrgPermissions } from "@/hooks/useOrgPermissions"
import type { OrgRole } from "@/hooks/useOrgPermissions"

interface RequireOrgRoleProps {
  minimum: OrgRole
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequireOrgRole({
  minimum,
  children,
  fallback = null,
}: RequireOrgRoleProps) {
  const { hasOrgRole, isLoading } = useOrgPermissions()
  // While permissions are still loading, render nothing rather than firing
  // the fallback — prevents false-positive redirects on initial mount before
  // org roles have been fetched.
  if (isLoading) return null
  return hasOrgRole(minimum) ? (
    <>{children}</>
  ) : (
    <>{fallback}</>
  )
}
