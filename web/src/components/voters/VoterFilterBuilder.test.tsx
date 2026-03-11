import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { VoterFilterBuilder } from "./VoterFilterBuilder"
import type { VoterFilter } from "@/types/voter"

// Mock useCampaignTags so the Tags section renders without a QueryClient
vi.mock("@/hooks/useVoterTags", () => ({
  useCampaignTags: () => ({ data: [], isLoading: false }),
}))

const emptyFilter: VoterFilter = {}

function noop(_filters: VoterFilter) {}

describe("VoterFilterBuilder", () => {
  it("Test 1: renders Party section with checkboxes for all six parties", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    for (const party of ["DEM", "REP", "NPA", "LIB", "GRN", "OTH"]) {
      expect(screen.getByText(party)).toBeTruthy()
    }
  })

  it("Test 2: renders Age Range inputs (age_min, age_max)", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    const inputs = screen.getAllByPlaceholderText(/min|max/i)
    expect(inputs.length).toBeGreaterThanOrEqual(2)
  })

  it("Test 3: renders a More filters toggle button", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    expect(screen.getByText(/more filters/i)).toBeTruthy()
  })

  it("Test 4: secondary filters (zip_code input) are NOT visible before clicking More filters", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    expect(screen.queryByPlaceholderText(/zip code/i)).toBeNull()
  })

  it("Test 5: secondary filters become visible after clicking More filters toggle", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    fireEvent.click(screen.getByText(/more filters/i))
    expect(screen.getByPlaceholderText(/zip code/i)).toBeTruthy()
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

  it("Test 7: renders Tags section", () => {
    render(<VoterFilterBuilder value={emptyFilter} onChange={noop} />)
    // Tags section header should be visible (at least one element matching "Tags")
    expect(screen.getAllByText(/tags/i).length).toBeGreaterThan(0)
  })
})
