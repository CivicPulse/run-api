import { useAuthStore } from "@/stores/authStore"
import { useParams } from "@tanstack/react-router"
import { useMyCampaignRole, useMyCampaigns } from "./useUsers"
import type { CampaignRole } from "@/types/auth"

export type { CampaignRole }

export const ROLE_HIERARCHY: Record<CampaignRole, number> = {
  viewer: 0,
  volunteer: 1,
  manager: 2,
  admin: 3,
  owner: 4,
}

export function usePermissions(): {
  role: CampaignRole
  hasRole: (minimum: CampaignRole) => boolean
  isLoading: boolean
} {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)

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
    // 1. Base role from /auth/me (org-wide upper-bound role)
    const meRoleName = user.role?.name?.toLowerCase() ?? ""
    const baseRole: CampaignRole =
      meRoleName in ROLE_HIERARCHY ? (meRoleName as CampaignRole) : "viewer"

    // 2. Resolve effective role: per-campaign API role takes priority
    // when we're in a campaign context
    role =
      campaignId && apiRole && apiRole in ROLE_HIERARCHY
        ? (apiRole as CampaignRole)
        : baseRole
  }

  const hasRole = (minimum: CampaignRole): boolean =>
    ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum]

  // isLoading: auth still initializing, OR we're in a campaign context and
  // the per-campaign role fetch is still pending (no cached data yet). Guards
  // should treat this as "pending" — render null rather than firing
  // <Navigate>, which would cause a false-positive redirect before the API
  // role resolves.
  const isLoading =
    status === "unknown" ||
    (!!user &&
      !!campaignId &&
      !campaigns &&
      isCampaignsLoading &&
      !isCampaignsFetched)

  return { role, hasRole, isLoading }
}
