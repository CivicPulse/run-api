import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useVolunteerAvailability,
  useAddAvailability,
  useDeleteAvailability,
} from "./useVolunteerAvailability"

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

const mockSlot = {
  id: "avail-1",
  volunteer_id: "vol-1",
  start_at: "2026-06-01T09:00:00Z",
  end_at: "2026-06-01T17:00:00Z",
}

describe("useVolunteerAvailability (VLTR-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches availability slots for a volunteer", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue([mockSlot]) })

    const { result } = renderHook(
      () => useVolunteerAvailability("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1/availability",
    )
    expect(result.current.data).toEqual([mockSlot])
  })

  it("adds availability slot via POST", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockSlot) })

    const { result } = renderHook(
      () => useAddAvailability("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate({
      start_at: "2026-06-01T09:00:00Z",
      end_at: "2026-06-01T17:00:00Z",
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1/availability",
      {
        json: {
          start_at: "2026-06-01T09:00:00Z",
          end_at: "2026-06-01T17:00:00Z",
        },
      },
    )
  })

  it("deletes availability slot via DELETE", async () => {
    mockApi.delete.mockReturnValue({ json: vi.fn().mockResolvedValue(null) })

    const { result } = renderHook(
      () => useDeleteAvailability("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate("avail-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1/availability/avail-1",
    )
  })

  it("invalidates availability and detail queries on mutation", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockSlot) })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(
      () => useAddAvailability("campaign-1", "vol-1"),
      { wrapper },
    )

    result.current.mutate({
      start_at: "2026-06-01T09:00:00Z",
      end_at: "2026-06-01T17:00:00Z",
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Invalidates availability query
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["volunteer-availability", "campaign-1", "vol-1"],
      }),
    )
    // Invalidates volunteer detail query
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["volunteers", "campaign-1", "vol-1"],
      }),
    )
  })
})
