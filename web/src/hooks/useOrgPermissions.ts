import { useMyOrgs } from "./useOrg"
import { useAuthStore } from "@/stores/authStore"
import { getConfig } from "@/config"

export type OrgRole = "org_owner" | "org_admin"

const ORG_ROLE_LEVELS: Record<OrgRole, number> = {
  org_admin: 0,
  org_owner: 1,
}

export function useOrgPermissions() {
  const user = useAuthStore((s) => s.user)
  const { data: orgs } = useMyOrgs()

  // Collect all org IDs from JWT role claims (multi-tenant support).
  // resourceowner:id is the user's home org which may differ from tenant orgs.
  const allOrgIds = new Set<string>()
  const resourceOwnerId = user?.profile?.[
    "urn:zitadel:iam:user:resourceowner:id"
  ] as string | undefined
  if (resourceOwnerId) allOrgIds.add(resourceOwnerId)

  try {
    const projectId = getConfig().zitadel_project_id
    const claimKey = `urn:zitadel:iam:org:project:${projectId}:roles`
    const roleMap = (user?.profile as Record<string, unknown>)?.[claimKey] as
      | Record<string, Record<string, string>>
      | undefined
    if (roleMap) {
      for (const orgMap of Object.values(roleMap)) {
        if (orgMap && typeof orgMap === "object") {
          for (const id of Object.keys(orgMap)) {
            allOrgIds.add(id)
          }
        }
      }
    }
  } catch {
    // Config not yet loaded
  }

  const currentOrg = orgs?.find((o) => allOrgIds.has(o.zitadel_org_id))
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
