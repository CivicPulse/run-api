import { describe, expect, it } from "vitest"
import { getHighestRoleFromClaims } from "./auth-claims"
import type { MeResponse } from "@/stores/authStore"

function makeMe(roleName: string | null): MeResponse {
  return {
    id: "user-1",
    email: "a@example.com",
    display_name: "Alice",
    org_id: "org-1",
    org_ids: ["org-1"],
    role: roleName ? { name: roleName, permissions: [] } : null,
    is_active: true,
    is_verified: true,
  }
}

describe("getHighestRoleFromClaims (MeResponse)", () => {
  it("returns null when me is null", () => {
    expect(getHighestRoleFromClaims(null)).toBeNull()
    expect(getHighestRoleFromClaims(undefined)).toBeNull()
  })

  it("returns null when role is null", () => {
    expect(getHighestRoleFromClaims(makeMe(null))).toBeNull()
  })

  it("returns the role name reported by /auth/me", () => {
    expect(getHighestRoleFromClaims(makeMe("admin"))).toBe("admin")
    expect(getHighestRoleFromClaims(makeMe("owner"))).toBe("owner")
  })

  it("lowercases the name to match CampaignRole", () => {
    expect(getHighestRoleFromClaims(makeMe("ADMIN"))).toBe("admin")
  })

  it("returns null for unrecognized roles", () => {
    expect(getHighestRoleFromClaims(makeMe("random_role"))).toBeNull()
  })
})
