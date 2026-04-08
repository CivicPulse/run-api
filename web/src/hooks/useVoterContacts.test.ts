import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useDeleteAddress,
  useRefreshPhoneValidation,
  useSetPrimaryContact,
} from "./useVoterContacts"
import type { VoterFilter } from "@/types/voter"

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

describe("useSetPrimaryContact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls unified set-primary endpoint for phones", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const { result } = renderHook(
      () => useSetPrimaryContact("campaign-1", "voter-1"),
      { wrapper: makeWrapper() }
    )

    result.current.mutate({ contactType: "phones", contactId: "phone-1" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/contacts/phones/phone-1/set-primary"
    )
  })

  it("calls unified set-primary endpoint for emails", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const { result } = renderHook(
      () => useSetPrimaryContact("campaign-1", "voter-1"),
      { wrapper: makeWrapper() }
    )

    result.current.mutate({ contactType: "emails", contactId: "email-1" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/contacts/emails/email-1/set-primary"
    )
  })

  it("calls unified set-primary endpoint for addresses", async () => {
    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const { result } = renderHook(
      () => useSetPrimaryContact("campaign-1", "voter-1"),
      { wrapper: makeWrapper() }
    )

    result.current.mutate({ contactType: "addresses", contactId: "address-1" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/contacts/addresses/address-1/set-primary"
    )
  })

  it("invalidates contact queries on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(
      () => useSetPrimaryContact("campaign-1", "voter-1"),
      { wrapper }
    )

    result.current.mutate({ contactType: "phones", contactId: "phone-1" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["voters", "campaign-1", "voter-1", "contacts"],
    })
  })
})

describe("VoterFilter type completeness", () => {
  it("accepts voted_in, not_voted_in, parties, logic fields", () => {
    // TypeScript compile-time check — if VoterFilter is missing fields, this will fail
    const filter: VoterFilter = {
      search: "test",
      party: "DEM",
      parties: ["DEM", "REP"],
      registration_city: "Springfield",
      registration_state: "IL",
      registration_zip: "62701",
      registration_county: "Sangamon",
      precinct: "P01",
      congressional_district: "CD13",
      age_min: 18,
      age_max: 65,
      gender: "M",
      voted_in: ["2020-general"],
      not_voted_in: ["2022-primary"],
      tags: ["tag-1"],
      tags_any: ["tag-2"],
      registered_after: "2020-01-01",
      registered_before: "2024-01-01",
      logic: "AND",
    }
    expect(filter.voted_in).toEqual(["2020-general"])
    expect(filter.not_voted_in).toEqual(["2022-primary"])
    expect(filter.parties).toEqual(["DEM", "REP"])
    expect(filter.logic).toBe("AND")
  })
})

describe("useDeleteAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates contact and voter queries on success", async () => {
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

    const { result } = renderHook(
      () => useDeleteAddress("campaign-1", "voter-1"),
      { wrapper }
    )

    result.current.mutate("address-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/addresses/address-1"
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["voters", "campaign-1", "voter-1", "contacts"],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["voters", "campaign-1"],
    })
  })
})

describe("useRefreshPhoneValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls the refresh-validation endpoint and invalidates queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(undefined) })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(
      () => useRefreshPhoneValidation("campaign-1", "voter-1"),
      { wrapper }
    )

    result.current.mutate("phone-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/voters/voter-1/phones/phone-1/refresh-validation"
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["voters", "campaign-1", "voter-1", "contacts"],
    })
  })
})
