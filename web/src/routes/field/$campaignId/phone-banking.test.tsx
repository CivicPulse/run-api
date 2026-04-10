import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RecordCallPayload } from "@/types/phone-bank-session"

const routeStore = vi.hoisted(() => ({ component: null as React.ComponentType | null }))
const mockUseFieldMe = vi.hoisted(() => vi.fn())
const mockUseCallingSession = vi.hoisted(() => vi.fn())
const mockUseSurveyScript = vi.hoisted(() => vi.fn())
const mockUseRecordResponses = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())

const tourState = vi.hoisted(() => ({
  isRunning: false,
  sessionCounts: {} as Record<string, { phoneBanking?: number }>,
  dismissedThisSession: {} as Record<string, { phoneBanking?: boolean }>,
  isSegmentComplete: vi.fn(() => true),
  incrementSession: vi.fn(),
  dismissQuickStart: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    routeStore.component = opts.component
    return {
      options: opts,
      useParams: () => ({ campaignId: "campaign-1" }),
    }
  },
  Link: ({ children, to, ...props }: { children: React.ReactNode; to?: string; [key: string]: unknown }) => (
    <a href={to ?? "#"} {...props}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}))

vi.mock("@/hooks/useFieldMe", () => ({
  useFieldMe: (...args: unknown[]) => mockUseFieldMe(...args),
}))

vi.mock("@/hooks/useCallingSession", () => ({
  useCallingSession: (...args: unknown[]) => mockUseCallingSession(...args),
}))

vi.mock("@/hooks/useSurveys", () => ({
  useSurveyScript: (...args: unknown[]) => mockUseSurveyScript(...args),
  useRecordResponses: (...args: unknown[]) => mockUseRecordResponses(...args),
}))

vi.mock("@/hooks/useTour", () => ({
  useTour: () => ({ startSegment: vi.fn() }),
  shouldAutoStartTour: () => false,
}))

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { profile: { sub: string } } }) => unknown) =>
    selector({ user: { profile: { sub: "user-1" } } }),
}))

const mockUseTourStore = vi.hoisted(() => Object.assign(
  (selector: (state: typeof tourState) => unknown) => selector(tourState),
  { getState: () => tourState },
))

vi.mock("@/stores/tourStore", () => ({
  useTourStore: mockUseTourStore,
  tourKey: () => "tour-key",
}))

vi.mock("@/lib/milestones", () => ({ checkMilestone: vi.fn() }))

vi.mock("@/components/field/FieldProgress", () => ({
  FieldProgress: ({ current, total }: { current: number; total: number }) => (
    <div data-testid="field-progress">{current}/{total}</div>
  ),
}))

vi.mock("@/components/field/CallingVoterCard", () => ({
  CallingVoterCard: ({ entry }: { entry: { voter_name: string | null } }) => (
    <div>{entry.voter_name}</div>
  ),
}))

vi.mock("@/components/field/OutcomeGrid", () => ({
  OutcomeGrid: ({ outcomes, onSelect, disabled }: {
    outcomes: Array<{ code: string; label: string }>
    onSelect: (code: string) => void
    disabled?: boolean
  }) => (
    <div>
      {outcomes.map((outcome) => (
        <button key={outcome.code} disabled={disabled} onClick={() => onSelect(outcome.code)}>
          {outcome.label}
        </button>
      ))}
    </div>
  ),
}))

vi.mock("@/components/field/CompletionSummary", () => ({
  CompletionSummary: () => <div>Complete</div>,
}))

vi.mock("@/components/field/QuickStartCard", () => ({
  QuickStartCard: () => null,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, asChild, ...props }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; asChild?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) => asChild ? children : <button onClick={onClick} disabled={disabled} {...props}>{children}</button>,
}))

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  CardFooter: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
}))

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}))

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

import "./phone-banking"

function renderPage() {
  const Component = routeStore.component
  if (!Component) throw new Error("PhoneBanking component not captured by route mock")
  return render(<Component />)
}

const baseEntry = {
  id: "entry-1",
  voter_id: "voter-1",
  voter_name: "Jane Doe",
  phone_numbers: [{ phone_id: "phone-1", value: "+15551111111", type: "cell", is_primary: true }],
  phone_attempts: null,
  attempt_count: 0,
  priority_score: 1,
}

function makeCallingSession(overrides?: Partial<ReturnType<typeof createCallingSessionState>>) {
  return {
    ...createCallingSessionState(),
    ...overrides,
  }
}

function createCallingSessionState() {
  return {
    currentEntry: baseEntry,
    completedCount: 0,
    totalEntries: 1,
    isComplete: false,
    sessionStats: { totalCalls: 0, answered: 0, noAnswer: 0, voicemail: 0, other: 0 },
    isLoading: false,
    isError: false,
    scriptId: "script-1" as string | null,
    selectedPhoneNumber: "+15551111111" as string | null,
    callStartedAt: "2026-04-02T12:00:00.000Z",
    isSubmittingCall: false,
    submitCall: vi.fn().mockResolvedValue(true),
    handleSkip: vi.fn(),
    handleEndSession: vi.fn(),
    handleCallStarted: vi.fn(),
    noEntriesAvailable: false,
    claimFailure: null as { title: string; detail: string; actionLabel: string } | null,
    saveFailure: null as { title: string; detail: string; actionLabel: string } | null,
    retryLoad: vi.fn(),
  }
}

describe("field phone banking route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tourState.isSegmentComplete.mockReturnValue(true)
    mockUseFieldMe.mockReturnValue({
      isLoading: false,
      data: { phone_banking: { session_id: "session-1", total: 3 } },
    })
    mockUseRecordResponses.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseSurveyScript.mockReturnValue({
      data: {
        questions: [
          {
            id: "q-2",
            script_id: "script-1",
            position: 2,
            question_text: "Support level?",
            question_type: "multiple_choice",
            options: { choices: ["Support", "Undecided"] },
          },
          {
            id: "q-1",
            script_id: "script-1",
            position: 1,
            question_text: "Who answered?",
            question_type: "free_text",
            options: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
  })

  it("submits non-answered outcomes immediately through the authoritative payload shape", async () => {
    const submitCall = vi.fn().mockResolvedValue(true)
    mockUseCallingSession.mockReturnValue(makeCallingSession({ submitCall }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "No Answer" }))

    await waitFor(() => expect(submitCall).toHaveBeenCalledTimes(1))

    const payload = submitCall.mock.calls[0][0] as RecordCallPayload
    expect(payload).toMatchObject({
      call_list_entry_id: "entry-1",
      result_code: "no_answer",
      phone_number_used: "+15551111111",
      call_started_at: "2026-04-02T12:00:00.000Z",
    })
    expect(payload.call_ended_at).toEqual(expect.any(String))
    expect(payload).not.toHaveProperty("notes")
    expect(payload).not.toHaveProperty("survey_responses")
    expect(payload).not.toHaveProperty("survey_complete")
  })

  it("holds answered calls until final submit and sends notes plus ordered survey responses", async () => {
    const submitCall = vi.fn().mockResolvedValue(true)
    mockUseCallingSession.mockReturnValue(makeCallingSession({ submitCall }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Answered" }))
    expect(submitCall).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Call Notes"), {
      target: { value: "Strong supporter who asked for a yard sign." },
    })
    fireEvent.change(screen.getByPlaceholderText("Type your answer..."), {
      target: { value: "Spouse answered" },
    })
    fireEvent.click(screen.getByRole("radio", { name: "Support" }))
    fireEvent.click(screen.getByRole("button", { name: "Save Call" }))

    await waitFor(() => expect(submitCall).toHaveBeenCalledTimes(1))

    expect(submitCall).toHaveBeenCalledWith({
      call_list_entry_id: "entry-1",
      result_code: "answered",
      phone_number_used: "+15551111111",
      call_started_at: "2026-04-02T12:00:00.000Z",
      call_ended_at: expect.any(String),
      notes: "Strong supporter who asked for a yard sign.",
      survey_responses: [
        { question_id: "q-1", answer_value: "Spouse answered" },
        { question_id: "q-2", answer_value: "Support" },
      ],
      survey_complete: true,
    })
  })

  it("keeps the answered draft open and shows a persistent retry card when save fails", async () => {
    const submitCall = vi.fn().mockResolvedValue(false)
    mockUseCallingSession.mockReturnValue(makeCallingSession({
      submitCall,
      saveFailure: {
        title: "Couldn’t save this call yet",
        detail: "boom",
        actionLabel: "Retry save",
      },
    }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Answered" }))
    fireEvent.change(screen.getByLabelText("Call Notes"), {
      target: { value: "Left detailed notes for retry." },
    })
    fireEvent.change(screen.getByPlaceholderText("Type your answer..."), {
      target: { value: "Voter answered directly" },
    })
    fireEvent.click(screen.getByRole("radio", { name: "Support" }))
    fireEvent.click(screen.getByRole("button", { name: "Save Call" }))

    await waitFor(() => expect(submitCall).toHaveBeenCalledTimes(1))
    expect(screen.getByText("Jane Doe")).toBeInTheDocument()
    expect(screen.getByLabelText("Call Notes")).toBeInTheDocument()
    expect(screen.getByTestId("phone-banking-save-failure-card")).toBeInTheDocument()
    expect(screen.getByText("boom")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry save" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Back to Hub" })).toBeInTheDocument()
  })

  it("allows answered calls without a script to save notes through the same record_call path", async () => {
    const submitCall = vi.fn().mockResolvedValue(true)
    mockUseCallingSession.mockReturnValue(makeCallingSession({ submitCall, scriptId: null }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Answered" }))
    fireEvent.change(screen.getByLabelText("Call Notes"), {
      target: { value: "Reached voter and confirmed they plan to vote early." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save Call" }))

    await waitFor(() => expect(submitCall).toHaveBeenCalledTimes(1))
    expect(submitCall).toHaveBeenCalledWith({
      call_list_entry_id: "entry-1",
      result_code: "answered",
      phone_number_used: "+15551111111",
      call_started_at: "2026-04-02T12:00:00.000Z",
      call_ended_at: expect.any(String),
      notes: "Reached voter and confirmed they plan to vote early.",
    })
  })

  it("renders a recoverable session-load failure card with retry and back actions", () => {
    const retryLoad = vi.fn()
    mockUseCallingSession.mockReturnValue(makeCallingSession({
      isError: true,
      claimFailure: {
        title: "Couldn’t load your next calls",
        detail: "Assignment claim failed.",
        actionLabel: "Retry loading calls",
      },
      retryLoad,
    }))

    renderPage()

    expect(screen.getByText("Couldn’t load your next calls")).toBeInTheDocument()
    expect(screen.getByText("Assignment claim failed.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Retry loading calls" }))
    expect(retryLoad).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Back to Hub" }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/field/$campaignId", params: { campaignId: "campaign-1" } })
  })

  it("blocks answered submission when the survey question load fails", async () => {
    const submitCall = vi.fn().mockResolvedValue(true)
    mockUseCallingSession.mockReturnValue(makeCallingSession({ submitCall }))
    mockUseSurveyScript.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Answered" }))

    expect(screen.getByText(/couldn't load the survey questions/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save Call" })).toBeDisabled()
    expect(submitCall).not.toHaveBeenCalled()
  })

  it("blocks answered submission when the survey payload is malformed", async () => {
    const submitCall = vi.fn().mockResolvedValue(true)
    mockUseCallingSession.mockReturnValue(makeCallingSession({ submitCall }))
    mockUseSurveyScript.mockReturnValue({
      data: {
        questions: [
          {
            id: "q-bad",
            script_id: "script-1",
            position: 1,
            question_text: "Broken choice question",
            question_type: "multiple_choice",
            options: { choices: [] },
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Answered" }))

    expect(screen.getByText(/some survey questions were malformed/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save Call" })).toBeDisabled()
    expect(submitCall).not.toHaveBeenCalled()
  })
})
