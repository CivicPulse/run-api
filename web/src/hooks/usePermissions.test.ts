import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { usePermissions, ROLE_HIERARCHY } from "./usePermissions"

// Mock authStore — returns selector(state)
vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(),
}))

// Mock useUsers
vi.mock("./useUsers", () => ({
  useMyCampaignRole: vi.fn(),
  useMyCampaigns: vi.fn(() => ({
    data: [],
    isLoading: false,
    isFetched: true,
  })),
}))

// Mock TanStack Router useParams
vi.mock("@tanstack/react-router", () => ({
  useParams: vi.fn(() => ({ campaignId: "test-campaign-id" })),
}))

import { useAuthStore } from "@/stores/authStore"
import { useMyCampaignRole } from "./useUsers"

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>
const mockUseMyCampaignRole = useMyCampaignRole as unknown as ReturnType<
  typeof vi.fn
>

function meWithRole(roleName: string | null) {
  return {
    id: "u1",
    email: "a@example.com",
    display_name: "Alice",
    org_id: "org-1",
    org_ids: ["org-1"],
    role: roleName ? { name: roleName, permissions: [] } : null,
    is_active: true,
    is_verified: true,
  }
}

/**
 * The hook calls useAuthStore twice via selectors: once for `user`, once
 * for `status`. The mock runs each selector against the provided state.
 */
function installAuthState(state: {
  user: ReturnType<typeof meWithRole> | null
  status: "unknown" | "authenticated" | "unauthenticated"
}) {
  mockUseAuthStore.mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  )
}

describe("ROLE_HIERARCHY", () => {
  it("assigns correct numeric values matching backend", () => {
    expect(ROLE_HIERARCHY.viewer).toBe(0)
    expect(ROLE_HIERARCHY.volunteer).toBe(1)
    expect(ROLE_HIERARCHY.manager).toBe(2)
    expect(ROLE_HIERARCHY.admin).toBe(3)
    expect(ROLE_HIERARCHY.owner).toBe(4)
  })
})

describe("usePermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseMyCampaignRole.mockReturnValue(null)
  })

  it("returns viewer role when user is null", () => {
    installAuthState({ user: null, status: "unauthenticated" })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("viewer")
  })

  it.each([
    ["owner"],
    ["admin"],
    ["manager"],
    ["volunteer"],
    ["viewer"],
  ])("extracts %s role from /auth/me", (roleName) => {
    installAuthState({ user: meWithRole(roleName), status: "authenticated" })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe(roleName)
  })

  it("falls back to API when me.role is null", () => {
    installAuthState({ user: meWithRole(null), status: "authenticated" })
    mockUseMyCampaignRole.mockReturnValue("manager")
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("manager")
    expect(mockUseMyCampaignRole).toHaveBeenCalledWith("test-campaign-id")
  })

  it("defaults to viewer when me.role is null and API returns null", () => {
    installAuthState({ user: meWithRole(null), status: "authenticated" })
    mockUseMyCampaignRole.mockReturnValue(null)
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("viewer")
  })

  describe("hasRole", () => {
    it("viewer hasRole('viewer') returns true", () => {
      installAuthState({
        user: meWithRole("viewer"),
        status: "authenticated",
      })
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("viewer")).toBe(true)
    })

    it("viewer hasRole('volunteer') returns false", () => {
      installAuthState({
        user: meWithRole("viewer"),
        status: "authenticated",
      })
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("volunteer")).toBe(false)
    })

    it("owner hasRole('owner') returns true", () => {
      installAuthState({ user: meWithRole("owner"), status: "authenticated" })
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("owner")).toBe(true)
    })

    it("admin hasRole('owner') returns false", () => {
      installAuthState({ user: meWithRole("admin"), status: "authenticated" })
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("owner")).toBe(false)
    })

    it("null user hasRole('viewer') returns true", () => {
      installAuthState({ user: null, status: "unauthenticated" })
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("viewer")).toBe(true)
    })

    it("null user hasRole('volunteer') returns false", () => {
      installAuthState({ user: null, status: "unauthenticated" })
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("volunteer")).toBe(false)
    })
  })
})
