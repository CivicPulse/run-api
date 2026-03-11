import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { useCreateVoter, useUpdateVoter, useCreateInteraction } from "./useVoters"

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

const mockVoter = {
  id: "voter-1",
  campaign_id: "campaign-1",
  source_type: "manual",
  source_id: null,
  first_name: "Jane",
  last_name: "Doe",
  middle_name: null,
  suffix: null,
  date_of_birth: null,
  gender: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  zip_code: null,
  county: null,
  party: null,
  precinct: null,
  congressional_district: null,
  state_senate_district: null,
  state_house_district: null,
  registration_date: null,
  voting_history: null,
  ethnicity: null,
  age: null,
  latitude: null,
  longitude: null,
  household_id: null,
  extra_data: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("useCreateVoter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("POSTs to .../voters with voter fields", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockVoter) })

    const { result } = renderHook(() => useCreateVoter("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ first_name: "Jane", last_name: "Doe", source_type: "manual" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters",
      { json: { first_name: "Jane", last_name: "Doe", source_type: "manual" } }
    )
  })
})

describe("useUpdateVoter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("PATCHes to .../voters/{voterId} with update fields", async () => {
    mockApi.patch.mockReturnValue({ json: vi.fn().mockResolvedValue({ ...mockVoter, first_name: "Janet" }) })

    const { result } = renderHook(() => useUpdateVoter("campaign-1", "voter-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ first_name: "Janet" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.patch).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1",
      { json: { first_name: "Janet" } }
    )
  })
})

describe("useCreateInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("POSTs with {type, payload} to .../interactions", async () => {
    const mockInteraction = {
      id: "interaction-1",
      campaign_id: "campaign-1",
      voter_id: "voter-1",
      type: "note",
      payload: { text: "Good conversation" },
      created_by: "user-1",
      created_at: "2026-01-01T00:00:00Z",
    }
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockInteraction) })

    const { result } = renderHook(
      () => useCreateInteraction("campaign-1", "voter-1"),
      { wrapper: makeWrapper() }
    )

    result.current.mutate({ type: "note", payload: { text: "Good conversation" } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/interactions",
      { json: { type: "note", payload: { text: "Good conversation" } } }
    )
  })
})
