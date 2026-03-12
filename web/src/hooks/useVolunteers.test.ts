import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useVolunteerList,
  useVolunteerDetail,
  useCreateVolunteer,
  useUpdateVolunteer,
  useUpdateVolunteerStatus,
  useSelfRegister,
} from "./useVolunteers"

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

const mockVolunteer = {
  id: "vol-1",
  campaign_id: "campaign-1",
  user_id: null,
  first_name: "Alice",
  last_name: "Smith",
  phone: null,
  email: "alice@example.com",
  street: null,
  city: null,
  state: null,
  zip_code: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  notes: null,
  status: "active",
  skills: ["canvassing"],
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const mockVolunteerDetail = {
  ...mockVolunteer,
  tags: ["tag-1"],
  availability: [
    { id: "avail-1", volunteer_id: "vol-1", start_at: "2026-06-01T09:00:00Z", end_at: "2026-06-01T17:00:00Z" },
  ],
}

describe("useVolunteerList (VLTR-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches volunteers with no filters", async () => {
    const paginatedResponse = { items: [mockVolunteer], total: 1, page: 1, size: 20 }
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(paginatedResponse) })

    const { result } = renderHook(() => useVolunteerList("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers",
    )
    expect(result.current.data).toEqual(paginatedResponse)
  })

  it("passes status filter as query param", async () => {
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, size: 20 }),
    })

    const { result } = renderHook(
      () => useVolunteerList("campaign-1", { status: "active" }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers?status=active",
    )
  })

  it("passes skills filter as query param", async () => {
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, size: 20 }),
    })

    const { result } = renderHook(
      () => useVolunteerList("campaign-1", { skills: "canvassing" }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers?skills=canvassing",
    )
  })

  it("passes name search as query param", async () => {
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, size: 20 }),
    })

    const { result } = renderHook(
      () => useVolunteerList("campaign-1", { name: "Alice" }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers?name=Alice",
    )
  })
})

describe("useCreateVolunteer (VLTR-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends POST /volunteers with all fields", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockVolunteer) })

    const { result } = renderHook(() => useCreateVolunteer("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({
      first_name: "Alice",
      last_name: "Smith",
      email: "alice@example.com",
      skills: ["canvassing"],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers",
      {
        json: {
          first_name: "Alice",
          last_name: "Smith",
          email: "alice@example.com",
          skills: ["canvassing"],
        },
      },
    )
  })

  it("invalidates volunteers query on success", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockVolunteer) })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useCreateVolunteer("campaign-1"), {
      wrapper,
    })

    result.current.mutate({ first_name: "Alice", last_name: "Smith" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["volunteers", "campaign-1"] }),
    )
  })
})

describe("useUpdateVolunteer (VLTR-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends PATCH /volunteers/{id} with partial fields", async () => {
    mockApi.patch.mockReturnValue({
      json: vi.fn().mockResolvedValue({ ...mockVolunteer, notes: "Updated note" }),
    })

    const { result } = renderHook(
      () => useUpdateVolunteer("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate({ notes: "Updated note" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.patch).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1",
      { json: { notes: "Updated note" } },
    )
  })

  it("invalidates volunteer detail query on success", async () => {
    mockApi.patch.mockReturnValue({
      json: vi.fn().mockResolvedValue({ ...mockVolunteer, notes: "Updated note" }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(
      () => useUpdateVolunteer("campaign-1", "vol-1"),
      { wrapper },
    )

    result.current.mutate({ notes: "Updated note" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["volunteers", "campaign-1", "vol-1"],
      }),
    )
  })
})

describe("useUpdateVolunteerStatus (VLTR-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends PATCH /volunteers/{id}/status", async () => {
    mockApi.patch.mockReturnValue({
      json: vi.fn().mockResolvedValue({ ...mockVolunteer, status: "inactive" }),
    })

    const { result } = renderHook(
      () => useUpdateVolunteerStatus("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate("inactive")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.patch).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1/status",
      { json: { status: "inactive" } },
    )
  })

  it("invalidates volunteer list and detail queries on success", async () => {
    mockApi.patch.mockReturnValue({
      json: vi.fn().mockResolvedValue({ ...mockVolunteer, status: "inactive" }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(
      () => useUpdateVolunteerStatus("campaign-1", "vol-1"),
      { wrapper },
    )

    result.current.mutate("inactive")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Invalidates all volunteers (covers list)
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["volunteers", "campaign-1"] }),
    )
    // Invalidates detail
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["volunteers", "campaign-1", "vol-1"],
      }),
    )
  })
})

describe("useSelfRegister (VLTR-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends POST /volunteers/register", async () => {
    const registeredVolunteer = { ...mockVolunteer, id: "vol-new" }
    // useSelfRegister uses .then((res) => res.json()) — mock must return a
    // thenable that resolves to an object with a .json() method
    mockApi.post.mockResolvedValue({
      json: vi.fn().mockResolvedValue(registeredVolunteer),
    })

    const { result } = renderHook(() => useSelfRegister("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ first_name: "Alice", last_name: "Smith" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/register",
      { json: { first_name: "Alice", last_name: "Smith" } },
    )
  })

  it("returns volunteer_id from 409 response for redirect", async () => {
    // The 409 enriched response includes volunteer_id so the caller can redirect
    const conflictResponse = { volunteer_id: "vol-existing", detail: "Already registered" }
    // useSelfRegister uses .then((res) => res.json()) — mock must return a
    // thenable that resolves to an object with a .json() method
    mockApi.post.mockResolvedValue({
      json: vi.fn().mockResolvedValue(conflictResponse),
    })

    const { result } = renderHook(() => useSelfRegister("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ first_name: "Alice", last_name: "Smith" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveProperty("volunteer_id", "vol-existing")
  })
})

describe("useVolunteerDetail (VLTR-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches volunteer detail with tags and availability", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue(mockVolunteerDetail) })

    const { result } = renderHook(
      () => useVolunteerDetail("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1",
    )
    expect(result.current.data).toEqual(mockVolunteerDetail)
    expect(result.current.data?.tags).toEqual(["tag-1"])
    expect(result.current.data?.availability).toHaveLength(1)
  })
})
