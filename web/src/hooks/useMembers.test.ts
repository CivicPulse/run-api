import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { useMembers, useUpdateMemberRole, useRemoveMember } from "./useMembers"

// Mock api client
vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
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

const mockMembers = [
  {
    user_id: "user-1",
    display_name: "Alice Smith",
    email: "alice@example.com",
    role: "admin",
    synced_at: "2026-03-01T00:00:00Z",
  },
  {
    user_id: "user-2",
    display_name: "Bob Jones",
    email: "bob@example.com",
    role: "owner",
    synced_at: "2026-03-01T00:00:00Z",
  },
]

describe("useMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls GET /api/v1/campaigns/{id}/members", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockMembers) })

    const { result } = renderHook(() => useMembers("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-1/members")
    expect(result.current.data).toEqual(mockMembers)
  })

  it("query key includes campaignId", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockMembers) })

    const { result } = renderHook(() => useMembers("campaign-abc"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith("api/v1/campaigns/campaign-abc/members")
  })
})

describe("useUpdateMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls PATCH /api/v1/campaigns/{id}/members/{userId}/role", async () => {
    mockApi.patch.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue(mockMembers),
    })

    const { result } = renderHook(() => useUpdateMemberRole("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ userId: "user-1", role: "manager" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.patch).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/members/user-1/role",
      { json: { role: "manager" } }
    )
  })

  it("invalidates members query on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    mockApi.patch.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useUpdateMemberRole("campaign-1"), { wrapper })

    result.current.mutate({ userId: "user-1", role: "manager" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["campaigns", "campaign-1", "members"],
    })
  })
})

describe("useRemoveMember", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls DELETE /api/v1/campaigns/{id}/members/{userId}", async () => {
    mockApi.delete.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const { result } = renderHook(() => useRemoveMember("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate("user-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/members/user-1"
    )
  })

  it("invalidates members query on success", async () => {
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

    const { result } = renderHook(() => useRemoveMember("campaign-1"), { wrapper })

    result.current.mutate("user-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["campaigns", "campaign-1", "members"],
    })
  })
})
