import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

// Mock api client
vi.mock("@/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/client")>("@/api/client")
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  }
})

import {
  useOrgNumbers,
  useRegisterOrgNumber,
  useDeleteOrgNumber,
  useSyncOrgNumber,
  useSetDefaultNumber,
} from "./useOrgNumbers"
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
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
}

const mockNumber = {
  id: "num-1",
  phone_number: "+15551234567",
  friendly_name: "Main Line",
  phone_type: "local",
  voice_capable: true,
  sms_capable: true,
  mms_capable: false,
  twilio_sid: "PN123",
  capabilities_synced_at: "2026-04-07T12:00:00Z",
  created_at: "2026-04-07T10:00:00Z",
  is_default_voice: true,
  is_default_sms: false,
}

describe("useOrgNumbers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches numbers from GET api/v1/org/numbers", async () => {
    mockApi.get.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue([mockNumber]),
    })

    const { result } = renderHook(() => useOrgNumbers(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([mockNumber])
    expect(mockApi.get).toHaveBeenCalledWith("api/v1/org/numbers")
  })

  it("returns error state on failure", async () => {
    mockApi.get.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new Error("Network error")),
    })

    const { result } = renderHook(() => useOrgNumbers(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useRegisterOrgNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("posts to api/v1/org/numbers with phone_number payload", async () => {
    mockApi.post.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue(mockNumber),
    })

    const { result } = renderHook(() => useRegisterOrgNumber(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ phone_number: "+15551234567" })

    expect(mockApi.post).toHaveBeenCalledWith("api/v1/org/numbers", {
      json: { phone_number: "+15551234567" },
    })
  })
})

describe("useDeleteOrgNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends DELETE to api/v1/org/numbers/{id}", async () => {
    mockApi.delete.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue(undefined),
    })

    const { result } = renderHook(() => useDeleteOrgNumber(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync("num-1")

    expect(mockApi.delete).toHaveBeenCalledWith("api/v1/org/numbers/num-1")
  })
})

describe("useSyncOrgNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("posts to api/v1/org/numbers/{id}/sync", async () => {
    mockApi.post.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue(mockNumber),
    })

    const { result } = renderHook(() => useSyncOrgNumber(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync("num-1")

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/org/numbers/num-1/sync",
    )
  })
})

describe("useSetDefaultNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("patches api/v1/org/numbers/{id}/set-default with capability", async () => {
    mockApi.patch.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue({ status: "ok" }),
    })

    const { result } = renderHook(() => useSetDefaultNumber(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: "num-1", capability: "voice" })

    expect(mockApi.patch).toHaveBeenCalledWith(
      "api/v1/org/numbers/num-1/set-default",
      { json: { capability: "voice" } },
    )
  })
})
