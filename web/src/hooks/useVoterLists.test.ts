import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { useVoterLists, useCreateVoterList } from "./useVoterLists"

// Mock api client
vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockApi = api as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const mockLists = [
  {
    id: "list-1",
    campaign_id: "campaign-1",
    name: "My List",
    list_type: "static",
    filter_query: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
]

describe("useVoterLists URL", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls GET /api/v1/campaigns/{id}/lists (not voter-lists)", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLists) })

    const { result } = renderHook(() => useVoterLists("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-1/lists")
    // Ensure the old broken URL is NOT used
    const calledUrl = mockApi.get.mock.calls[0][0] as string
    expect(calledUrl).not.toContain("voter-lists")
  })
})

describe("useCreateVoterList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("POSTs to .../lists with name, list_type, filter_query", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLists[0]) })
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLists) })

    const { result } = renderHook(() => useCreateVoterList("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({
      name: "New List",
      list_type: "static",
      filter_query: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = mockApi.post.mock.calls[0][0] as string
    expect(calledUrl).toContain("/lists")
    expect(calledUrl).not.toContain("voter-lists")
    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/lists",
      { json: { name: "New List", list_type: "static", filter_query: null } }
    )
  })

  it("stores filter_query as JSON string for dynamic lists", async () => {
    const filterObj = { party: "DEM", logic: "AND" }
    const filterString = JSON.stringify(filterObj)

    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue({ ...mockLists[0], filter_query: filterString }) })
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLists) })

    const { result } = renderHook(() => useCreateVoterList("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({
      name: "Dynamic List",
      list_type: "dynamic",
      filter_query: filterString,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Verify filter_query is sent as a string (not object)
    const postBody = mockApi.post.mock.calls[0][1] as { json: { filter_query: unknown } }
    expect(typeof postBody.json.filter_query).toBe("string")
  })
})
