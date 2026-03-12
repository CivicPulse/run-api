import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { useVolunteerHours } from "./useVolunteerHours"

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

const mockHoursSummary = {
  volunteer_id: "vol-1",
  total_hours: 12.5,
  shifts_worked: 3,
  shifts: [
    {
      shift_id: "shift-1",
      shift_name: "Morning Canvass",
      hours: 4.5,
      check_in_at: "2026-06-01T09:00:00Z",
      check_out_at: "2026-06-01T13:30:00Z",
    },
    {
      shift_id: "shift-2",
      shift_name: "Afternoon Phones",
      hours: 3.0,
      check_in_at: "2026-06-02T14:00:00Z",
      check_out_at: "2026-06-02T17:00:00Z",
    },
    {
      shift_id: "shift-3",
      shift_name: "Evening Event",
      hours: 5.0,
      check_in_at: "2026-06-03T18:00:00Z",
      check_out_at: "2026-06-03T23:00:00Z",
    },
  ],
}

describe("useVolunteerHours (VLTR-09)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches volunteer hours summary", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockHoursSummary) })

    const { result } = renderHook(
      () => useVolunteerHours("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1/hours",
    )
    expect(result.current.data).toEqual(mockHoursSummary)
  })

  it("returns total_hours, shifts_worked, and shifts array", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockHoursSummary) })

    const { result } = renderHook(
      () => useVolunteerHours("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.total_hours).toBe(12.5)
    expect(result.current.data?.shifts_worked).toBe(3)
    expect(result.current.data?.shifts).toHaveLength(3)
    expect(result.current.data?.shifts[0]).toMatchObject({
      shift_id: "shift-1",
      shift_name: "Morning Canvass",
      hours: 4.5,
    })
  })
})
