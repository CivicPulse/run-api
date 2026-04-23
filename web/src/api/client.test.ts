import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const mockSetState = vi.fn()
const mockBootstrapCsrf = vi.fn()

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    setState: mockSetState,
  },
  bootstrapCsrf: () => mockBootstrapCsrf(),
  getCsrfCookie: () => null,
}))

import { api, AuthenticationError, PermissionError } from "./client"

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

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    mockSetState.mockReset()
    mockBootstrapCsrf.mockReset()
    fetchMock.mockReset()
    // Clear cookies between tests
    document.cookie = "cp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("credentials + CSRF", () => {
    it("sends credentials: include on GET requests", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      await api.get("test").json()
      const request = fetchMock.mock.calls[0][0] as Request
      expect(request.credentials).toBe("include")
    })

    it("attaches X-CSRF-Token header from cp_csrf cookie on POST", async () => {
      document.cookie = "cp_csrf=token-xyz"
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      await api.post("test", { json: {} }).json()
      const request = fetchMock.mock.calls[0][0] as Request
      expect(request.headers.get("X-CSRF-Token")).toBe("token-xyz")
    })

    it("bootstraps CSRF when cookie missing on mutating call", async () => {
      // Override document.cookie to return "" for this test — jsdom does
      // not honor the Thu 1970 expiry trick for cookies set via script.
      const cookieSpy = vi
        .spyOn(document, "cookie", "get")
        .mockReturnValue("")
      mockBootstrapCsrf.mockResolvedValue("fresh-token")
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      await api.post("test", { json: {} }).json()
      expect(mockBootstrapCsrf).toHaveBeenCalledTimes(1)
      const request = fetchMock.mock.calls[0][0] as Request
      expect(request.headers.get("X-CSRF-Token")).toBe("fresh-token")
      cookieSpy.mockRestore()
    })

    it("does not attach CSRF on GET", async () => {
      document.cookie = "cp_csrf=token-xyz"
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      await api.get("test").json()
      const request = fetchMock.mock.calls[0][0] as Request
      expect(request.headers.get("X-CSRF-Token")).toBeNull()
    })
  })

  describe("response error mapping (afterResponse)", () => {
    it("returns parsed body on 200 success", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ hello: "world" }))
      const result = await api.get("test").json<{ hello: string }>()
      expect(result).toEqual({ hello: "world" })
    })

    it("throws AuthenticationError and resets authStore on 401", async () => {
      fetchMock.mockResolvedValue(emptyResponse(401))
      await expect(
        api.get("test", { retry: 0 }).json(),
      ).rejects.toBeInstanceOf(AuthenticationError)
      expect(mockSetState).toHaveBeenCalledWith({
        user: null,
        status: "unauthenticated",
      })
    })

    it("throws PermissionError on 403 without clearing authStore", async () => {
      fetchMock.mockResolvedValue(emptyResponse(403))
      await expect(
        api.get("test", { retry: 0 }).json(),
      ).rejects.toBeInstanceOf(PermissionError)
      expect(mockSetState).not.toHaveBeenCalled()
    })
  })
})
