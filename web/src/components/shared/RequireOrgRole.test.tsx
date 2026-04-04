import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { RequireOrgRole } from "./RequireOrgRole"

// Mock useOrgPermissions
vi.mock("@/hooks/useOrgPermissions", () => ({
  useOrgPermissions: vi.fn(),
}))

import { useOrgPermissions } from "@/hooks/useOrgPermissions"

const mockUseOrgPermissions = useOrgPermissions as unknown as ReturnType<
  typeof vi.fn
>

function makeHasOrgRole(currentRole: string | undefined) {
  const levels: Record<string, number> = {
    org_admin: 0,
    org_owner: 1,
  }
  return (minimum: string) => {
    if (!currentRole || !(currentRole in levels)) return false
    return (levels[currentRole] ?? -1) >= (levels[minimum] ?? 0)
  }
}

function mockPerms(
  role: string | undefined,
  opts: { isLoading?: boolean } = {}
) {
  mockUseOrgPermissions.mockReturnValue({
    orgRole: role,
    hasOrgRole: makeHasOrgRole(role),
    currentOrg: undefined,
    orgs: [],
    isLoading: opts.isLoading ?? false,
  })
}

describe("RequireOrgRole", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders children when user meets the minimum org role", () => {
    mockPerms("org_admin")
    render(
      <RequireOrgRole minimum="org_admin">
        <span>Org admin content</span>
      </RequireOrgRole>
    )
    expect(screen.getByText("Org admin content")).toBeInTheDocument()
  })

  it("renders children for org_owner when minimum is org_admin", () => {
    mockPerms("org_owner")
    render(
      <RequireOrgRole minimum="org_admin">
        <span>Admin-minimum content</span>
      </RequireOrgRole>
    )
    expect(screen.getByText("Admin-minimum content")).toBeInTheDocument()
  })

  it("does not render children when user has no org role", () => {
    mockPerms(undefined)
    render(
      <RequireOrgRole minimum="org_admin">
        <span>Org admin content</span>
      </RequireOrgRole>
    )
    expect(screen.queryByText("Org admin content")).not.toBeInTheDocument()
  })

  it("renders fallback when role insufficient", () => {
    mockPerms(undefined)
    render(
      <RequireOrgRole
        minimum="org_admin"
        fallback={<span>Access denied</span>}
      >
        <span>Org admin content</span>
      </RequireOrgRole>
    )
    expect(screen.getByText("Access denied")).toBeInTheDocument()
    expect(screen.queryByText("Org admin content")).not.toBeInTheDocument()
  })

  it("renders null (not fallback) while permissions are loading", () => {
    // Critical: during initial load, do NOT fire the fallback <Navigate/> —
    // otherwise authenticated users with the correct role would be
    // false-positive redirected before org roles are fetched.
    mockPerms(undefined, { isLoading: true })
    const { container } = render(
      <RequireOrgRole
        minimum="org_admin"
        fallback={<span>Access denied</span>}
      >
        <span>Org admin content</span>
      </RequireOrgRole>
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText("Access denied")).not.toBeInTheDocument()
    expect(screen.queryByText("Org admin content")).not.toBeInTheDocument()
  })

  it("does not render children while loading, even if role would match", () => {
    mockPerms("org_admin", { isLoading: true })
    const { container } = render(
      <RequireOrgRole minimum="org_admin">
        <span>Org admin content</span>
      </RequireOrgRole>
    )
    expect(container.firstChild).toBeNull()
  })
})
