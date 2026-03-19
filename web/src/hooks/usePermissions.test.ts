import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { usePermissions, ROLE_HIERARCHY } from "./usePermissions"

// Mock authStore
vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(),
}))

// Mock useUsers
vi.mock("./useUsers", () => ({
  useMyCampaignRole: vi.fn(),
}))

// Mock TanStack Router useParams
vi.mock("@tanstack/react-router", () => ({
  useParams: vi.fn(() => ({ campaignId: "test-campaign-id" })),
}))

// Mock config so the hook can resolve the ZITADEL project ID
vi.mock("@/config", () => ({
  getConfig: vi.fn(() => ({ zitadel_project_id: "test-project-id" })),
  loadConfig: vi.fn(),
}))

import { useAuthStore } from "@/stores/authStore"
import { useMyCampaignRole } from "./useUsers"

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>
const mockUseMyCampaignRole = useMyCampaignRole as unknown as ReturnType<typeof vi.fn>

const PROJECT_ID = "test-project-id"

function makeUserWithRole(role: string) {
  return {
    profile: {
      [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: {
        [role]: { "org-id": "test-org" },
      },
    },
  }
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
    // Default: no fallback role needed
    mockUseMyCampaignRole.mockReturnValue(null)
    // Set the project ID env var
    vi.stubEnv("VITE_ZITADEL_PROJECT_ID", PROJECT_ID)
  })

  it("returns viewer role when user is null", () => {
    mockUseAuthStore.mockReturnValue(null)
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("viewer")
  })

  it("extracts owner role from JWT claims", () => {
    mockUseAuthStore.mockReturnValue(makeUserWithRole("owner"))
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("owner")
  })

  it("extracts admin role from JWT claims", () => {
    mockUseAuthStore.mockReturnValue(makeUserWithRole("admin"))
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("admin")
  })

  it("extracts manager role from JWT claims", () => {
    mockUseAuthStore.mockReturnValue(makeUserWithRole("manager"))
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("manager")
  })

  it("extracts volunteer role from JWT claims", () => {
    mockUseAuthStore.mockReturnValue(makeUserWithRole("volunteer"))
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("volunteer")
  })

  it("extracts viewer role from JWT claims", () => {
    mockUseAuthStore.mockReturnValue(makeUserWithRole("viewer"))
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("viewer")
  })

  it("selects highest role when multiple roles are present in JWT", () => {
    mockUseAuthStore.mockReturnValue({
      profile: {
        [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: {
          volunteer: { "org-id": "test-org" },
          admin: { "org-id": "test-org" },
        },
      },
    })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("admin")
  })

  it("falls back to API when JWT claim key is missing", () => {
    mockUseAuthStore.mockReturnValue({ profile: {} })
    mockUseMyCampaignRole.mockReturnValue("manager")
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("manager")
    expect(mockUseMyCampaignRole).toHaveBeenCalledWith("test-campaign-id")
  })

  it("defaults to viewer when JWT claim missing and API returns null", () => {
    mockUseAuthStore.mockReturnValue({ profile: {} })
    mockUseMyCampaignRole.mockReturnValue(null)
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBe("viewer")
  })

  describe("hasRole", () => {
    it("viewer hasRole('viewer') returns true", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("viewer"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("viewer")).toBe(true)
    })

    it("viewer hasRole('volunteer') returns false", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("viewer"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("volunteer")).toBe(false)
    })

    it("owner hasRole('viewer') returns true", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("owner"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("viewer")).toBe(true)
    })

    it("owner hasRole('owner') returns true", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("owner"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("owner")).toBe(true)
    })

    it("admin hasRole('owner') returns false", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("admin"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("owner")).toBe(false)
    })

    it("admin hasRole('admin') returns true", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("admin"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("admin")).toBe(true)
    })

    it("admin hasRole('manager') returns true", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("admin"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("manager")).toBe(true)
    })

    it("manager hasRole('admin') returns false", () => {
      mockUseAuthStore.mockReturnValue(makeUserWithRole("manager"))
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("admin")).toBe(false)
    })

    it("null user hasRole('viewer') returns true", () => {
      mockUseAuthStore.mockReturnValue(null)
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("viewer")).toBe(true)
    })

    it("null user hasRole('volunteer') returns false", () => {
      mockUseAuthStore.mockReturnValue(null)
      const { result } = renderHook(() => usePermissions())
      expect(result.current.hasRole("volunteer")).toBe(false)
    })
  })
})
