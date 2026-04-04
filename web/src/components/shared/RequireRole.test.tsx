import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { RequireRole } from "./RequireRole"

// Mock usePermissions
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: vi.fn(),
}))

import { usePermissions } from "@/hooks/usePermissions"

const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>

function makeHasRole(currentRole: string) {
  const hierarchy: Record<string, number> = {
    viewer: 0,
    volunteer: 1,
    manager: 2,
    admin: 3,
    owner: 4,
  }
  return (minimum: string) => (hierarchy[currentRole] ?? 0) >= (hierarchy[minimum] ?? 0)
}

function mockPerms(role: string, opts: { isLoading?: boolean } = {}) {
  mockUsePermissions.mockReturnValue({
    role,
    hasRole: makeHasRole(role),
    isLoading: opts.isLoading ?? false,
  })
}

describe("RequireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders children when user meets the minimum role", () => {
    mockPerms("admin")
    render(
      <RequireRole minimum="manager">
        <span>Protected content</span>
      </RequireRole>
    )
    expect(screen.getByText("Protected content")).toBeInTheDocument()
  })

  it("renders children when user exactly meets the minimum role", () => {
    mockPerms("manager")
    render(
      <RequireRole minimum="manager">
        <span>Manager content</span>
      </RequireRole>
    )
    expect(screen.getByText("Manager content")).toBeInTheDocument()
  })

  it("does not render children when user is below minimum role", () => {
    mockPerms("volunteer")
    render(
      <RequireRole minimum="admin">
        <span>Admin-only content</span>
      </RequireRole>
    )
    expect(screen.queryByText("Admin-only content")).not.toBeInTheDocument()
  })

  it("renders null fallback by default when role is insufficient", () => {
    mockPerms("viewer")
    const { container } = render(
      <RequireRole minimum="owner">
        <span>Owner content</span>
      </RequireRole>
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders custom fallback when provided and role is insufficient", () => {
    mockPerms("volunteer")
    render(
      <RequireRole minimum="owner" fallback={<span>Access denied</span>}>
        <span>Owner content</span>
      </RequireRole>
    )
    expect(screen.queryByText("Owner content")).not.toBeInTheDocument()
    expect(screen.getByText("Access denied")).toBeInTheDocument()
  })

  it("RequireRole with minimum='viewer' always renders children", () => {
    mockPerms("viewer")
    render(
      <RequireRole minimum="viewer">
        <span>Public content</span>
      </RequireRole>
    )
    expect(screen.getByText("Public content")).toBeInTheDocument()
  })

  it("RequireRole with minimum='owner' only renders for owners", () => {
    mockPerms("owner")
    render(
      <RequireRole minimum="owner">
        <span>Owner-only content</span>
      </RequireRole>
    )
    expect(screen.getByText("Owner-only content")).toBeInTheDocument()
  })

  it("RequireRole with minimum='owner' hides children for admin", () => {
    mockPerms("admin")
    render(
      <RequireRole minimum="owner">
        <span>Owner-only content</span>
      </RequireRole>
    )
    expect(screen.queryByText("Owner-only content")).not.toBeInTheDocument()
  })

  it("renders null (not fallback) while permissions are loading", () => {
    // Role defaults to viewer during load; do NOT fire fallback.
    mockPerms("viewer", { isLoading: true })
    const { container } = render(
      <RequireRole minimum="admin" fallback={<span>Access denied</span>}>
        <span>Admin content</span>
      </RequireRole>
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText("Access denied")).not.toBeInTheDocument()
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument()
  })

  it("does not render children while permissions are loading even if role would match", () => {
    // Even if role would match, do not render children until load resolves.
    mockPerms("admin", { isLoading: true })
    const { container } = render(
      <RequireRole minimum="admin">
        <span>Admin content</span>
      </RequireRole>
    )
    expect(container.firstChild).toBeNull()
  })
})
