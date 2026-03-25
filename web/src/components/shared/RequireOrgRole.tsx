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
  const { hasOrgRole } = useOrgPermissions()
  return hasOrgRole(minimum) ? (
    <>{children}</>
  ) : (
    <>{fallback}</>
  )
}
