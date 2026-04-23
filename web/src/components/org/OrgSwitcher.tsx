import { useOrgPermissions } from "@/hooks/useOrgPermissions"

/**
 * Shows the user's current organization name.
 *
 * Historically this was a dropdown that initiated an OIDC re-auth to swap
 * org scopes. Native cookie sessions don't carry per-request org scope,
 * so a true "switch" is now a dashboard-level concern handled elsewhere.
 * Until a new switch UX is designed we simply display the current org.
 */
export function OrgSwitcher() {
  const { currentOrg, orgs } = useOrgPermissions()

  if (!currentOrg) return null
  if (orgs.length <= 1) {
    return <span className="text-sm font-medium">{currentOrg.name}</span>
  }
  // Multiple orgs: still show current org for now. Future work: add a
  // first-class org-switch picker that updates the active org server-side.
  return <span className="text-sm font-medium">{currentOrg.name}</span>
}
