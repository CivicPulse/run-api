import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { UserOrg } from "@/types/org"

// Module-level mutable state consumed by the mocked modules below.
const mockAuthState = {
  user: null as null | { profile: Record<string, unknown> },
  isInitialized: false,
}

const mockOrgsState = {
  data: undefined as UserOrg[] | undefined,
  isLoading: false,
  isFetched: false,
}

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (
    selector: (s: typeof mockAuthState) => unknown,
  ) => selector(mockAuthState),
}))

vi.mock("./useOrg", () => ({
  useMyOrgs: () => mockOrgsState,
}))

vi.mock("@/config", () => ({
  getConfig: () => ({ zitadel_project_id: "proj-1" }),
}))

import { useOrgPermissions } from "./useOrgPermissions"

const PROJECT_ID = "proj-1"
const ROLES_CLAIM = `urn:zitadel:iam:org:project:${PROJECT_ID}:roles`
const RESOURCE_OWNER_CLAIM = "urn:zitadel:iam:user:resourceowner:id"

function makeUserWithProjectRoles(
  roleMap: Record<string, Record<string, string>>,
  resourceOwnerId?: string,
) {
  const profile: Record<string, unknown> = {
    [ROLES_CLAIM]: roleMap,
  }
  if (resourceOwnerId) profile[RESOURCE_OWNER_CLAIM] = resourceOwnerId
  return { profile }
}

function makeUserWithResourceOwnerOnly(resourceOwnerId: string) {
  return {
    profile: {
      [RESOURCE_OWNER_CLAIM]: resourceOwnerId,
    },
  }
}

describe("useOrgPermissions", () => {
  beforeEach(() => {
    mockAuthState.user = null
    mockAuthState.isInitialized = false
    mockOrgsState.data = undefined
    mockOrgsState.isLoading = false
    mockOrgsState.isFetched = false
  })

  it("returns isLoading=true when authStore is not yet initialized", () => {
    mockAuthState.isInitialized = false
    mockOrgsState.data = undefined
    mockOrgsState.isLoading = false
    mockOrgsState.isFetched = false

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.orgRole).toBeUndefined()
    expect(result.current.currentOrg).toBeUndefined()
    expect(result.current.orgs).toEqual([])
  })

  it("returns isLoading=true when user is authenticated but orgs query still pending", () => {
    mockAuthState.isInitialized = true
    mockAuthState.user = makeUserWithProjectRoles({
      org_owner: { "org-abc": "Acme" },
    })
    mockOrgsState.data = undefined
    mockOrgsState.isLoading = true
    mockOrgsState.isFetched = false

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.isLoading).toBe(true)
  })

  it("resolves org_owner role from JWT claim + useMyOrgs match", () => {
    mockAuthState.isInitialized = true
    mockAuthState.user = makeUserWithProjectRoles({
      org_owner: { "org-abc": "Acme" },
    })
    mockOrgsState.data = [
      {
        id: "internal-1",
        name: "Acme",
        zitadel_org_id: "org-abc",
        role: "org_owner",
      },
    ]
    mockOrgsState.isLoading = false
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.orgRole).toBe("org_owner")
    expect(result.current.currentOrg?.zitadel_org_id).toBe("org-abc")
    expect(result.current.hasOrgRole("org_admin")).toBe(true)
    expect(result.current.hasOrgRole("org_owner")).toBe(true)
  })

  it("resolves org_admin role and denies org_owner access", () => {
    mockAuthState.isInitialized = true
    mockAuthState.user = makeUserWithProjectRoles({
      org_admin: { "org-xyz": "Beta" },
    })
    mockOrgsState.data = [
      {
        id: "internal-2",
        name: "Beta",
        zitadel_org_id: "org-xyz",
        role: "org_admin",
      },
    ]
    mockOrgsState.isLoading = false
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.orgRole).toBe("org_admin")
    expect(result.current.hasOrgRole("org_admin")).toBe(true)
    expect(result.current.hasOrgRole("org_owner")).toBe(false)
  })

  it("returns undefined orgRole when JWT claims name orgs not in useMyOrgs", () => {
    mockAuthState.isInitialized = true
    mockAuthState.user = makeUserWithProjectRoles({
      org_owner: { "org-missing": "Ghost" },
    })
    mockOrgsState.data = [
      {
        id: "internal-3",
        name: "Acme",
        zitadel_org_id: "org-different",
        role: "org_owner",
      },
    ]
    mockOrgsState.isLoading = false
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.orgRole).toBeUndefined()
    expect(result.current.currentOrg).toBeUndefined()
    expect(result.current.hasOrgRole("org_admin")).toBe(false)
    expect(result.current.hasOrgRole("org_owner")).toBe(false)
  })

  it("falls back to resourceowner:id claim when project roles claim is absent", () => {
    mockAuthState.isInitialized = true
    mockAuthState.user = makeUserWithResourceOwnerOnly("org-home")
    mockOrgsState.data = [
      {
        id: "internal-home",
        name: "Home Org",
        zitadel_org_id: "org-home",
        role: "org_admin",
      },
    ]
    mockOrgsState.isLoading = false
    mockOrgsState.isFetched = true

    const { result } = renderHook(() => useOrgPermissions())

    expect(result.current.currentOrg?.zitadel_org_id).toBe("org-home")
    expect(result.current.orgRole).toBe("org_admin")
    expect(result.current.hasOrgRole("org_admin")).toBe(true)
    expect(result.current.hasOrgRole("org_owner")).toBe(false)
  })
})
