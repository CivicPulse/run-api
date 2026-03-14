import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { VoterFilterBuilder } from "./VoterFilterBuilder"
import type { VoterFilter } from "@/types/voter"

// Mock useCampaignTags so the Tags section renders without a QueryClient
vi.mock("@/hooks/useVoterTags", () => ({
  useCampaignTags: () => ({ data: [], isLoading: false }),
}))

// Mock useDistinctValues for dynamic checkbox groups
vi.mock("@/hooks/useVoters", () => ({
  useDistinctValues: () => ({
    data: {
      ethnicity: [
        { value: "Hispanic", count: 50 },
        { value: "White", count: 30 },
      ],
      spoken_language: [
        { value: "English", count: 70 },
        { value: "Spanish", count: 20 },
      ],
      military_status: [{ value: "Veteran", count: 10 }],
    },
    isLoading: false,
  }),
}))

const emptyFilter: VoterFilter = {}

function noop(_filters: VoterFilter) {}

describe("VoterFilterBuilder", () => {
  it("Test 1: renders Demographics accordion section with party checkboxes", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    expect(screen.getByText("Demographics")).toBeTruthy()
    // Demographics is open by default -- party checkboxes should be visible
    for (const party of ["DEM", "REP", "NPA", "LIB", "GRN", "OTH"]) {
      expect(screen.getByText(party)).toBeTruthy()
    }
  })

  it("Test 2: renders Location accordion section with registration city input", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    expect(screen.getByText("Location")).toBeTruthy()
    // Expand the Location section
    fireEvent.click(screen.getByText("Location"))
    expect(screen.getByText("Registration City")).toBeTruthy()
  })

  it("Test 3: renders Scoring accordion section", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    expect(screen.getByText("Scoring")).toBeTruthy()
  })

  it("Test 4: renders Political accordion section", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    expect(screen.getByText("Political")).toBeTruthy()
  })

  it("Test 5: renders Advanced accordion section", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    expect(screen.getByText("Advanced")).toBeTruthy()
  })

  it("Test 6: changing a party checkbox calls onChange with updated parties array", () => {
    const onChange = vi.fn()
    render(<VoterFilterBuilder value={emptyFilter} onChange={onChange} />)
    // Find DEM checkbox by querying the checkbox role near the "DEM" label
    const demLabel = screen.getByText("DEM")
    const checkbox = demLabel.closest("label")!.querySelector("button, input")!
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledTimes(1)
    const called = onChange.mock.calls[0][0] as VoterFilter
    expect(called.parties).toContain("DEM")
  })

  it("Test 7: dynamic ethnicity checkboxes render values from useDistinctValues", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    // Demographics section is open by default, ethnicity dynamic checkboxes should render
    expect(screen.getByText(/Hispanic/)).toBeTruthy()
    expect(screen.getByText(/White/)).toBeTruthy()
  })

  it("Test 8: Clear all button appears when filters are active and resets to empty object", () => {
    const onChange = vi.fn()
    const filterWithParty: VoterFilter = { parties: ["DEM"] }
    render(<VoterFilterBuilder value={filterWithParty} onChange={onChange} />)
    const clearBtn = screen.getByText("Clear all")
    expect(clearBtn).toBeTruthy()
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith({})
  })

  it("Test 9: badge count shows on Demographics section when party filter is active", () => {
    const filterWithParty: VoterFilter = { parties: ["DEM"] }
    render(<VoterFilterBuilder value={filterWithParty} onChange={noop} />)
    // The badge should show "1" next to Demographics
    const demographicsTrigger = screen.getByText("Demographics").closest("[data-slot='accordion-trigger']")
    expect(demographicsTrigger).toBeTruthy()
    // Find the badge within or near the Demographics header
    const badge = demographicsTrigger!.querySelector("[data-slot='badge']") ??
      screen.getByText("Demographics").parentElement?.querySelector(".text-xs")
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toBe("1")
  })
})
