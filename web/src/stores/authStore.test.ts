import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import type { User } from "oidc-client-ts"

// Event handler registry captured from UserManager.events.addXxx
const eventHandlers: Record<string, (...args: unknown[]) => void> = {}

// Call-order tracking for logout sequencing tests
const callOrder: string[] = []

const mockUserManager = {
  getUser: vi.fn().mockResolvedValue(null),
  signinRedirect: vi.fn().mockResolvedValue(undefined),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(() => {
    callOrder.push("signoutRedirect")
    return Promise.resolve()
  }),
  removeUser: vi.fn(() => {
    callOrder.push("removeUser")
    return Promise.resolve()
  }),
  events: {
    addUserLoaded: vi.fn((cb: (user: User) => void) => {
      eventHandlers.userLoaded = cb as (...args: unknown[]) => void
    }),
    addUserUnloaded: vi.fn((cb: () => void) => {
      eventHandlers.userUnloaded = cb as (...args: unknown[]) => void
    }),
    addAccessTokenExpired: vi.fn((cb: () => void) => {
      eventHandlers.tokenExpired = cb as (...args: unknown[]) => void
    }),
  },
}

vi.mock("oidc-client-ts", () => ({
  UserManager: vi.fn().mockImplementation(function () {
    return mockUserManager
  }),
  WebStorageStateStore: vi.fn().mockImplementation(function () {
    return {}
  }),
}))

vi.mock("@/config", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    zitadel_issuer: "https://test.example",
    zitadel_client_id: "test-client",
    zitadel_project_id: "test-project",
  }),
}))

const fakeUser = {
  access_token: "token-abc",
  expired: false,
  profile: { sub: "user-1" },
} as unknown as User

type AuthStoreModule = typeof import("./authStore")

async function freshStore(): Promise<AuthStoreModule> {
  vi.resetModules()
  const mod = await import("./authStore")
  await mod.useAuthStore.getState().initialize()
  return mod
}

describe("authStore", () => {
  beforeEach(() => {
    callOrder.length = 0
    for (const key of Object.keys(eventHandlers)) delete eventHandlers[key]
    mockUserManager.getUser.mockClear().mockResolvedValue(null)
    mockUserManager.signinRedirect.mockClear().mockResolvedValue(undefined)
    mockUserManager.signinRedirectCallback.mockClear()
    mockUserManager.signoutRedirect
      .mockClear()
      .mockImplementation(() => {
        callOrder.push("signoutRedirect")
        return Promise.resolve()
      })
    mockUserManager.removeUser.mockClear().mockImplementation(() => {
      callOrder.push("removeUser")
      return Promise.resolve()
    })
    mockUserManager.events.addUserLoaded.mockClear()
    mockUserManager.events.addUserUnloaded.mockClear()
    mockUserManager.events.addAccessTokenExpired.mockClear()
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe("Token storage", () => {
    it("getAccessToken returns user.access_token when user is set", async () => {
      const { useAuthStore } = await freshStore()
      eventHandlers.userLoaded(fakeUser)
      expect(useAuthStore.getState().getAccessToken()).toBe("token-abc")
    })

    it("getAccessToken returns null when user is null", async () => {
      const { useAuthStore } = await freshStore()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().getAccessToken()).toBeNull()
    })
  })

  describe("OIDC events", () => {
    it("addUserLoaded handler sets user + isAuthenticated=true", async () => {
      const { useAuthStore } = await freshStore()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      eventHandlers.userLoaded(fakeUser)
      const state = useAuthStore.getState()
      expect(state.user).toBe(fakeUser)
      expect(state.isAuthenticated).toBe(true)
    })

    it("addUserUnloaded handler clears user + isAuthenticated=false", async () => {
      const { useAuthStore } = await freshStore()
      eventHandlers.userLoaded(fakeUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      eventHandlers.userUnloaded()
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it("addAccessTokenExpired handler clears user + isAuthenticated=false", async () => {
      const { useAuthStore } = await freshStore()
      eventHandlers.userLoaded(fakeUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      eventHandlers.tokenExpired()
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe("switchOrg", () => {
    it("calls signinRedirect with scope containing org id", async () => {
      const { useAuthStore } = await freshStore()
      await useAuthStore.getState().switchOrg("org-123")
      expect(mockUserManager.signinRedirect).toHaveBeenCalledTimes(1)
      const args = mockUserManager.signinRedirect.mock.calls[0][0] as {
        scope: string
      }
      expect(args.scope).toContain("urn:zitadel:iam:org:id:org-123")
    })

    it("scope includes profile, email, project aud and roles claims", async () => {
      const { useAuthStore } = await freshStore()
      await useAuthStore.getState().switchOrg("org-xyz")
      const args = mockUserManager.signinRedirect.mock.calls[0][0] as {
        scope: string
      }
      expect(args.scope).toContain("openid")
      expect(args.scope).toContain("profile")
      expect(args.scope).toContain("email")
      expect(args.scope).toContain(
        "urn:zitadel:iam:org:project:id:test-project:aud",
      )
      expect(args.scope).toContain(
        "urn:zitadel:iam:org:project:id:test-project:roles",
      )
      expect(args.scope).toContain("urn:zitadel:iam:org:projects:roles")
    })
  })

  describe("logout", () => {
    it("calls removeUser() then resets state then signoutRedirect() in order", async () => {
      const { useAuthStore } = await freshStore()
      // Seed a user so we can observe the reset-before-redirect invariant
      eventHandlers.userLoaded(fakeUser)
      expect(useAuthStore.getState().user).toBe(fakeUser)

      // Instrument signoutRedirect to capture store state at the moment
      // it is invoked — proves state was cleared BEFORE redirect.
      let userAtRedirect: User | null | "unset" = "unset"
      mockUserManager.signoutRedirect.mockImplementationOnce(() => {
        callOrder.push("signoutRedirect")
        userAtRedirect = useAuthStore.getState().user
        return Promise.resolve()
      })

      await useAuthStore.getState().logout()

      expect(callOrder).toEqual(["removeUser", "signoutRedirect"])
      expect(userAtRedirect).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it("clears local state even when signoutRedirect rejects", async () => {
      const { useAuthStore } = await freshStore()
      eventHandlers.userLoaded(fakeUser)
      expect(useAuthStore.getState().user).toBe(fakeUser)

      mockUserManager.signoutRedirect.mockRejectedValueOnce(new Error("boom"))

      await expect(useAuthStore.getState().logout()).rejects.toThrow("boom")

      // Cleanup happened BEFORE the redirect that threw.
      expect(mockUserManager.removeUser).toHaveBeenCalledTimes(1)
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })
})
