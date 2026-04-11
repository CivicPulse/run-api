import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useVolunteerCampaignTags,
  useCreateVolunteerTag,
  useUpdateVolunteerTag,
  useDeleteVolunteerTag,
  useAddTagToVolunteer,
  useRemoveTagFromVolunteer,
} from "./useVolunteerTags"

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

const mockTag = {
  id: "tag-1",
  campaign_id: "campaign-1",
  name: "Committed",
  created_at: "2026-01-01T00:00:00Z",
}

describe("useVolunteerCampaignTags (VLTR-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches campaign volunteer tags list", async () => {
    mockApi.get.mockReturnValue({ json: vi.fn().mockResolvedValue([mockTag]) })

    const { result } = renderHook(
      () => useVolunteerCampaignTags("campaign-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteer-tags",
    )
    expect(result.current.data).toEqual([mockTag])
  })

  it("creates a new volunteer tag via POST", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(mockTag) })

    const { result } = renderHook(
      () => useCreateVolunteerTag("campaign-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate({ name: "Committed" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteer-tags",
      { json: { name: "Committed" } },
    )
  })

  it("updates a volunteer tag name via PATCH", async () => {
    const updatedTag = { ...mockTag, name: "Very Committed" }
    mockApi.patch.mockReturnValue({ json: vi.fn().mockResolvedValue(updatedTag) })

    const { result } = renderHook(
      () => useUpdateVolunteerTag("campaign-1", "tag-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate({ name: "Very Committed" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.patch).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteer-tags/tag-1",
      { json: { name: "Very Committed" } },
    )
  })

  it("deletes a volunteer tag via DELETE", async () => {
    mockApi.delete.mockReturnValue({ json: vi.fn().mockResolvedValue(null) })

    const { result } = renderHook(
      () => useDeleteVolunteerTag("campaign-1", "tag-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteer-tags/tag-1",
    )
  })
})

describe("useAddTagToVolunteer / useRemoveTagFromVolunteer (VLTR-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("adds tag to volunteer via POST /volunteers/{id}/tags/{tagId}", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(null) })

    const { result } = renderHook(
      () => useAddTagToVolunteer("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate("tag-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1/tags/tag-1",
    )
  })

  it("removes tag from volunteer via DELETE /volunteers/{id}/tags/{tagId}", async () => {
    // Hook calls api.delete(...).then(() => undefined) directly (204 No Content),
    // so the mock must return a thenable, not a { json } object.
    mockApi.delete.mockReturnValue(Promise.resolve(undefined))

    const { result } = renderHook(
      () => useRemoveTagFromVolunteer("campaign-1", "vol-1"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate("tag-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/volunteers/vol-1/tags/tag-1",
    )
  })

  it("invalidates volunteer detail query on tag mutation", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(null) })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(
      () => useAddTagToVolunteer("campaign-1", "vol-1"),
      { wrapper },
    )

    result.current.mutate("tag-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["volunteers", "campaign-1", "vol-1"],
      }),
    )
  })
})
