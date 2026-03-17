import { describe, test, expect, beforeEach, vi } from "vitest"

// vi.hoisted runs before vi.mock factories, making these variables available inside
// the mock factory closures without hoisting violations.
const { capturedConfig, mockInvalidateQueries } = vi.hoisted(() => {
  const capturedConfig: { value: Record<string, unknown> } = { value: {} }
  const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined)
  return { capturedConfig, mockInvalidateQueries }
})

// Mock @tanstack/react-query — intercept useMutation to capture the options object
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
  useMutation: vi.fn((config: Record<string, unknown>) => {
    capturedConfig.value = config
    return { mutate: vi.fn(), mutateAsync: vi.fn() }
  }),
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}))

// Mock api/client
vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn().mockReturnValue({ json: vi.fn().mockResolvedValue({}) }),
    get: vi.fn().mockReturnValue({ json: vi.fn().mockResolvedValue([]) }),
  },
}))

// Mock sonner
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

// Import implementation after mocks are declared
import { useDoorKnockMutation } from "@/hooks/useCanvassing"
import { useCanvassingStore } from "@/stores/canvassingStore"

describe("useDoorKnockMutation — SYNC-01 behavioral contract", () => {
  beforeEach(() => {
    capturedConfig.value = {}
    useCanvassingStore.getState().reset()
    mockInvalidateQueries.mockClear()
  })

  test("useDoorKnockMutation has NO onError handler (hook-level onError was removed)", () => {
    // Act: invoke hook — this triggers useMutation with the mutation options
    useDoorKnockMutation("camp-1", "wl-1")

    // Assert: the options object passed to useMutation must not include onError
    expect(capturedConfig.value.onError).toBeUndefined()
  })

  test("onMutate records optimistic outcome in canvassingStore", () => {
    useDoorKnockMutation("camp-1", "wl-1")

    const onMutate = capturedConfig.value.onMutate as (data: {
      walk_list_entry_id: string
      result_code: string
    }) => void

    expect(onMutate).toBeDefined()

    // Act: simulate the mutation lifecycle calling onMutate
    onMutate({ walk_list_entry_id: "entry-A", result_code: "supporter" })

    // Assert: canvassing store reflects the optimistic outcome
    expect(useCanvassingStore.getState().completedEntries["entry-A"]).toBe("supporter")
  })

  test("onSuccess invalidates walk-list-entries-enriched query for the given campaign and walk-list", async () => {
    useDoorKnockMutation("camp-1", "wl-1")

    const onSuccess = capturedConfig.value.onSuccess as () => Promise<void>
    expect(onSuccess).toBeDefined()

    // Act: simulate the mutation lifecycle calling onSuccess
    await onSuccess()

    // Assert: correct query key invalidated
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["walk-list-entries-enriched", "camp-1", "wl-1"],
    })
  })

  test("does not revert optimistic outcome when onError is absent — store outcome persists after error", () => {
    // Arrange: simulate onMutate recording the optimistic outcome
    useDoorKnockMutation("camp-1", "wl-1")

    const onMutate = capturedConfig.value.onMutate as (data: {
      walk_list_entry_id: string
      result_code: string
    }) => void

    onMutate({ walk_list_entry_id: "entry-B", result_code: "not_home" })

    // Verify optimistic outcome is present
    expect(useCanvassingStore.getState().completedEntries["entry-B"]).toBe("not_home")

    // Assert: no hook-level onError exists that could call revertOutcome
    expect(capturedConfig.value.onError).toBeUndefined()

    // Confirm: the store outcome remains intact (nothing reverted it)
    expect(useCanvassingStore.getState().completedEntries["entry-B"]).toBe("not_home")
  })
})
