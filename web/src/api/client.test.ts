import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const mockGetAccessToken = vi.fn()
const mockSetState = vi.fn()

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({ getAccessToken: mockGetAccessToken }),
    setState: mockSetState,
  },
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
    mockGetAccessToken.mockReset()
    mockSetState.mockReset()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("auth header injection (beforeRequest)", () => {
    it("sets Authorization: Bearer <token> when access token is present", async () => {
      mockGetAccessToken.mockReturnValue("abc123")
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

      await api.get("test").json()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const request = fetchMock.mock.calls[0][0] as Request
      expect(request.headers.get("Authorization")).toBe("Bearer abc123")
    })

    it("omits Authorization header when access token is null", async () => {
      mockGetAccessToken.mockReturnValue(null)
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

      await api.get("test").json()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const request = fetchMock.mock.calls[0][0] as Request
      expect(request.headers.get("Authorization")).toBeNull()
    })
  })

  describe("response error mapping (afterResponse)", () => {
    it("returns parsed body on 200 success", async () => {
      mockGetAccessToken.mockReturnValue(null)
      fetchMock.mockResolvedValue(jsonResponse({ hello: "world" }))

      const result = await api.get("test").json<{ hello: string }>()

      expect(result).toEqual({ hello: "world" })
    })

    it("throws AuthenticationError and clears authStore on 401", async () => {
      mockGetAccessToken.mockReturnValue("abc123")
      fetchMock.mockResolvedValue(emptyResponse(401))

      await expect(
        api.get("test", { retry: 0 }).json(),
      ).rejects.toBeInstanceOf(AuthenticationError)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(mockSetState).toHaveBeenCalledWith({
        user: null,
        isAuthenticated: false,
      })
    })

    it("throws PermissionError on 403 without clearing authStore", async () => {
      mockGetAccessToken.mockReturnValue("abc123")
      fetchMock.mockResolvedValue(emptyResponse(403))

      await expect(
        api.get("test", { retry: 0 }).json(),
      ).rejects.toBeInstanceOf(PermissionError)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(mockSetState).not.toHaveBeenCalled()
    })
  })
})
