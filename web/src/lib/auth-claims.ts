import { ROLE_HIERARCHY } from "@/hooks/usePermissions"
import type { MeResponse } from "@/stores/authStore"
import type { CampaignRole } from "@/types/auth"

/**
 * Return the user's highest role, as reported by `/auth/me`.
 *
 * Historically this function decoded a ZITADEL JWT claim map. With native
 * cookie sessions, the backend has already computed the "best" role across
 * all orgs (see `_authenticated_user_from_db`) and returns it on `me.role`.
 * We keep the function name so existing call-sites don't churn — the
 * second argument (formerly `projectId`) is accepted and ignored for
 * backward compatibility.
 */
export function getHighestRoleFromClaims(
  me: MeResponse | null | undefined,
  _projectId?: string,
): CampaignRole | null {
  if (!me || !me.role) return null
  const name = me.role.name.toLowerCase()
  if (name in ROLE_HIERARCHY) return name as CampaignRole
  return null
}
