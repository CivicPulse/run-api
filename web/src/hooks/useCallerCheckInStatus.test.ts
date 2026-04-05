import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { HTTPError } from "ky"
import { useCallerCheckInStatus } from "./useCallerCheckInStatus"

// Mock api client
vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> }

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const MOCK_CALLER_CHECKED_IN = {
  id: "caller-1",
  session_id: "sess-1",
  user_id: "user-1",
  check_in_at: "2026-04-04T23:51:14.825Z",
  check_out_at: null,
  checked_in: true,
}

const MOCK_CALLER_NOT_CHECKED_IN = {
  ...MOCK_CALLER_CHECKED_IN,
  check_in_at: null,
  checked_in: false,
}

function make404Error(): HTTPError {
  const response = new Response(
    JSON.stringify({ title: "Not an Assigned Caller" }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  )
  const request = new Request("https://example.com/callers/me")
  // Construct HTTPError via its actual constructor shape
  return new HTTPError(response, request, {} as never)
}

describe("useCallerCheckInStatus (SEC-12 / H26)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches caller status from correct callers/me URL", async () => {
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue(MOCK_CALLER_CHECKED_IN),
    })

    const { result } = renderHook(
      () => useCallerCheckInStatus("camp-123", "sess-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())

    expect(mockApi.get).toHaveBeenCalledWith(
      "api/v1/campaigns/camp-123/phone-bank-sessions/sess-1/callers/me",
    )
    expect(result.current.data?.checked_in).toBe(true)
    expect(result.current.notAssigned).toBe(false)
  })

  it("returns checked_in=false when user has not checked in yet", async () => {
    mockApi.get.mockReturnValue({
      json: vi.fn().mockResolvedValue(MOCK_CALLER_NOT_CHECKED_IN),
    })

    const { result } = renderHook(
      () => useCallerCheckInStatus("camp-123", "sess-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())

    expect(result.current.data?.checked_in).toBe(false)
    expect(result.current.notAssigned).toBe(false)
  })

  it("sets notAssigned=true on 404 and does not throw", async () => {
    const error = make404Error()
    mockApi.get.mockReturnValue({
      json: vi.fn().mockRejectedValue(error),
    })

    const { result } = renderHook(
      () => useCallerCheckInStatus("camp-123", "sess-1"),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.notAssigned).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.isError).toBe(false)
  })
})
