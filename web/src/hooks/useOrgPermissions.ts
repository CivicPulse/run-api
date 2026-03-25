import { useMyOrgs } from "./useOrg"
import { useAuthStore } from "@/stores/authStore"

export type OrgRole = "org_owner" | "org_admin"

const ORG_ROLE_LEVELS: Record<OrgRole, number> = {
  org_admin: 0,
  org_owner: 1,
}

export function useOrgPermissions() {
  const user = useAuthStore((s) => s.user)
  const { data: orgs } = useMyOrgs()

  // Extract current org_id from JWT claims
  const orgId = user?.profile?.[
    "urn:zitadel:iam:user:resourceowner:id"
  ] as string | undefined

  const currentOrg = orgs?.find(
    (o) => o.zitadel_org_id === orgId,
  )
  const orgRole = currentOrg?.role as OrgRole | undefined

  const hasOrgRole = (minimum: OrgRole): boolean => {
    if (!orgRole || !(orgRole in ORG_ROLE_LEVELS)) return false
    return (
      ORG_ROLE_LEVELS[orgRole] >= ORG_ROLE_LEVELS[minimum]
    )
  }

  return {
    orgRole,
    hasOrgRole,
    currentOrg,
    orgs: orgs ?? [],
  }
}
