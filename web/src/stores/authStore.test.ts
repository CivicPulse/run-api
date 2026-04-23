import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function emptyResponse(status: number): Response {
  return new Response("", { status })
}

type AuthStoreModule = typeof import("./authStore")

async function freshStore(): Promise<AuthStoreModule> {
  vi.resetModules()
  return (await import("./authStore")) as AuthStoreModule
}

const me = {
  id: "user-1",
  email: "a@example.com",
  display_name: "Alice",
  org_id: "org-1",
  org_ids: ["org-1"],
  role: { name: "admin", permissions: [] },
  is_active: true,
  is_verified: true,
}

describe("authStore (native cookie)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  describe("fetchMe", () => {
    it("on 200 sets user + status=authenticated", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(me))
      const { useAuthStore } = await freshStore()
      await useAuthStore.getState().fetchMe()
      const state = useAuthStore.getState()
      expect(state.user).toEqual(me)
      expect(state.status).toBe("authenticated")
    })

    it("on 401 sets user=null + status=unauthenticated", async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(401))
      const { useAuthStore } = await freshStore()
      await useAuthStore.getState().fetchMe()
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.status).toBe("unauthenticated")
    })
  })

  describe("loginWithPassword", () => {
    it("posts OAuth2 form body then calls fetchMe", async () => {
      fetchMock
        .mockResolvedValueOnce(emptyResponse(204)) // login
        .mockResolvedValueOnce(jsonResponse(me)) // fetchMe
      const { useAuthStore } = await freshStore()
      const result = await useAuthStore
        .getState()
        .loginWithPassword("a@example.com", "pw12345678901")
      expect(result).toBeNull()
      expect(useAuthStore.getState().user).toEqual(me)
      const loginReq = fetchMock.mock.calls[0][0] as Request
      expect(loginReq.method).toBe("POST")
      expect(loginReq.headers.get("Content-Type")).toMatch(
        /application\/x-www-form-urlencoded/,
      )
    })

    it("returns not_verified failure on LOGIN_USER_NOT_VERIFIED", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "LOGIN_USER_NOT_VERIFIED" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      )
      const { useAuthStore } = await freshStore()
      const result = await useAuthStore
        .getState()
        .loginWithPassword("a@example.com", "pw")
      expect(result?.kind).toBe("not_verified")
    })

    it("returns bad_credentials failure on LOGIN_BAD_CREDENTIALS", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "LOGIN_BAD_CREDENTIALS" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      )
      const { useAuthStore } = await freshStore()
      const result = await useAuthStore
        .getState()
        .loginWithPassword("a@example.com", "pw")
      expect(result?.kind).toBe("bad_credentials")
    })
  })

  describe("logout", () => {
    it("POSTs /auth/logout and clears state", async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204))
      const { useAuthStore } = await freshStore()
      useAuthStore.setState({ user: me, status: "authenticated" })
      await useAuthStore.getState().logout()
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.status).toBe("unauthenticated")
    })

    it("clears state even when logout request fails", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network"))
      const { useAuthStore } = await freshStore()
      useAuthStore.setState({ user: me, status: "authenticated" })
      await useAuthStore.getState().logout()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().status).toBe("unauthenticated")
    })
  })
})
