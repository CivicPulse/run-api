import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useCallLists,
  useCreateCallList,
  useUpdateCallList,
  useDeleteCallList,
  useCallListEntries,
} from "./useCallLists"

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

describe("useCallLists", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useCallLists fetches from /api/v1/campaigns/{id}/call-lists", async () => {
    const paginatedResponse = {
      items: [
        {
          id: "cl-1",
          name: "Test List",
          status: "active",
          total_entries: 10,
          completed_entries: 3,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      pagination: { next_cursor: null, has_more: false },
    }
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue(paginatedResponse),
    })

    const { result } = renderHook(() => useCallLists("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists",
    )
    expect(result.current.data).toEqual(paginatedResponse)
  })

  it("useCreateCallList posts to /api/v1/campaigns/{id}/call-lists with name and voter_list_id", async () => {
    const mockCallList = {
      id: "cl-new",
      name: "New List",
      status: "draft",
      total_entries: 0,
      completed_entries: 0,
      created_at: "2026-01-01T00:00:00Z",
      max_attempts: 3,
      claim_timeout_minutes: 15,
      cooldown_minutes: 30,
      voter_list_id: "vl-1",
      script_id: null,
      created_by: "user-1",
      updated_at: "2026-01-01T00:00:00Z",
    }
    mockApi.post.mockReturnValue({
      json: vi.fn().mockResolvedValue(mockCallList),
    })

    const { result } = renderHook(() => useCreateCallList("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ name: "New List", voter_list_id: "vl-1" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists",
      { json: { name: "New List", voter_list_id: "vl-1" } },
    )
  })

  it("useUpdateCallList patches /api/v1/campaigns/{id}/call-lists/{id} with JSON body", async () => {
    const updatedCallList = {
      id: "cl-1",
      name: "Updated List",
      status: "active",
      total_entries: 10,
      completed_entries: 3,
      created_at: "2026-01-01T00:00:00Z",
      max_attempts: 3,
      claim_timeout_minutes: 15,
      cooldown_minutes: 30,
      voter_list_id: null,
      script_id: null,
      created_by: "user-1",
      updated_at: "2026-01-02T00:00:00Z",
    }
    mockApi.patch.mockReturnValue({
      json: vi.fn().mockResolvedValue(updatedCallList),
    })

    const { result } = renderHook(
      () => useUpdateCallList("campaign-1", "cl-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate({ name: "Updated List" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.patch).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists/cl-1",
      { json: { name: "Updated List" } },
    )
  })

  it("useDeleteCallList sends DELETE to /api/v1/campaigns/{id}/call-lists/{id}", async () => {
    // useDeleteCallList uses .then(() => undefined), mock must return thenable
    mockApi.delete.mockReturnValue(Promise.resolve())

    const { result } = renderHook(() => useDeleteCallList("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate("cl-1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists/cl-1",
    )
  })

  it("useCallListEntries fetches from /api/v1/campaigns/{id}/call-lists/{id}/entries", async () => {
    const paginatedResponse = {
      items: [
        {
          id: "entry-1",
          voter_id: "voter-1",
          voter_name: "Jane Doe",
          priority_score: 5,
          phone_numbers: [
            {
              phone_id: "ph-1",
              value: "5551234567",
              type: "mobile",
              is_primary: true,
            },
          ],
          status: "available" as const,
          attempt_count: 0,
          claimed_by: null,
          claimed_at: null,
          last_attempt_at: null,
        },
      ],
      pagination: { next_cursor: null, has_more: false },
    }
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue(paginatedResponse),
    })

    const { result } = renderHook(
      () => useCallListEntries("campaign-1", "cl-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists/cl-1/entries",
    )
    expect(result.current.data).toEqual(paginatedResponse)
  })
})
