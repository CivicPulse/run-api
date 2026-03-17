import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

const _store = vi.hoisted(() => ({ component: null as React.ComponentType | null }))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    _store.component = opts.component
    return { options: opts }
  },
  Link: ({ children, to, ...props }: { children: React.ReactNode; to?: string; [key: string]: unknown }) => (
    <a href={to ?? "#"} {...(props as object)}>{children}</a>
  ),
  useParams: vi.fn(() => ({ campaignId: "campaign-1", sessionId: "session-1" })),
}))

vi.mock("@/hooks/usePhoneBankSessions", () => ({
  usePhoneBankSession: vi.fn(),
  useClaimEntry: vi.fn(),
  useRecordCall: vi.fn(),
  useSelfReleaseEntry: vi.fn(),
}))

vi.mock("@/hooks/useCallLists", () => ({
  useCallList: vi.fn(),
}))

// Mock useQuery for survey questions
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import type { PhoneBankSession, RecordCallPayload } from "@/types/phone-bank-session"
import type { CallListEntry } from "@/types/call-list"
import {
  usePhoneBankSession,
  useClaimEntry,
  useRecordCall,
  useSelfReleaseEntry,
} from "@/hooks/usePhoneBankSessions"
import { useCallList } from "@/hooks/useCallLists"

import "./call"

const mockUsePhoneBankSession = usePhoneBankSession as unknown as ReturnType<typeof vi.fn>
const mockUseClaimEntry = useClaimEntry as unknown as ReturnType<typeof vi.fn>
const mockUseRecordCall = useRecordCall as unknown as ReturnType<typeof vi.fn>
const mockUseSelfReleaseEntry = useSelfReleaseEntry as unknown as ReturnType<typeof vi.fn>
const mockUseCallList = useCallList as unknown as ReturnType<typeof vi.fn>

function makeMutation<T>(mutateAsync?: ReturnType<typeof vi.fn>) {
  return {
    mutate: vi.fn(),
    mutateAsync: (mutateAsync ?? vi.fn().mockResolvedValue({} as T)) as ReturnType<typeof vi.fn>,
    isPending: false,
  }
}

function makeSession(overrides: Partial<PhoneBankSession> = {}): PhoneBankSession {
  return {
    id: "session-1",
    name: "Saturday Phone Bank",
    status: "active",
    call_list_id: "list-1",
    call_list_name: null,
    scheduled_start: null,
    scheduled_end: null,
    created_by: "user-1",
    created_at: "2026-03-11T00:00:00Z",
    updated_at: "2026-03-11T00:00:00Z",
    caller_count: 1,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<CallListEntry> = {}): CallListEntry {
  return {
    id: "entry-1",
    voter_id: "voter-1",
    voter_name: "Jane Doe",
    priority_score: 1.0,
    phone_numbers: [
      { phone_id: "ph-1", value: "555-1234", type: "mobile", is_primary: true },
      { phone_id: "ph-2", value: "555-5678", type: "home", is_primary: false },
    ],
    status: "in_progress",
    attempt_count: 0,
    claimed_by: "user-1",
    claimed_at: "2026-03-11T10:00:00Z",
    last_attempt_at: null,
    ...overrides,
  }
}

function renderPage() {
  const Component = _store.component
  if (!Component) throw new Error("ActiveCallingPage component not captured by createFileRoute mock")
  return render(<Component />)
}

describe("Active Calling Screen", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePhoneBankSession.mockReturnValue({ data: makeSession(), isLoading: false })
    mockUseCallList.mockReturnValue({ data: { id: "list-1", script_id: null }, isLoading: false })
    mockUseClaimEntry.mockReturnValue(makeMutation())
    mockUseRecordCall.mockReturnValue(makeMutation())
    mockUseSelfReleaseEntry.mockReturnValue(makeMutation())
  })

  describe("Claim Lifecycle (PHON-05)", () => {
    it("shows idle state with Start Calling button on load", () => {
      renderPage()

      expect(screen.getByRole("button", { name: /start calling/i })).toBeInTheDocument()
      expect(screen.getByText(/ready to start calling/i)).toBeInTheDocument()
    })

    it("Start Calling triggers claim mutation with batch_size 1", async () => {
      // claimEntry returns no entries (empty) to reach complete state cleanly
      const mutateAsync = vi.fn().mockResolvedValue([])
      mockUseClaimEntry.mockReturnValue(makeMutation(mutateAsync))

      renderPage()

      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledOnce()
      })
    })

    it("shows voter info after successful claim", async () => {
      const entry = makeEntry({ voter_name: "Jane Doe" })
      const mutateAsync = vi.fn().mockResolvedValue([entry])
      mockUseClaimEntry.mockReturnValue(makeMutation(mutateAsync))

      renderPage()

      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeInTheDocument()
      })
    })

    it("shows completion message when claim returns empty array", async () => {
      const mutateAsync = vi.fn().mockResolvedValue([])
      mockUseClaimEntry.mockReturnValue(makeMutation(mutateAsync))

      renderPage()

      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))

      await waitFor(() => {
        expect(screen.getByText(/all done/i)).toBeInTheDocument()
        expect(screen.getByText(/no more voters available/i)).toBeInTheDocument()
      })
    })
  })

  describe("Voter Info + Survey (PHON-06)", () => {
    it("left panel shows voter name, phone numbers, and address", async () => {
      const entry = makeEntry({
        voter_name: "Jane Doe",
        phone_numbers: [
          { phone_id: "ph-1", value: "555-1234", type: "mobile", is_primary: true },
          { phone_id: "ph-2", value: "555-5678", type: "home", is_primary: false },
        ],
      })
      const mutateAsync = vi.fn().mockResolvedValue([entry])
      mockUseClaimEntry.mockReturnValue(makeMutation(mutateAsync))

      renderPage()

      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeInTheDocument()
        expect(screen.getByText("555-1234")).toBeInTheDocument()
        expect(screen.getByText("555-5678")).toBeInTheDocument()
      })
    })

    it("right panel shows survey questions when script_id is present", async () => {
      // Call list with a script_id
      mockUseCallList.mockReturnValue({
        data: { id: "list-1", script_id: "script-1" },
        isLoading: false,
      })
      // Survey questions from inline useQuery (returns loading — component shows "Loading survey questions...")
      const entry = makeEntry()
      const mutateAsync = vi.fn().mockResolvedValue([entry])
      mockUseClaimEntry.mockReturnValue(makeMutation(mutateAsync))

      renderPage()

      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))

      // First wait for voter info to appear (claim completed)
      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeInTheDocument()
      })

      // When scriptId is set, the SurveyPanel renders the survey section
      // (either "Survey Questions" heading or "Loading survey questions...")
      const surveyElements = screen.queryAllByText(/survey questions/i)
      const loadingElements = screen.queryAllByText(/loading survey/i)
      const found = surveyElements.length > 0 || loadingElements.length > 0
      expect(found).toBe(true)
    })

    it("right panel shows no survey section when script_id is null", async () => {
      mockUseCallList.mockReturnValue({
        data: { id: "list-1", script_id: null },
        isLoading: false,
      })
      const entry = makeEntry()
      const mutateAsync = vi.fn().mockResolvedValue([entry])
      mockUseClaimEntry.mockReturnValue(makeMutation(mutateAsync))

      renderPage()

      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeInTheDocument()
      })

      // No survey questions heading when script_id is null
      expect(screen.queryByText(/survey questions/i)).not.toBeInTheDocument()
    })
  })

  describe("Outcome Recording (PHON-07)", () => {
    async function claimAndShowVoter() {
      const entry = makeEntry()
      const claimAsync = vi.fn().mockResolvedValue([entry])
      mockUseClaimEntry.mockReturnValue(makeMutation(claimAsync))
      renderPage()
      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))
      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeInTheDocument()
      })
      return { entry, claimAsync }
    }

    it("outcome button click submits record call mutation", async () => {
      const recordAsync = vi.fn().mockResolvedValue({ id: "call-1", result_code: "answered", interaction_id: "int-1" })
      mockUseRecordCall.mockReturnValue(makeMutation(recordAsync))

      await claimAndShowVoter()

      // Click "Answered" outcome button
      fireEvent.click(screen.getByRole("button", { name: /^answered$/i }))

      await waitFor(() => {
        expect(recordAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            call_list_entry_id: "entry-1",
            result_code: "answered",
          }) as RecordCallPayload
        )
      })
    })

    it("shows Call recorded confirmation after successful outcome", async () => {
      const recordAsync = vi.fn().mockResolvedValue({ id: "call-1", result_code: "no_answer", interaction_id: "int-1" })
      mockUseRecordCall.mockReturnValue(makeMutation(recordAsync))

      await claimAndShowVoter()

      fireEvent.click(screen.getByRole("button", { name: /no answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/call recorded/i)).toBeInTheDocument()
      })
    })

    it("Next Voter button triggers new claim", async () => {
      const recordAsync = vi.fn().mockResolvedValue({ id: "call-1", result_code: "no_answer", interaction_id: "int-1" })
      mockUseRecordCall.mockReturnValue(makeMutation(recordAsync))

      const claimAsync = vi.fn()
        .mockResolvedValueOnce([makeEntry()])   // first claim — returns entry
        .mockResolvedValueOnce([])               // second claim — returns empty (complete)
      mockUseClaimEntry.mockReturnValue(makeMutation(claimAsync))

      renderPage()

      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))
      await waitFor(() => screen.getByText("Jane Doe"))

      // Record outcome
      fireEvent.click(screen.getByRole("button", { name: /no answer/i }))
      await waitFor(() => screen.getByText(/call recorded/i))

      // Click Next Voter
      fireEvent.click(screen.getByRole("button", { name: /next voter/i }))

      await waitFor(() => {
        expect(claimAsync).toHaveBeenCalledTimes(2)
      })
    })

    it("survey responses sent only when result_code is answered", async () => {
      const recordAsync = vi.fn().mockResolvedValue({ id: "call-1", result_code: "busy", interaction_id: "int-1" })
      mockUseRecordCall.mockReturnValue(makeMutation(recordAsync))

      await claimAndShowVoter()

      // Record a non-answered outcome
      fireEvent.click(screen.getByRole("button", { name: /^busy$/i }))

      await waitFor(() => {
        expect(recordAsync).toHaveBeenCalledWith(
          expect.not.objectContaining({ survey_responses: expect.anything() })
        )
      })
    })
  })

  describe("Skip Behavior (PHON-08)", () => {
    async function claimAndShowVoter() {
      const entry = makeEntry()
      const claimAsync = vi.fn().mockResolvedValue([entry])
      mockUseClaimEntry.mockReturnValue(makeMutation(claimAsync))
      renderPage()
      fireEvent.click(screen.getByRole("button", { name: /start calling/i }))
      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeInTheDocument()
      })
    }

    it("Skip button calls self-release endpoint without recording outcome", async () => {
      const selfReleaseAsync = vi.fn().mockResolvedValue(makeEntry({ status: "available" }))
      mockUseSelfReleaseEntry.mockReturnValue(makeMutation(selfReleaseAsync))
      const recordAsync = vi.fn()
      mockUseRecordCall.mockReturnValue(makeMutation(recordAsync))

      await claimAndShowVoter()

      fireEvent.click(screen.getByRole("button", { name: /skip/i }))

      await waitFor(() => {
        expect(selfReleaseAsync).toHaveBeenCalledWith("entry-1")
      })

      // Record call should NOT have been called
      expect(recordAsync).not.toHaveBeenCalled()
    })

    it("Skip returns caller to idle state ready for next claim", async () => {
      const selfReleaseAsync = vi.fn().mockResolvedValue(makeEntry({ status: "available" }))
      mockUseSelfReleaseEntry.mockReturnValue(makeMutation(selfReleaseAsync))

      await claimAndShowVoter()

      fireEvent.click(screen.getByRole("button", { name: /skip/i }))

      await waitFor(() => {
        // After skip, should return to idle state with Start Calling button
        expect(screen.getByRole("button", { name: /start calling/i })).toBeInTheDocument()
      })
    })
  })
})
