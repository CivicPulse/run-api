import { useAuthStore } from "@/stores/authStore"
import { useParams } from "@tanstack/react-router"
import { useMyCampaignRole, useMyCampaigns } from "./useUsers"
import { getConfig } from "@/config"
import type { CampaignRole } from "@/types/auth"

export type { CampaignRole }

export const ROLE_HIERARCHY: Record<CampaignRole, number> = {
  viewer: 0,
  volunteer: 1,
  manager: 2,
  admin: 3,
  owner: 4,
}

let _warnedMissingClaim = false

export function usePermissions(): {
  role: CampaignRole
  hasRole: (minimum: CampaignRole) => boolean
  isLoading: boolean
} {
  const user = useAuthStore((s) => s.user)
  const isInitialized = useAuthStore((s) => s.isInitialized)

  // Get campaignId for the fallback API call (may not be in route params)
  let campaignId = ""
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params = useParams({ strict: false }) as any
    campaignId = params?.campaignId ?? ""
  } catch {
    // Not in a campaign route — no campaignId available
  }

  // Always call the fallback hook unconditionally (Rules of Hooks)
  const apiRole = useMyCampaignRole(campaignId)
  const {
    data: campaigns,
    isLoading: isCampaignsLoading,
    isFetched: isCampaignsFetched,
  } = useMyCampaigns()

  let role: CampaignRole = "viewer"

  if (user) {
    // 1. Extract org-level role from JWT claims
    let jwtRole: CampaignRole = "viewer"
    let projectId: string | undefined
    try {
      projectId = getConfig().zitadel_project_id
    } catch {
      // Config not yet loaded
    }

    if (projectId) {
      const claimKey = `urn:zitadel:iam:org:project:${projectId}:roles`
      const claims = user.profile as Record<string, unknown>

      if (claimKey in claims) {
        const roleMap = claims[claimKey] as Record<string, unknown>
        const foundRoles = Object.keys(roleMap).filter(
          (r): r is CampaignRole => r in ROLE_HIERARCHY
        )
        if (foundRoles.length > 0) {
          jwtRole = foundRoles.reduce((best, r) =>
            ROLE_HIERARCHY[r as CampaignRole] > ROLE_HIERARCHY[best]
              ? (r as CampaignRole)
              : best
          , foundRoles[0] as CampaignRole)
        }
      } else if (!_warnedMissingClaim) {
        console.warn("Role claim missing from JWT, falling back to API")
        _warnedMissingClaim = true
      }
    }

    // 2. Resolve effective role: per-campaign API role takes priority
    // when we're in a campaign context
    role =
      campaignId && apiRole && apiRole in ROLE_HIERARCHY
        ? (apiRole as CampaignRole)
        : jwtRole
  }

  const hasRole = (minimum: CampaignRole): boolean =>
    ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum]

  // isLoading: auth still initializing, OR we're in a campaign context and
  // the per-campaign role fetch is still pending (no cached data yet). Guards
  // should treat this as "pending" — render null rather than firing
  // <Navigate>, which would cause a false-positive redirect before the API
  // role resolves.
  const isLoading =
    !isInitialized ||
    (!!user &&
      !!campaignId &&
      !campaigns &&
      isCampaignsLoading &&
      !isCampaignsFetched)

  return { role, hasRole, isLoading }
}
