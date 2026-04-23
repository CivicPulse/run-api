import { useMyOrgs } from "./useOrg"
import { useAuthStore } from "@/stores/authStore"

export type OrgRole = "org_owner" | "org_admin"

const ORG_ROLE_LEVELS: Record<OrgRole, number> = {
  org_admin: 0,
  org_owner: 1,
}

export function useOrgPermissions() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const {
    data: orgs,
    isLoading: isOrgsLoading,
    isFetched: isOrgsFetched,
  } = useMyOrgs()

  // Native cookie sessions: the backend reports the full list of org IDs
  // on `/auth/me`. We use that set to pick the user's "current" org from
  // the /me/orgs list.
  const orgIds = new Set<string>(user?.org_ids ?? [])
  if (user?.org_id) orgIds.add(user.org_id)

  const currentOrg = orgs?.find((o) => orgIds.has(o.zitadel_org_id))
  const orgRole = currentOrg?.role as OrgRole | undefined

  const hasOrgRole = (minimum: OrgRole): boolean => {
    if (!orgRole || !(orgRole in ORG_ROLE_LEVELS)) return false
    return ORG_ROLE_LEVELS[orgRole] >= ORG_ROLE_LEVELS[minimum]
  }

  // isLoading: auth still initializing, OR authenticated user has no org
  // data resolved yet (TanStack Query pending on first fetch). Guards should
  // treat this as "pending" — render null rather than firing <Navigate>,
  // which would cause a false-positive redirect before roles resolve.
  const isLoading =
    status === "unknown" || (!!user && !orgs && isOrgsLoading && !isOrgsFetched)

  return {
    orgRole,
    hasOrgRole,
    currentOrg,
    orgs: orgs ?? [],
    isLoading,
  }
}
