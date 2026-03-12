import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import {
  useDNCEntries,
  useAddDNCEntry,
  useImportDNC,
  useDeleteDNCEntry,
} from "./useDNC"

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

describe("useDNC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useDNCEntries fetches array (not paginated) from /api/v1/campaigns/{id}/dnc", async () => {
    const entries = [
      {
        id: "dnc-1",
        phone_number: "5551234567",
        reason: "Requested",
        added_by: "user-1",
        added_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "dnc-2",
        phone_number: "5559876543",
        reason: "Invalid number",
        added_by: "user-1",
        added_at: "2026-01-02T00:00:00Z",
      },
    ]
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue(entries),
    })

    const { result } = renderHook(() => useDNCEntries("campaign-1"), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/dnc",
    )
    expect(result.current.data).toEqual(entries)
  })

  it("useAddDNCEntry posts to /api/v1/campaigns/{id}/dnc with phone_number and reason", async () => {
    const mockEntry = {
      id: "dnc-new",
      phone_number: "5551234567",
      reason: "Requested",
      added_by: "user-1",
      added_at: "2026-01-01T00:00:00Z",
    }
    mockApi.post.mockReturnValue({
      json: vi.fn().mockResolvedValue(mockEntry),
    })

    const { result } = renderHook(() => useAddDNCEntry("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate({ phone_number: "5551234567", reason: "Requested" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/dnc",
      { json: { phone_number: "5551234567", reason: "Requested" } },
    )
  })

  it("useImportDNC sends FormData multipart POST to /api/v1/campaigns/{id}/dnc/import", async () => {
    const importResult = { added: 5, skipped: 2, invalid: 1 }
    mockApi.post.mockReturnValue({
      json: vi.fn().mockResolvedValue(importResult),
    })

    const { result } = renderHook(() => useImportDNC("campaign-1"), {
      wrapper: makeWrapper(),
    })

    const testFile = new File(
      ["5551234567\n5559876543"],
      "numbers.csv",
      { type: "text/csv" },
    )
    result.current.mutate({ file: testFile, reason: "manual" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/dnc/import",
      { body: expect.any(FormData), searchParams: { reason: "manual" } },
    )
  })

  it("useDeleteDNCEntry sends DELETE to /api/v1/campaigns/{id}/dnc/{id}", async () => {
    // useDeleteDNCEntry uses .then(() => undefined), mock must return thenable
    mockApi.delete.mockReturnValue(Promise.resolve())

    const { result } = renderHook(() => useDeleteDNCEntry("campaign-1"), {
      wrapper: makeWrapper(),
    })

    result.current.mutate("dnc-1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/dnc/dnc-1",
    )
  })
})
