import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { useInvites, useCreateInvite, useRevokeInvite } from "./useInvites"

// Mock api client
vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
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

const mockInvites = {
  items: [
    {
      id: "invite-1",
      campaign_id: "campaign-1",
      email: "newmember@example.com",
      role: "volunteer",
      status: "pending" as const,
      invited_by: "user-1",
      created_at: "2026-03-01T00:00:00Z",
      expires_at: "2026-04-01T00:00:00Z",
    },
  ],
  pagination: { next_cursor: null, has_more: false },
}

describe("useInvites", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls GET /api/v1/campaigns/{id}/invites", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockInvites) })

    const { result } = renderHook(() => useInvites("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-1/invites")
    expect(result.current.data).toEqual(mockInvites)
  })

  it("query key includes campaignId", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockInvites) })

    const { result } = renderHook(() => useInvites("campaign-xyz"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-xyz/invites")
  })
})

describe("useCreateInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls POST /api/v1/campaigns/{id}/invites with email and role", async () => {
    const newInvite = mockInvites.items[0]
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(newInvite) })

    const { result } = renderHook(() => useCreateInvite("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ email: "newmember@example.com", role: "volunteer" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/invites",
      { json: { email: "newmember@example.com", role: "volunteer" } }
    )
  })

  it("invalidates invites query on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const newInvite = mockInvites.items[0]
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(newInvite) })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useCreateInvite("campaign-1"), { wrapper })

    result.current.mutate({ email: "test@example.com", role: "manager" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["campaigns", "campaign-1", "invites"],
    })
  })
})

describe("useRevokeInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls DELETE /api/v1/campaigns/{id}/invites/{inviteId}", async () => {
    mockApi.delete.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const { result } = renderHook(() => useRevokeInvite("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate("invite-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/invites/invite-1"
    )
  })

  it("invalidates invites query on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    mockApi.delete.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useRevokeInvite("campaign-1"), { wrapper })

    result.current.mutate("invite-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["campaigns", "campaign-1", "invites"],
    })
  })
})
