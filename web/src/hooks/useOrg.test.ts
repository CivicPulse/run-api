import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HTTPError } from "ky"
import React from "react"

// Mock api client
vi.mock("@/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/client")>("@/api/client")
  return {
    ...actual,
    api: {
      get: vi.fn(),
    },
  }
})

import { useOrgCampaigns } from "./useOrg"
import { api, PermissionError, AuthenticationError } from "@/api/client"

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
}

function buildHttpError(status: number): HTTPError {
  const err = Object.create(HTTPError.prototype) as HTTPError
  Object.assign(err, {
    name: "HTTPError",
    message: `HTTP ${status}`,
    response: { status } as Response,
  })
  return err
}

const orgCampaigns = [
  {
    id: "c1",
    name: "Org Campaign",
    slug: "org-campaign",
    campaign_type: "municipal",
    election_date: "2026-11-03",
    created_at: "2026-01-01T00:00:00Z",
    member_count: 5,
    status: "active",
  },
]

const fallbackListResponse = {
  items: [
    {
      id: "c2",
      name: "Fallback Campaign",
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      type: "legislative",
      election_date: "2026-11-03",
    },
  ],
}

describe("useOrgCampaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns org campaigns on success (happy path)", async () => {
    mockApi.get.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue(orgCampaigns),
    })

    const { result } = renderHook(() => useOrgCampaigns(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(orgCampaigns)
    expect(mockApi.get).toHaveBeenCalledWith("api/v1/org/campaigns")
  })

  it("falls back to /api/v1/campaigns on PermissionError (403)", async () => {
    mockApi.get
      .mockReturnValueOnce({
        json: vi.fn().mockRejectedValue(new PermissionError()),
      })
      .mockReturnValueOnce({
        json: vi.fn().mockResolvedValue(fallbackListResponse),
      })

    const { result } = renderHook(() => useOrgCampaigns(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([
      {
        id: "c2",
        name: "Fallback Campaign",
        slug: null,
        campaign_type: "legislative",
        election_date: "2026-11-03",
        created_at: "2026-02-01T00:00:00Z",
        member_count: 0,
        status: "active",
      },
    ])
    expect(mockApi.get).toHaveBeenNthCalledWith(1, "api/v1/org/campaigns")
    expect(mockApi.get).toHaveBeenNthCalledWith(2, "api/v1/campaigns")
  })

  it("falls back to /api/v1/campaigns on HTTPError 404", async () => {
    mockApi.get
      .mockReturnValueOnce({
        json: vi.fn().mockRejectedValue(buildHttpError(404)),
      })
      .mockReturnValueOnce({
        json: vi.fn().mockResolvedValue(fallbackListResponse),
      })

    const { result } = renderHook(() => useOrgCampaigns(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].id).toBe("c2")
    expect(result.current.data?.[0].member_count).toBe(0)
    expect(mockApi.get).toHaveBeenCalledTimes(2)
  })

  it("propagates AuthenticationError (401) to the query error state", async () => {
    const authErr = new AuthenticationError()
    mockApi.get.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(authErr),
    })

    const { result } = renderHook(() => useOrgCampaigns(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(AuthenticationError)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
  })

  it("propagates HTTPError 500 to the query error state", async () => {
    const httpErr = buildHttpError(500)
    mockApi.get.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(httpErr),
    })

    const { result } = renderHook(() => useOrgCampaigns(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(httpErr)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
  })
})
