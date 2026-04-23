import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { UserOrg } from "@/types/org"

type MockMe = {
  id: string
  email: string
  display_name: string
  org_id: string | null
  org_ids: string[]
  role: { name: string; permissions: string[] } | null
  is_active: boolean
  is_verified: boolean
}

// Module-level mutable state consumed by the mocked modules below.
const mockAuthState = {
  user: null as MockMe | null,
  status: "unknown" as "unknown" | "authenticated" | "unauthenticated",
}

const mockOrgsState = {
  data: undefined as UserOrg[] | undefined,
  isLoading: false,
  isFetched: false,
}

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}))

vi.mock("./useOrg", () => ({
  useMyOrgs: () => mockOrgsState,
}))

import { useOrgPermissions } from "./useOrgPermissions"

function makeMe(orgIds: string[], primaryOrgId?: string | null): MockMe {
  return {
    id: "u1",
    email: "a@example.com",
    display_name: "Alice",
    org_id: primaryOrgId === undefined ? orgIds[0] ?? null : primaryOrgId,
    org_ids: orgIds,
    role: null,
    is_active: true,
    is_verified: true,
  }
}

describe("useOrgPermissions", () => {
  beforeEach(() => {
    mockAuthState.user = null
    mockAuthState.status = "unknown"
    mockOrgsState.data = undefined
    mockOrgsState.isLoading = false
    mockOrgsState.isFetched = false
  })

  it("returns isLoading=true when auth status is unknown", () => {
    mockAuthState.status = "unknown"
    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.orgRole).toBeUndefined()
    expect(result.current.currentOrg).toBeUndefined()
    expect(result.current.orgs).toEqual([])
  })

  it("returns isLoading=true when user is authenticated but orgs query still pending", () => {
    mockAuthState.status = "authenticated"
    mockAuthState.user = makeMe(["org-abc"])
    mockOrgsState.data = undefined
    mockOrgsState.isLoading = true
    mockOrgsState.isFetched = false

    const { result } = renderHook(() => useOrgPermissions())
    expect(result.current.isLoading).toBe(true)
  })

  it("resolves org_owner role via me.org_ids match", () => {
    mockAuthState.status = "authenticated"
    mockAuthState.user = makeMe(["org-abc"])
    mockOrgsState.data = [
      {
        id: "internal-1",
        name: "Acme",
        zitadel_org_id: "org-abc",
        role: "org_owner",
      },
    ]
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.orgRole).toBe("org_owner")
    expect(result.current.currentOrg?.zitadel_org_id).toBe("org-abc")
    expect(result.current.hasOrgRole("org_admin")).toBe(true)
    expect(result.current.hasOrgRole("org_owner")).toBe(true)
  })

  it("resolves org_admin role and denies org_owner access", () => {
    mockAuthState.status = "authenticated"
    mockAuthState.user = makeMe(["org-xyz"])
    mockOrgsState.data = [
      {
        id: "internal-2",
        name: "Beta",
        zitadel_org_id: "org-xyz",
        role: "org_admin",
      },
    ]
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.orgRole).toBe("org_admin")
    expect(result.current.hasOrgRole("org_admin")).toBe(true)
    expect(result.current.hasOrgRole("org_owner")).toBe(false)
  })

  it("returns undefined orgRole when me.org_ids name orgs not in useMyOrgs", () => {
    mockAuthState.status = "authenticated"
    mockAuthState.user = makeMe(["org-missing"])
    mockOrgsState.data = [
      {
        id: "internal-3",
        name: "Acme",
        zitadel_org_id: "org-different",
        role: "org_owner",
      },
    ]
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.orgRole).toBeUndefined()
    expect(result.current.currentOrg).toBeUndefined()
    expect(result.current.hasOrgRole("org_admin")).toBe(false)
    expect(result.current.hasOrgRole("org_owner")).toBe(false)
  })

  it("uses primary org_id when org_ids is empty", () => {
    mockAuthState.status = "authenticated"
    mockAuthState.user = makeMe([], "org-home")
    mockOrgsState.data = [
      {
        id: "internal-home",
        name: "Home Org",
        zitadel_org_id: "org-home",
        role: "org_admin",
      },
    ]
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.currentOrg?.zitadel_org_id).toBe("org-home")
    expect(result.current.orgRole).toBe("org_admin")
    expect(result.current.hasOrgRole("org_admin")).toBe(true)
    expect(result.current.hasOrgRole("org_owner")).toBe(false)
  })
})
