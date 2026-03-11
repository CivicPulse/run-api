import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { useAddTagToVoter, useRemoveTagFromVoter } from "./useVoterTags"

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

const mockApi = api as unknown as {
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

describe("useAddTagToVoter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("POSTs to .../tags with body {tag_id} (not URL path param)", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const { result } = renderHook(
      () => useAddTagToVoter("campaign-1", "voter-1"),
      { wrapper: makeWrapper() }
    )

    result.current.mutate("tag-abc")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Must call .../tags (not .../tags/tag-abc)
    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/tags",
      { json: { tag_id: "tag-abc" } }
    )

    // Verify the URL does NOT include the tagId as a path segment
    const calledUrl = mockApi.post.mock.calls[0][0] as string
    expect(calledUrl).not.toContain("tag-abc")
  })
})

describe("useRemoveTagFromVoter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls DELETE on .../tags/{tagId}", async () => {
    mockApi.delete.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const { result } = renderHook(
      () => useRemoveTagFromVoter("campaign-1", "voter-1"),
      { wrapper: makeWrapper() }
    )

    result.current.mutate("tag-abc")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/tags/tag-abc"
    )
  })
})
