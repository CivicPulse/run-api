import { renderHook } from "@/test/render"
import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCallingSession } from "./useCallingSession"
import { useCallingStore } from "@/stores/callingStore"

const {
  mockCheckInMutate,
  mockCheckOutMutate,
  mockRecordCallMutate,
  mockSelfReleaseMutate,
  mockApiPost,
  mockToastError,
  mockUsePhoneBankSession,
  mockUseCheckIn,
  mockUseCheckOut,
  mockUseRecordCall,
  mockUseSelfReleaseEntry,
  mockUseCallList,
} = vi.hoisted(() => ({
  mockCheckInMutate: vi.fn(),
  mockCheckOutMutate: vi.fn(),
  mockRecordCallMutate: vi.fn(),
  mockSelfReleaseMutate: vi.fn(),
  mockApiPost: vi.fn(),
  mockToastError: vi.fn(),
  mockUsePhoneBankSession: vi.fn(),
  mockUseCheckIn: vi.fn(),
  mockUseCheckOut: vi.fn(),
  mockUseRecordCall: vi.fn(),
  mockUseSelfReleaseEntry: vi.fn(),
  mockUseCallList: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}))

vi.mock("@/api/client", () => ({
  api: {
    post: mockApiPost,
  },
}))

vi.mock("@/hooks/usePhoneBankSessions", () => ({
  usePhoneBankSession: (...args: unknown[]) => mockUsePhoneBankSession(...args),
  useCheckIn: (...args: unknown[]) => mockUseCheckIn(...args),
  useCheckOut: (...args: unknown[]) => mockUseCheckOut(...args),
  useRecordCall: (...args: unknown[]) => mockUseRecordCall(...args),
  useSelfReleaseEntry: (...args: unknown[]) => mockUseSelfReleaseEntry(...args),
}))

vi.mock("@/hooks/useCallLists", () => ({
  useCallList: (...args: unknown[]) => mockUseCallList(...args),
}))

const mockEntryA = {
  id: "entry-a",
  voter_id: "voter-a",
  voter_name: "Alice Example",
  phone_numbers: [{ phone_id: "phone-a", value: "+15551111111", type: "cell", is_primary: true }],
  phone_attempts: null,
  attempt_count: 0,
  priority_score: 100,
}

const mockEntryB = {
  id: "entry-b",
  voter_id: "voter-b",
  voter_name: "Bob Example",
  phone_numbers: [{ phone_id: "phone-b", value: "+15552222222", type: "cell", is_primary: true }],
  phone_attempts: null,
  attempt_count: 0,
  priority_score: 90,
}

function primeSessionQuery(options?: Partial<{
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  callListId: string | undefined
  error: Error | null
}>) {
  const {
    isLoading = false,
    isError = false,
    isSuccess = true,
    callListId = "call-list-1",
    error = null,
  } = options ?? {}

  mockUsePhoneBankSession.mockReturnValue({
    data: callListId ? { call_list_id: callListId } : undefined,
    isLoading,
    isError,
    isSuccess,
    error,
  })
}

describe("useCallingSession", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useCallingStore.getState().reset()
    vi.clearAllMocks()

    mockUseCallList.mockReturnValue({ data: null })
    mockUseCheckIn.mockReturnValue({
      mutate: mockCheckInMutate.mockImplementation((_, options) => options?.onSuccess?.({})),
    })
    mockUseCheckOut.mockReturnValue({ mutate: mockCheckOutMutate })
    mockUseRecordCall.mockReturnValue({ mutate: mockRecordCallMutate })
    mockUseSelfReleaseEntry.mockReturnValue({ mutate: mockSelfReleaseMutate })
    primeSessionQuery()
  })

  afterEach(() => {
    useCallingStore.getState().reset()
  })

  it("resumes a valid persisted session when the assignment session matches", () => {
    useCallingStore.getState().startSession("session-a", "call-list-1", [mockEntryA])

    const { result } = renderHook(() => useCallingSession("campaign-1", "session-a"))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.currentEntry?.id).toBe("entry-a")
    expect(result.current.currentEntry?.phone_numbers[0]?.value).toBe("+15551111111")
    expect(mockCheckInMutate).not.toHaveBeenCalled()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it("ignores mismatched persisted state and claims fresh entries for the active assignment", async () => {
    useCallingStore.getState().startSession("stale-session", "call-list-stale", [mockEntryA])
    mockApiPost.mockReturnValue({
      json: vi.fn().mockResolvedValue([mockEntryB]),
    })

    const { result } = renderHook(() => useCallingSession("campaign-1", "session-b"))

    expect(result.current.currentEntry).toBeNull()
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.currentEntry?.id).toBe("entry-b")
    expect(result.current.currentEntry?.phone_numbers[0]?.value).toBe("+15552222222")
    expect(useCallingStore.getState().sessionId).toBe("session-b")
    expect(mockApiPost).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-1/call-lists/call-list-1/claim",
      { json: { batch_size: 5 } },
    )
  })

  it("discards malformed persisted state for the same session and starts clean", async () => {
    useCallingStore.setState({
      sessionId: "session-a",
      entries: [
        {
          id: "broken-entry",
          voter_id: "voter-broken",
          voter_name: "Broken Example",
          phone_numbers: "not-an-array",
          phone_attempts: null,
          attempt_count: 0,
          priority_score: 100,
        },
      ] as never,
      currentEntryIndex: 0,
      completedCalls: {},
      skippedEntries: [],
    })
    mockApiPost.mockReturnValue({
      json: vi.fn().mockResolvedValue([mockEntryB]),
    })

    const { result } = renderHook(() => useCallingSession("campaign-1", "session-a"))

    expect(result.current.currentEntry).toBeNull()

    await waitFor(() => expect(result.current.currentEntry?.id).toBe("entry-b"))

    expect(result.current.currentEntry?.phone_numbers[0]?.value).toBe("+15552222222")
    expect(useCallingStore.getState().sessionId).toBe("session-a")
  })

  it("surfaces session query failure without exposing stale currentEntry data", () => {
    useCallingStore.getState().startSession("stale-session", "call-list-stale", [mockEntryA])
    primeSessionQuery({
      isError: true,
      isSuccess: false,
      callListId: undefined,
      error: new Error("session failed"),
    })

    const { result } = renderHook(() => useCallingSession("campaign-1", "session-b"))

    expect(result.current.isError).toBe(true)
    expect(result.current.currentEntry).toBeNull()
  })
})
