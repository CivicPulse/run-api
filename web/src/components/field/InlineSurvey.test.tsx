import { describe, expect, it, vi } from "vitest"
import { fireEvent, screen } from "@testing-library/react"
import { render } from "@/test/render"
import { InlineSurvey } from "./InlineSurvey"

// Render the controlled-mode InlineSurvey with a minimal prop set. We pass an
// empty `scriptId` so the survey-script query is disabled and `requiresSurvey`
// becomes false — the only gate left is the notes-required logic, which is
// exactly what we want to exercise here.
function renderControlled(overrides: Record<string, unknown> = {}) {
  const onSubmitDraft = vi.fn().mockResolvedValue(undefined)
  const onSkip = vi.fn()
  const utils = render(
    <InlineSurvey
      mode="controlled"
      campaignId="campaign-1"
      scriptId=""
      open={true}
      onSkip={onSkip}
      voterName="Jane Voter"
      onSubmitDraft={onSubmitDraft}
      submitLabel="Save Call"
      {...overrides}
    />,
  )
  return { ...utils, onSubmitDraft, onSkip }
}

describe("InlineSurvey notesRequired decoupling (D-09, CANV-03)", () => {
  it("renders label 'Notes' with muted '(optional)' span when notesRequired is false (default)", () => {
    renderControlled()
    // The label text "Notes" is present
    const label = screen.getByText("Notes")
    expect(label).toBeInTheDocument()
    // The "(optional)" sibling span is present and muted
    const optional = screen.getByText("(optional)")
    expect(optional).toBeInTheDocument()
    expect(optional).toHaveClass("text-muted-foreground")
  })

  it("Save button is enabled with empty notes when notesRequired is false", () => {
    renderControlled()
    const save = screen.getByRole("button", { name: /save call/i })
    expect(save).not.toBeDisabled()
  })

  it("Save handler receives empty string notes when user saves without typing", async () => {
    const { onSubmitDraft } = renderControlled()
    const save = screen.getByRole("button", { name: /save call/i })
    fireEvent.click(save)
    expect(onSubmitDraft).toHaveBeenCalledTimes(1)
    expect(onSubmitDraft).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "" }),
    )
  })

  it("does NOT render the 'Add notes before saving' destructive paragraph when notesRequired is false", () => {
    renderControlled()
    expect(screen.queryByText(/Add notes before saving/i)).toBeNull()
  })

  it("when notesRequired is true, Save is disabled with empty notes", () => {
    renderControlled({ notesRequired: true })
    const save = screen.getByRole("button", { name: /save call/i })
    expect(save).toBeDisabled()
  })

  it("when notesRequired is true, Save is enabled once notes has content", () => {
    renderControlled({ notesRequired: true })
    const textarea = screen.getByLabelText(/notes/i)
    fireEvent.change(textarea, { target: { value: "Spoke with voter." } })
    const save = screen.getByRole("button", { name: /save call/i })
    expect(save).not.toBeDisabled()
  })

  it("isControlled=true with notesRequired=false does NOT require notes (regression guard for D-09 decoupling)", () => {
    // This is the load-bearing assertion: prior to D-09 the rule was
    // `requiresNotes = isControlled`, which forced notes whenever the
    // controlled mode was used. Now controlled mode + explicit
    // notesRequired={false} must permit empty notes.
    renderControlled({ notesRequired: false })
    const save = screen.getByRole("button", { name: /save call/i })
    expect(save).not.toBeDisabled()
    // And the destructive paragraph stays away
    expect(screen.queryByText(/Add notes before saving/i)).toBeNull()
  })
})
