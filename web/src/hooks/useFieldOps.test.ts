import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(() => ({
      json: vi.fn().mockResolvedValue({
        items: [],
        pagination: { next_cursor: null, has_more: false },
      }),
    })),
  },
}))

import {
  useTurfs,
  useWalkLists,
  useCallLists,
  usePhoneBankSessions,
  useVolunteers,
  useShifts,
} from "./useFieldOps"
import { callListKeys } from "./useCallLists"
import { sessionKeys } from "./usePhoneBankSessions"
import { volunteerKeys } from "./useVolunteers"
import { shiftKeys } from "./useShifts"

const CAMPAIGN_ID = "camp-1"

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

async function registeredQueryKey(
  queryClient: QueryClient,
  hookFn: () => unknown,
): Promise<readonly unknown[]> {
  renderHook(hookFn, { wrapper: makeWrapper(queryClient) })
  await waitFor(() => {
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)
  })
  const [cached] = queryClient.getQueryCache().getAll()
  return cached.queryKey as readonly unknown[]
}

// =============================================================================
// Phase 75 Plan 01 — RED tests for H29 query key alignment (REL-08)
// These tests assert that useFieldOps hooks use the SAME queryKey as their
// dedicated hook counterparts so invalidateQueries hits both consumers.
// Plan 04 makes them pass.
// =============================================================================

describe("useFieldOps query key alignment (REL-08)", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeClient()
  })

  it("useFieldOps.useCallLists registers callListKeys.all(campaignId)", async () => {
    const key = await registeredQueryKey(queryClient, () =>
      useCallLists(CAMPAIGN_ID),
    )
    expect(key).toEqual(callListKeys.all(CAMPAIGN_ID))
  })

  it("useFieldOps.usePhoneBankSessions registers sessionKeys.all(campaignId)", async () => {
    const key = await registeredQueryKey(queryClient, () =>
      usePhoneBankSessions(CAMPAIGN_ID),
    )
    expect(key).toEqual(sessionKeys.all(CAMPAIGN_ID))
  })

  it("useFieldOps.useVolunteers registers volunteerKeys.all(campaignId)", async () => {
    const key = await registeredQueryKey(queryClient, () =>
      useVolunteers(CAMPAIGN_ID),
    )
    expect(key).toEqual(volunteerKeys.all(CAMPAIGN_ID))
  })

  it("useFieldOps.useShifts registers shiftKeys.all(campaignId)", async () => {
    const key = await registeredQueryKey(queryClient, () =>
      useShifts(CAMPAIGN_ID),
    )
    expect(key).toEqual(shiftKeys.all(CAMPAIGN_ID))
  })

  it("useFieldOps.useTurfs uses ['turfs', campaignId] (stable key)", async () => {
    const key = await registeredQueryKey(queryClient, () =>
      useTurfs(CAMPAIGN_ID),
    )
    expect(key).toEqual(["turfs", CAMPAIGN_ID])
  })

  it("useFieldOps.useWalkLists uses ['walk-lists', campaignId] (stable key)", async () => {
    const key = await registeredQueryKey(queryClient, () =>
      useWalkLists(CAMPAIGN_ID),
    )
    expect(key).toEqual(["walk-lists", CAMPAIGN_ID])
  })
})

describe("useFieldOps invalidation via canonical keys (REL-08)", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeClient()
  })

  it("invalidateQueries(callListKeys.all) invalidates useFieldOps.useCallLists query", async () => {
    renderHook(() => useCallLists(CAMPAIGN_ID), {
      wrapper: makeWrapper(queryClient),
    })
    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)
    })

    await queryClient.invalidateQueries({
      queryKey: callListKeys.all(CAMPAIGN_ID),
    })

    const query = queryClient.getQueryCache().getAll()[0]
    expect(query.state.isInvalidated).toBe(true)
  })

  it("invalidateQueries(sessionKeys.all) invalidates useFieldOps.usePhoneBankSessions query", async () => {
    renderHook(() => usePhoneBankSessions(CAMPAIGN_ID), {
      wrapper: makeWrapper(queryClient),
    })
    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)
    })

    await queryClient.invalidateQueries({
      queryKey: sessionKeys.all(CAMPAIGN_ID),
    })

    const query = queryClient.getQueryCache().getAll()[0]
    expect(query.state.isInvalidated).toBe(true)
  })
})
