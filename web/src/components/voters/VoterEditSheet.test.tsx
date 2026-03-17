/**
 * Nyquist validation tests for FRNT-03: VoterEditSheet expansion.
 * Tests cover: 27 editable fields in 3 sections, sheet width (max-w-xl),
 * collapsible mailing address with auto-expand when voter has mailing data,
 * and form field persistence via forceMount.
 *
 * task_id: 26-04-01
 * requirement: FRNT-03
 */
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { VoterEditSheet } from "./VoterEditSheet"
import type { Voter } from "@/types/voter"

// ── Mocks ────────────────────────────────────────────────────────────────────

// useFormGuard: simulate no navigation block so the main form renders
vi.mock("@/hooks/useFormGuard", () => ({
  useFormGuard: () => ({ isBlocked: false, proceed: vi.fn(), reset: vi.fn() }),
}))

// useUpdateVoter: no-op mutation
vi.mock("@/hooks/useVoters", () => ({
  useUpdateVoter: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}))

// Sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseVoter: Voter = {
  id: "voter-1",
  campaign_id: "camp-1",
  source_type: "L2",
  source_id: "L2-001",
  first_name: "Jane",
  middle_name: null,
  last_name: "Doe",
  suffix: null,
  date_of_birth: "1985-06-15",
  age: 38,
  gender: "F",
  ethnicity: "Hispanic",
  party: "DEM",
  precinct: null,
  registration_date: null,
  registration_line1: "123 Main St",
  registration_line2: null,
  registration_city: "Springfield",
  registration_state: "IL",
  registration_zip: "62701",
  registration_zip4: null,
  registration_county: "Sangamon",
  registration_apartment_type: null,
  mailing_line1: null,
  mailing_line2: null,
  mailing_city: null,
  mailing_state: null,
  mailing_zip: null,
  mailing_zip4: null,
  mailing_country: null,
  mailing_type: null,
  congressional_district: null,
  state_senate_district: null,
  state_house_district: null,
  voting_history: null,
  propensity_general: null,
  propensity_primary: null,
  propensity_combined: null,
  spoken_language: null,
  marital_status: null,
  military_status: null,
  party_change_indicator: null,
  cell_phone_confidence: null,
  household_id: null,
  household_party_registration: null,
  household_size: null,
  family_id: null,
  latitude: null,
  longitude: null,
  extra_data: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
}

const voterWithMailing: Voter = {
  ...baseVoter,
  mailing_line1: "PO Box 100",
  mailing_city: "Chicago",
  mailing_state: "IL",
  mailing_zip: "60601",
}

function renderSheet(voter: Voter = baseVoter, open = true) {
  return render(
    <VoterEditSheet
      open={open}
      onOpenChange={vi.fn()}
      voter={voter}
      campaignId="camp-1"
    />,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe("FRNT-03: VoterEditSheet — sheet width", () => {
  it("renders SheetContent with max-w-xl class for wider layout", () => {
    renderSheet()
    // Sheet content renders in a portal outside the container root;
    // query the document instead.
    const sheetContent = document.querySelector("[class*='max-w-xl']")
    expect(sheetContent).toBeTruthy()
  })
})

describe("FRNT-03: VoterEditSheet — 3 form sections with Separator headers", () => {
  it("renders Personal section header", () => {
    renderSheet()
    // The section separator label is uppercase "PERSONAL"
    expect(screen.getByText(/personal/i)).toBeTruthy()
  })

  it("renders Registration Address section header", () => {
    renderSheet()
    expect(screen.getByText(/registration address/i)).toBeTruthy()
  })

  it("renders Mailing Address section trigger (collapsed by default when no mailing data)", () => {
    renderSheet()
    // When collapsed, the trigger shows "+ Add Mailing Address"
    expect(screen.getByText(/add mailing address/i)).toBeTruthy()
  })
})

describe("FRNT-03: VoterEditSheet — Personal section fields (11 fields)", () => {
  it("renders First Name input", () => {
    renderSheet()
    expect(screen.getByLabelText(/first name/i)).toBeTruthy()
  })

  it("renders Middle Name input", () => {
    renderSheet()
    expect(screen.getByLabelText(/middle name/i)).toBeTruthy()
  })

  it("renders Last Name input", () => {
    renderSheet()
    expect(screen.getByLabelText(/last name/i)).toBeTruthy()
  })

  it("renders Suffix input", () => {
    renderSheet()
    expect(screen.getByLabelText(/suffix/i)).toBeTruthy()
  })

  it("renders Date of Birth input with type=date", () => {
    renderSheet()
    const dobInput = screen.getByLabelText(/date of birth/i)
    expect(dobInput).toBeTruthy()
    expect((dobInput as HTMLInputElement).type).toBe("date")
  })

  it("renders Party select dropdown", () => {
    renderSheet()
    // Use label text matching the exact "Party" label (not "party" as part of longer strings).
    // Multiple elements may contain "party" — verify the Label for the party Select exists.
    const partyLabels = screen.getAllByText(/^party$/i)
    expect(partyLabels.length).toBeGreaterThanOrEqual(1)
  })

  it("renders Gender select dropdown", () => {
    renderSheet()
    expect(screen.getByText(/gender/i)).toBeTruthy()
  })

  it("renders Ethnicity input", () => {
    renderSheet()
    expect(screen.getByLabelText(/ethnicity/i)).toBeTruthy()
  })

  it("renders Language input (spoken_language)", () => {
    renderSheet()
    expect(screen.getByLabelText(/language/i)).toBeTruthy()
  })

  it("renders Marital Status input", () => {
    renderSheet()
    expect(screen.getByLabelText(/marital status/i)).toBeTruthy()
  })

  it("renders Military Status input", () => {
    renderSheet()
    expect(screen.getByLabelText(/military status/i)).toBeTruthy()
  })
})

describe("FRNT-03: VoterEditSheet — Registration Address section fields (8 fields)", () => {
  it("renders registration_line1 input", () => {
    renderSheet()
    // Both registration and mailing have "Line 1" labels (forceMount keeps both in DOM).
    // Verify by id which is unique per field.
    expect(document.getElementById("registration_line1")).toBeTruthy()
  })

  it("renders registration_line2 input", () => {
    renderSheet()
    // Both registration and mailing have "Line 2" — at least one must exist
    expect(screen.getAllByLabelText(/^line 2$/i).length).toBeGreaterThanOrEqual(1)
  })

  it("renders registration_city input", () => {
    renderSheet()
    // Multiple "City" labels exist (reg + mailing); at least one must be present
    expect(screen.getAllByLabelText(/^city$/i).length).toBeGreaterThanOrEqual(1)
  })

  it("renders registration_state input", () => {
    renderSheet()
    expect(screen.getAllByLabelText(/^state$/i).length).toBeGreaterThanOrEqual(1)
  })

  it("renders registration_zip input", () => {
    renderSheet()
    expect(screen.getAllByLabelText(/^zip$/i).length).toBeGreaterThanOrEqual(1)
  })

  it("renders registration_zip4 input", () => {
    renderSheet()
    expect(screen.getAllByLabelText(/^zip\+4$/i).length).toBeGreaterThanOrEqual(1)
  })

  it("renders registration_county input", () => {
    renderSheet()
    expect(screen.getByLabelText(/county/i)).toBeTruthy()
  })

  it("renders registration_apartment_type input", () => {
    renderSheet()
    expect(screen.getByLabelText(/apartment type/i)).toBeTruthy()
  })
})

describe("FRNT-03: VoterEditSheet — Mailing Address section (collapsible, 8 fields)", () => {
  it("mailing address is collapsed by default when voter has no mailing data", () => {
    renderSheet()
    // In collapsed state the trigger reads "+ Add Mailing Address"
    expect(screen.getByText(/\+ add mailing address/i)).toBeTruthy()
  })

  it("mailing address is expanded by default when voter has mailing data", () => {
    renderSheet(voterWithMailing)
    // In expanded state the trigger reads "Mailing Address"
    expect(screen.getByText(/^mailing address$/i)).toBeTruthy()
  })

  it("clicking the collapsed trigger expands the mailing address section", () => {
    renderSheet()
    const trigger = screen.getByText(/\+ add mailing address/i)
    fireEvent.click(trigger)
    // After expanding, the trigger text should change to "Mailing Address"
    expect(screen.getByText(/^mailing address$/i)).toBeTruthy()
  })

  it("mailing_line1 field is accessible in the DOM even when mailing section is collapsed (forceMount)", () => {
    renderSheet()
    // forceMount keeps the CollapsibleContent in the DOM.
    // The mailing_line1 input uses id="mailing_line1".
    const mailingInput = document.getElementById("mailing_line1")
    expect(mailingInput).toBeTruthy()
  })

  it("mailing address section includes Line 1 field", () => {
    renderSheet(voterWithMailing)
    // mailing_line1 is pre-populated from voter.mailing_line1
    const input = document.getElementById("mailing_line1") as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe("PO Box 100")
  })

  it("renders mailing_country input in expanded mailing section", () => {
    renderSheet(voterWithMailing)
    expect(screen.getByLabelText(/country/i)).toBeTruthy()
  })

  it("renders mailing_type input in expanded mailing section", () => {
    renderSheet(voterWithMailing)
    expect(screen.getByLabelText(/^type$/i)).toBeTruthy()
  })
})

describe("FRNT-03: VoterEditSheet — form pre-population from voter data", () => {
  it("pre-populates first_name input from voter", () => {
    renderSheet()
    const input = screen.getByLabelText(/first name/i) as HTMLInputElement
    expect(input.value).toBe("Jane")
  })

  it("pre-populates last_name input from voter", () => {
    renderSheet()
    const input = screen.getByLabelText(/last name/i) as HTMLInputElement
    expect(input.value).toBe("Doe")
  })

  it("pre-populates registration_city input from voter", () => {
    renderSheet()
    // registration_city is pre-populated as "Springfield"
    const cityInputs = screen.getAllByLabelText(/^city$/i) as HTMLInputElement[]
    const regCity = cityInputs.find((el) => el.value === "Springfield")
    expect(regCity).toBeTruthy()
  })
})

describe("FRNT-03: VoterEditSheet — Save button behavior", () => {
  it("Save Changes button is rendered", () => {
    renderSheet()
    expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy()
  })

  it("Save Changes button is disabled when form is not dirty", () => {
    renderSheet()
    const btn = screen.getByRole("button", { name: /save changes/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
