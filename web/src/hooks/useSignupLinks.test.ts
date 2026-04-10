import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useCreateSignupLink,
  useDisableSignupLink,
  useRegenerateSignupLink,
  useSignupLinks,
} from "./useSignupLinks"

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
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

const mockLinks = [
  {
    id: "link-1",
    campaign_id: "campaign-1",
    label: "Weekend volunteers",
    token: "11111111-1111-1111-1111-111111111111",
    status: "active" as const,
    expires_at: null,
    disabled_at: null,
    regenerated_at: null,
    created_at: "2026-04-09T00:00:00Z",
    updated_at: "2026-04-09T00:00:00Z",
  },
]

describe("useSignupLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls GET /api/v1/campaigns/{id}/signup-links", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLinks) })

    const { result } = renderHook(() => useSignupLinks("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-1/signup-links")
    expect(result.current.data).toEqual(mockLinks)
  })
})

describe("signup link mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a signup link", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLinks[0]) })

    const { result } = renderHook(() => useCreateSignupLink("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ label: "Weekend volunteers" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/signup-links",
      { json: { label: "Weekend volunteers" } },
    )
  })

  it("disables a signup link", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLinks[0]) })

    const { result } = renderHook(() => useDisableSignupLink("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate("link-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/signup-links/link-1/disable",
    )
  })

  it("regenerates a signup link", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockLinks[0]) })

    const { result } = renderHook(() => useRegenerateSignupLink("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate("link-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/signup-links/link-1/regenerate",
    )
  })
})
