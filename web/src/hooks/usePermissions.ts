import { useAuthStore } from "@/stores/authStore"
import { useParams } from "@tanstack/react-router"
import { useMyCampaignRole } from "./useUsers"
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

export function usePermissions(): { role: CampaignRole; hasRole: (minimum: CampaignRole) => boolean } {
  const user = useAuthStore((s) => s.user)

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

  let role: CampaignRole = "viewer"

  if (user) {
    const projectId = getConfig().zitadel_project_id
    const claimKey = `urn:zitadel:iam:org:project:${projectId}:roles`
    const claims = user.profile as Record<string, unknown>

    if (claimKey in claims) {
      const roleMap = claims[claimKey] as Record<string, unknown>
      const foundRoles = Object.keys(roleMap).filter(
        (r): r is CampaignRole => r in ROLE_HIERARCHY
      )
      if (foundRoles.length > 0) {
        // Pick the highest role
        role = foundRoles.reduce((best, r) =>
          ROLE_HIERARCHY[r as CampaignRole] > ROLE_HIERARCHY[best]
            ? (r as CampaignRole)
            : best
        , foundRoles[0] as CampaignRole)
      } else {
        role = "viewer"
      }
    } else {
      // Claim key not present — fall back to API
      if (!_warnedMissingClaim) {
        console.warn("Role claim missing from JWT, falling back to API")
        _warnedMissingClaim = true
      }
      if (apiRole && apiRole in ROLE_HIERARCHY) {
        role = apiRole as CampaignRole
      }
    }
  }

  const hasRole = (minimum: CampaignRole): boolean =>
    ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum]

  return { role, hasRole }
}
