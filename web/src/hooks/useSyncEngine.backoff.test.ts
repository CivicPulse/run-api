import { describe, test, expect, beforeEach, vi, type Mock } from "vitest"
import { renderHook } from "@testing-library/react"
import { useOfflineQueueStore } from "@/stores/offlineQueueStore"
import { useCanvassingStore } from "@/stores/canvassingStore"
import type { QueryClient } from "@tanstack/react-query"

// Plan 110-04 / OFFLINE-03: exponential backoff + dead-letter +
// 30s soft sync budget. These tests exercise the NEW contract and
// complement the existing useSyncEngine.test.ts (which still
// verifies FIFO drain, 409 silent success, C14 lock release, etc.).

vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn(),
  },
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

// useConnectivityStatus is consumed by useSyncEngine() — stub it so
// the budget test can mount the hook without a real online listener.
vi.mock("@/hooks/useConnectivityStatus", () => ({
  useConnectivityStatus: () => true,
}))

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  )
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      getQueryData: vi.fn().mockReturnValue(undefined),
    }),
  }
})

import { api } from "@/api/client"
import { toast } from "sonner"
import {
  drainQueue,
  classifyError,
  computeBackoffMs,
  useSyncEngine,
  SYNC_BUDGET_MS,
} from "@/hooks/useSyncEngine"

function makeQueryClient() {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    getQueryData: vi.fn().mockReturnValue(undefined),
  }
}

describe("classifyError (plan 110-04)", () => {
  test("TypeError → network, retry=true", () => {
    const c = classifyError(new TypeError("fetch failed"))
    expect(c).toEqual({ kind: "network", retry: true })
  })

  test("HTTPError 409 → conflict, retry=false", () => {
    const c = classifyError({ response: { status: 409 } })
    expect(c).toEqual({ kind: "conflict", retry: false })
  })

  test("HTTPError 422 → validation, retry=false, errorCode=http_422", () => {
    const c = classifyError({
      response: { status: 422, statusText: "Unprocessable Entity" },
      message: "voter_id required",
    })
    if (c.kind !== "validation") throw new Error("expected validation")
    expect(c.retry).toBe(false)
    expect(c.errorCode).toBe("http_422")
    expect(c.errorSummary).toContain("voter_id")
  })

  test("HTTPError 403 → validation, retry=false, errorCode=http_403", () => {
    const c = classifyError({ response: { status: 403 } })
    if (c.kind !== "validation") throw new Error("expected validation")
    expect(c.errorCode).toBe("http_403")
  })

  test("HTTPError 500 → server, retry=true", () => {
    const c = classifyError({ response: { status: 500 } })
    expect(c).toMatchObject({ kind: "server", retry: true })
  })

  test("HTTPError 503 → server, retry=true, errorCode=http_503", () => {
    const c = classifyError({ response: { status: 503 } })
    if (c.kind !== "server") throw new Error("expected server")
    expect(c.errorCode).toBe("http_503")
  })

  test("Plain Error → unknown, retry=true", () => {
    const c = classifyError(new Error("boom"))
    expect(c).toEqual({ kind: "unknown", retry: true })
  })
})

describe("computeBackoffMs (plan 110-04)", () => {
  test("matches 1s, 2s, 4s, 8s, 16s, 32s, 60s cap", () => {
    expect(computeBackoffMs(1)).toBe(1_000)
    expect(computeBackoffMs(2)).toBe(2_000)
    expect(computeBackoffMs(3)).toBe(4_000)
    expect(computeBackoffMs(4)).toBe(8_000)
    expect(computeBackoffMs(5)).toBe(16_000)
    expect(computeBackoffMs(6)).toBe(32_000)
    expect(computeBackoffMs(7)).toBe(60_000)
    expect(computeBackoffMs(8)).toBe(60_000)
    expect(computeBackoffMs(20)).toBe(60_000)
  })

  test("retryCount 0 returns 0 (caller should short-circuit)", () => {
    expect(computeBackoffMs(0)).toBe(0)
  })
})

describe("drainQueue — per-item backoff gate (plan 110-04)", () => {
  let queryClient: ReturnType<typeof makeQueryClient>

  beforeEach(() => {
    vi.restoreAllMocks()
    useOfflineQueueStore.getState().clear()
    useCanvassingStore.getState().reset()
    queryClient = makeQueryClient()
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  test("skips items whose nextAttemptAt > Date.now()", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      "skip-id" as ReturnType<typeof crypto.randomUUID>,
    )

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    // Stamp a future nextAttemptAt
    useOfflineQueueStore
      .getState()
      .setItemBackoff("skip-id", Date.now() + 10_000, "network")

    // Freeze Date.now BEFORE the stamped backoff
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(
      // Something smaller than the nextAttemptAt we stamped
      // (approx "now" at setItemBackoff time)
      Date.now() - 5_000,
    )

    await drainQueue(queryClient as unknown as QueryClient)

    // api.post was NOT called because the item was gated
    expect(api.post).not.toHaveBeenCalled()
    // Item still in the queue
    expect(useOfflineQueueStore.getState().items).toHaveLength(1)
    nowSpy.mockRestore()
  })

  test("on network error, stamps nextAttemptAt = now + backoff(retryCount+1) and increments retryCount", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      "bo-id" as ReturnType<typeof crypto.randomUUID>,
    )
    ;(api.post as Mock).mockReturnValue({
      json: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    const FIXED_NOW = 2_000_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW)

    await drainQueue(queryClient as unknown as QueryClient)

    const it = useOfflineQueueStore.getState().items[0]
    expect(it.retryCount).toBe(1)
    // First failure → backoff = 1000ms (retryCount+1 === 1)
    expect(it.nextAttemptAt).toBe(FIXED_NOW + 1_000)
    expect(it.lastError).toBe("network")
  })

  test("on 422, moves to dead-letter (NOT retried, NOT stamped with backoff)", async () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("orig-id" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("dl-id" as ReturnType<typeof crypto.randomUUID>)
    ;(api.post as Mock).mockReturnValue({
      json: vi.fn().mockRejectedValue({
        response: { status: 422 },
        message: "Validation failed",
      }),
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    const s = useOfflineQueueStore.getState()
    expect(s.items).toHaveLength(0)
    expect(s.deadLetter).toHaveLength(1)
    expect(s.deadLetter[0].errorCode).toBe("http_422")
    expect(s.deadLetter[0].errorSummary).toContain("Validation")
  })

  test("on 403, moves to dead-letter with errorCode http_403", async () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("orig-id" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("dl-id" as ReturnType<typeof crypto.randomUUID>)
    ;(api.post as Mock).mockReturnValue({
      json: vi.fn().mockRejectedValue({ response: { status: 403 } }),
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    const s = useOfflineQueueStore.getState()
    expect(s.deadLetter).toHaveLength(1)
    expect(s.deadLetter[0].errorCode).toBe("http_403")
  })

  test("on 500, backoff path (NOT dead-letter)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      "server-id" as ReturnType<typeof crypto.randomUUID>,
    )
    ;(api.post as Mock).mockReturnValue({
      json: vi.fn().mockRejectedValue({ response: { status: 500 } }),
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    const s = useOfflineQueueStore.getState()
    expect(s.deadLetter).toHaveLength(0)
    expect(s.items).toHaveLength(1)
    expect(s.items[0].retryCount).toBe(1)
    expect(s.items[0].nextAttemptAt).toBeGreaterThan(Date.now() - 10)
    expect(s.items[0].lastError).toBe("server")
  })
})

describe("drainQueue — sync budget + lastSyncAt (plan 110-04)", () => {
  let queryClient: ReturnType<typeof makeQueryClient>

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    useOfflineQueueStore.getState().clear()
    useCanvassingStore.getState().reset()
    queryClient = makeQueryClient()
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  test("startSync and endSync bookend drainQueue — syncStartedAt set inside, cleared after", async () => {
    ;(api.post as Mock).mockImplementation(() => {
      // Observe: during the replay, syncStartedAt is set
      expect(useOfflineQueueStore.getState().syncStartedAt).not.toBeNull()
      return { json: vi.fn().mockResolvedValue({}) }
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    const s = useOfflineQueueStore.getState()
    expect(s.syncStartedAt).toBeNull()
    expect(s.isSyncing).toBe(false)
    expect(s.isSlow).toBe(false)
  })

  test("useSyncEngine arms a 30s timer on sync start that calls markSlow()", () => {
    vi.useFakeTimers()
    try {
      // Start sync BEFORE mounting so the hook's useEffect picks up
      // syncStartedAt !== null immediately and arms the budget timer.
      useOfflineQueueStore.getState().startSync()
      expect(useOfflineQueueStore.getState().isSlow).toBe(false)

      const { unmount } = renderHook(() => useSyncEngine())

      // Advance just under the budget — still not slow
      vi.advanceTimersByTime(SYNC_BUDGET_MS - 1)
      expect(useOfflineQueueStore.getState().isSlow).toBe(false)

      // Cross the deadline
      vi.advanceTimersByTime(2)
      expect(useOfflineQueueStore.getState().isSlow).toBe(true)

      // Cleanup
      useOfflineQueueStore.getState().endSync()
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  test("records lastSyncAt after a full successful drain", async () => {
    ;(api.post as Mock).mockReturnValue({
      json: vi.fn().mockResolvedValue({}),
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    const FIXED = 2_500_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(FIXED)

    await drainQueue(queryClient as unknown as QueryClient)

    expect(useOfflineQueueStore.getState().lastSyncAt).toBe(FIXED)
  })

  test('"All caught up!" is GATED on deadLetter === 0', async () => {
    // Item 1 fails validation → dead-letter; item 2 succeeds.
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("id-1" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("id-2" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("dl-1" as ReturnType<typeof crypto.randomUUID>)

    let callCount = 0
    ;(api.post as Mock).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          json: vi
            .fn()
            .mockRejectedValue({ response: { status: 422 }, message: "bad" }),
        }
      }
      return { json: vi.fn().mockResolvedValue({}) }
    })

    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e1", voter_id: "v1", result_code: "supporter" },
      campaignId: "c1",
      resourceId: "wl-1",
    })
    useOfflineQueueStore.getState().push({
      type: "door_knock",
      payload: { walk_list_entry_id: "e2", voter_id: "v1", result_code: "not_home" },
      campaignId: "c1",
      resourceId: "wl-1",
    })

    await drainQueue(queryClient as unknown as QueryClient)

    // Items empty, but dead-letter has 1 → the "caught up" toast
    // should NOT fire.
    const s = useOfflineQueueStore.getState()
    expect(s.items).toHaveLength(0)
    expect(s.deadLetter).toHaveLength(1)
    expect(toast.success).not.toHaveBeenCalledWith("All caught up!")
  })
})
