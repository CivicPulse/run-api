import { describe, expect, it } from "vitest"
import { getHighestRoleFromClaims } from "./auth-claims"

const PROJECT_ID = "project-123"
const CLAIM_KEY = `urn:zitadel:iam:org:project:${PROJECT_ID}:roles`

describe("getHighestRoleFromClaims", () => {
  it("returns null when the project id is missing", () => {
    expect(getHighestRoleFromClaims({}, "")).toBeNull()
  })

  it("returns null when the matching role claim is absent", () => {
    expect(getHighestRoleFromClaims({}, PROJECT_ID)).toBeNull()
  })

  it("returns the highest campaign role from the claim map", () => {
    const claims = {
      [CLAIM_KEY]: {
        viewer: { org: "org-1" },
        admin: { org: "org-1" },
      },
    }

    expect(getHighestRoleFromClaims(claims, PROJECT_ID)).toBe("admin")
  })

  it("ignores unknown roles in the claim map", () => {
    const claims = {
      [CLAIM_KEY]: {
        random_role: { org: "org-1" },
      },
    }

    expect(getHighestRoleFromClaims(claims, PROJECT_ID)).toBeNull()
  })
})
