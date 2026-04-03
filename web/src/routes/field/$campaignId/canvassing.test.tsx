import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const routeStore = vi.hoisted(() => ({ component: null as React.ComponentType | null }))
const mockUseFieldMe = vi.hoisted(() => vi.fn())
const mockUseWalkList = vi.hoisted(() => vi.fn())
const mockUseCanvassingWizard = vi.hoisted(() => vi.fn())
const mockCheckMilestone = vi.hoisted(() => vi.fn())
const mockToast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }))

const tourState = vi.hoisted(() => ({
  isRunning: false,
  sessionCounts: {} as Record<string, { canvassing?: number }>,
  dismissedThisSession: {} as Record<string, { canvassing?: boolean }>,
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
}))

vi.mock("@/hooks/useFieldMe", () => ({
  useFieldMe: (...args: unknown[]) => mockUseFieldMe(...args),
}))

vi.mock("@/hooks/useWalkLists", () => ({
  useWalkList: (...args: unknown[]) => mockUseWalkList(...args),
}))

vi.mock("@/hooks/useCanvassingWizard", () => ({
  useCanvassingWizard: (...args: unknown[]) => mockUseCanvassingWizard(...args),
}))

vi.mock("@/hooks/useTour", () => ({
  useTour: () => ({ startSegment: vi.fn() }),
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

vi.mock("@/stores/canvassingStore", () => ({
  useCanvassingStore: (selector: (state: {
    walkListId: string | null
    lastActiveAt: number
    setSortMode: (mode: string) => void
    setLocationState: (status: string, snapshot?: unknown) => void
  }) => unknown) => selector({
    walkListId: "walk-1",
    lastActiveAt: Date.now(),
    setSortMode: vi.fn(),
    setLocationState: vi.fn(),
  }),
}))

vi.mock("@/components/field/FieldProgress", () => ({
  FieldProgress: ({ current, total }: { current: number; total: number }) => (
    <div data-testid="field-progress">{current}/{total}</div>
  ),
}))

vi.mock("@/components/field/HouseholdCard", () => ({
  HouseholdCard: ({ household, onOutcomeSelect, onSkip }: {
    household: { address: string; entries: Array<{ id: string; voter_id: string }> }
    onOutcomeSelect: (entryId: string, voterId: string, result: string) => void
    onSkip: () => void
  }) => (
    <div>
      <div>{household.address}</div>
      <button onClick={() => onOutcomeSelect(household.entries[0].id, household.entries[0].voter_id, "supporter")}>Record Supporter</button>
      <button onClick={() => onOutcomeSelect(household.entries[0].id, household.entries[0].voter_id, "not_home")}>Record Not Home</button>
      <button onClick={onSkip}>Skip Address</button>
    </div>
  ),
}))

vi.mock("@/components/field/InlineSurvey", () => ({
  InlineSurvey: ({ open, onSubmitDraft, onSkip, submitLabel, voterName, isSubmitting }: {
    open: boolean
    onSubmitDraft: (draft: {
      notes: string
      surveyResponses: Array<{ question_id: string; answer_value: string }>
      surveyComplete: boolean
    }) => void | Promise<void>
    onSkip: () => void
    submitLabel?: string
    voterName?: string
    isSubmitting?: boolean
  }) => open ? (
    <div>
      <div>Inline Survey for {voterName}</div>
      <button disabled={isSubmitting} onClick={() => onSubmitDraft({
        notes: "Met voter at the door.",
        surveyResponses: [{ question_id: "q-1", answer_value: "Supporter" }],
        surveyComplete: true,
      })}>{submitLabel ?? "Submit"}</button>
      <button onClick={onSkip}>Cancel Draft</button>
    </div>
  ) : null,
}))

vi.mock("@/components/field/DoorListView", () => ({
  DoorListView: ({ households, open }: { households: Array<{ address: string }>; open: boolean }) => open ? (
    <div>
      <div>All Doors</div>
      {households.map((household) => <div key={household.address}>{household.address}</div>)}
    </div>
  ) : null,
}))

vi.mock("@/components/field/QuickStartCard", () => ({ QuickStartCard: () => null }))
vi.mock("@/components/field/CanvassingMap", () => ({ CanvassingMap: () => <div>Map</div> }))
vi.mock("@/components/field/CanvassingCompletionSummary", () => ({ CanvassingCompletionSummary: () => <div>Complete</div> }))
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, disabled, asChild, ...props }: any) => asChild ? children : <button onClick={onClick} disabled={disabled} {...props}>{children}</button> }))
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/field/ResumePrompt", () => ({ useResumePrompt: vi.fn() }))
vi.mock("@/lib/milestones", () => ({ checkMilestone: (...args: unknown[]) => mockCheckMilestone(...args) }))
vi.mock("sonner", () => ({ toast: mockToast }))

import "./canvassing"

function renderPage() {
  const Component = routeStore.component
  if (!Component) throw new Error("Canvassing component not captured by route mock")
  return render(<Component />)
}

const households = [
  {
    householdKey: "house-a",
    address: "100 Main St, Macon, GA 31201",
    entries: [{ id: "entry-a", voter_id: "voter-a", voter: { first_name: "Avery", last_name: "A" } }],
  },
  {
    householdKey: "house-b",
    address: "200 Oak Ave, Macon, GA 31201",
    entries: [{ id: "entry-b", voter_id: "voter-b", voter: { first_name: "Bailey", last_name: "B" } }],
  },
]

function createWizardState(overrides?: Partial<ReturnType<typeof makeWizardState>>) {
  return {
    ...makeWizardState(),
    ...overrides,
  }
}

function makeWizardState() {
  return {
    households,
    currentHousehold: households[0],
    currentAddressIndex: 0,
    totalAddresses: 2,
    completedAddresses: 0,
    activeEntryId: "entry-a",
    completedEntries: {},
    skippedEntries: [],
    sortMode: "sequence" as const,
    locationSnapshot: null,
    locationStatus: "idle" as const,
    isComplete: false,
    isLoading: false,
    isError: false,
    isSavingDoorKnock: false,
    handleOutcome: vi.fn().mockResolvedValue({}),
    handleSubmitContact: vi.fn().mockResolvedValue(true),
    handlePostSurveyAdvance: vi.fn(),
    handleSkipAddress: vi.fn(),
    handleBulkNotHome: vi.fn().mockResolvedValue(true),
    handleJumpToAddress: vi.fn(),
  }
}

describe("field canvassing route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tourState.isSegmentComplete.mockReturnValue(true)
    mockUseFieldMe.mockReturnValue({
      isLoading: false,
      data: { canvassing: { walk_list_id: "walk-1" } },
    })
    mockUseWalkList.mockReturnValue({ data: { script_id: "script-1" } })
  })

  it("opens a controlled draft for contact outcomes and waits for final submit", async () => {
    const handleOutcome = vi.fn().mockResolvedValue({ surveyTrigger: true })
    const handleSubmitContact = vi.fn().mockResolvedValue(true)
    mockUseCanvassingWizard.mockReturnValue(createWizardState({ handleOutcome, handleSubmitContact }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Record Supporter" }))

    await waitFor(() => expect(handleOutcome).toHaveBeenCalledWith("entry-a", "voter-a", "supporter"))
    expect(handleSubmitContact).not.toHaveBeenCalled()
    expect(screen.getByText("Inline Survey for Avery A")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Save Door Knock" }))

    await waitFor(() => expect(handleSubmitContact).toHaveBeenCalledWith({
      entryId: "entry-a",
      voterId: "voter-a",
      result: "supporter",
      notes: "Met voter at the door.",
      surveyResponses: [{ question_id: "q-1", answer_value: "Supporter" }],
      surveyComplete: true,
    }))
  })

  it("keeps the same draft open when the final submit fails", async () => {
    const handleOutcome = vi.fn().mockResolvedValue({ surveyTrigger: true })
    const handleSubmitContact = vi.fn().mockResolvedValue(false)
    mockUseCanvassingWizard.mockReturnValue(createWizardState({ handleOutcome, handleSubmitContact }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Record Supporter" }))

    await waitFor(() => expect(screen.getByRole("button", { name: "Save Door Knock" })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Save Door Knock" }))

    await waitFor(() => expect(handleSubmitContact).toHaveBeenCalledTimes(1))
    expect(screen.getByText("Inline Survey for Avery A")).toBeInTheDocument()
  })

  it("prompts for household-wide not-home handling and records the bulk action", async () => {
    const multiResidentHousehold = {
      ...households[0],
      entries: [
        { id: "entry-a", voter_id: "voter-a", voter: { first_name: "Avery", last_name: "A" } },
        { id: "entry-a2", voter_id: "voter-a2", voter: { first_name: "Alex", last_name: "A" } },
      ],
    }
    const handleOutcome = vi.fn().mockResolvedValue({ bulkPrompt: true })
    const handleBulkNotHome = vi.fn().mockResolvedValue(true)
    mockUseCanvassingWizard.mockReturnValue(createWizardState({
      households: [multiResidentHousehold, households[1]],
      currentHousehold: multiResidentHousehold,
      handleOutcome,
      handleBulkNotHome,
    }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Record Not Home" }))

    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    const toastConfig = mockToast.mock.calls[0][1]
    expect(toastConfig.action.label).toBe("Yes")

    await toastConfig.action.onClick()

    expect(handleBulkNotHome).toHaveBeenCalledWith([
      { id: "entry-a2", voter_id: "voter-a2", voter: { first_name: "Alex", last_name: "A" } },
    ])
  })

  it("shows skipped addresses in the all doors sheet so volunteers can revisit them", () => {
    const handleSkipAddress = vi.fn()
    mockUseCanvassingWizard.mockReturnValue(createWizardState({
      skippedEntries: ["entry-a"],
      handleSkipAddress,
    }))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Skip Address" }))
    expect(handleSkipAddress).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /all doors/i }))

    expect(screen.getAllByText("100 Main St, Macon, GA 31201").length).toBeGreaterThan(0)
  })
})
