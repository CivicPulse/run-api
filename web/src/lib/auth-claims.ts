import { ROLE_HIERARCHY } from "@/hooks/usePermissions"
import type { CampaignRole } from "@/types/auth"

export function getHighestRoleFromClaims(
  claims: Record<string, unknown>,
  projectId: string,
): CampaignRole | null {
  if (!projectId) return null

  const claimKey = `urn:zitadel:iam:org:project:${projectId}:roles`
  if (!(claimKey in claims)) return null

  const roleMap = claims[claimKey] as Record<string, unknown>
  const foundRoles = Object.keys(roleMap).filter(
    (role): role is CampaignRole => role in ROLE_HIERARCHY,
  )

  if (foundRoles.length === 0) return null

  return foundRoles.reduce((best, role) =>
    ROLE_HIERARCHY[role] > ROLE_HIERARCHY[best] ? role : best,
  foundRoles[0])
}
