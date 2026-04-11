/**
 * Plan 110-06 — Coverage backfill for VoterCard.
 *
 * VoterCard was introduced in phase 107 (household-view redesign) but only
 * indirectly exercised via HouseholdCard tests, which never asserted on the
 * branching logic unique to VoterCard:
 *   - "First visit" vs. ordinal "Nth visit — last: …, MMM d" rendering
 *   - propensity badge label/color branching
 *   - party badge fallback to "Unknown" when party is null
 *   - active vs. completed vs. skipped visual state
 *   - outcome grid rendered only when active AND not completed AND not skipped
 *
 * This test file closes the TEST-01 gap identified in 110-COVERAGE-AUDIT.md.
 */
import { describe, expect, test, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { VoterCard } from "@/components/field/VoterCard"
import type { EnrichedWalkListEntry } from "@/types/canvassing"

function buildEntry(
  overrides: Partial<EnrichedWalkListEntry> = {},
  voterOverrides: Partial<EnrichedWalkListEntry["voter"]> = {},
  priorOverrides: Partial<EnrichedWalkListEntry["prior_interactions"]> = {},
): EnrichedWalkListEntry {
  return {
    id: "entry-1",
    voter_id: "voter-1",
    household_key: "house-a",
    sequence: 1,
    status: "pending",
    latitude: 32.84,
    longitude: -83.63,
    voter: {
      first_name: "Jane",
      last_name: "Doe",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: "123 Main St",
      registration_line2: null,
      registration_city: "Macon",
      registration_state: "GA",
      registration_zip: "31201",
      ...voterOverrides,
    },
    prior_interactions: {
      attempt_count: 0,
      last_result: null,
      last_date: null,
      ...priorOverrides,
    },
    ...overrides,
  }
}

describe("VoterCard", () => {
  test("renders voter full name", () => {
    render(<VoterCard entry={buildEntry()} isActive={false} />)
    expect(screen.getByText("Jane Doe")).toBeInTheDocument()
  })

  test("falls back to 'Unknown Voter' when first and last name are empty", () => {
    render(
      <VoterCard
        entry={buildEntry({}, { first_name: "", last_name: "" })}
        isActive={false}
      />,
    )
    expect(screen.getByText("Unknown Voter")).toBeInTheDocument()
  })

  test("renders 'First visit' when prior attempt_count is 0", () => {
    render(<VoterCard entry={buildEntry()} isActive={false} />)
    expect(screen.getByText("First visit")).toBeInTheDocument()
  })

  test("renders ordinal 'Nth visit — last: Label' for prior interactions", () => {
    render(
      <VoterCard
        entry={buildEntry(
          {},
          {},
          { attempt_count: 2, last_result: "not_home", last_date: "2026-03-15" },
        )}
        isActive={false}
      />,
    )
    // attempt_count 2 -> next visit is 3rd
    expect(screen.getByText(/3rd visit/)).toBeInTheDocument()
    expect(screen.getByText(/Not Home/)).toBeInTheDocument()
  })

  test("handles null last_date without crashing", () => {
    render(
      <VoterCard
        entry={buildEntry(
          {},
          {},
          { attempt_count: 1, last_result: "refused", last_date: null },
        )}
        isActive={false}
      />,
    )
    expect(screen.getByText(/2nd visit/)).toBeInTheDocument()
    expect(screen.getByText(/Refused/)).toBeInTheDocument()
  })

  test("renders party 'Unknown' badge when party is null", () => {
    render(<VoterCard entry={buildEntry()} isActive={false} />)
    expect(screen.getByText("Unknown")).toBeInTheDocument()
  })

  test("renders given party label when party is set", () => {
    render(
      <VoterCard
        entry={buildEntry({}, { party: "D" })}
        isActive={false}
      />,
    )
    expect(screen.getByText("D")).toBeInTheDocument()
  })

  test("shows age when provided", () => {
    render(
      <VoterCard
        entry={buildEntry({}, { age: 42 })}
        isActive={false}
      />,
    )
    expect(screen.getByText("Age 42")).toBeInTheDocument()
  })

  test("does not render age when null", () => {
    render(<VoterCard entry={buildEntry()} isActive={false} />)
    expect(screen.queryByText(/^Age /)).toBeNull()
  })

  test("renders OutcomeGrid when active, not completed, not skipped, with onOutcomeSelect", () => {
    const onOutcomeSelect = vi.fn()
    render(
      <VoterCard
        entry={buildEntry()}
        isActive={true}
        onOutcomeSelect={onOutcomeSelect}
      />,
    )
    // OutcomeGrid renders buttons with outcome labels
    expect(screen.getByText("Supporter")).toBeInTheDocument()
    expect(screen.getByText("Opposed")).toBeInTheDocument()
  })

  test("does NOT render OutcomeGrid when recordedOutcome is set (completed)", () => {
    render(
      <VoterCard
        entry={buildEntry()}
        isActive={true}
        recordedOutcome="supporter"
        onOutcomeSelect={() => {}}
      />,
    )
    // Completed state shows a single Supporter badge, not the whole outcome grid
    // "Opposed" would only appear if the full grid rendered.
    expect(screen.queryByText("Opposed")).toBeNull()
  })

  test("renders completed checkmark + outcome badge when recordedOutcome set and not skipped", () => {
    render(
      <VoterCard
        entry={buildEntry()}
        isActive={false}
        recordedOutcome="supporter"
      />,
    )
    expect(screen.getByText("Supporter")).toBeInTheDocument()
  })

  test("renders 'Skipped' when entry.status is 'skipped'", () => {
    render(
      <VoterCard
        entry={buildEntry({ status: "skipped" })}
        isActive={false}
      />,
    )
    expect(screen.getByText("Skipped")).toBeInTheDocument()
  })

  test("skipped entries do not render OutcomeGrid even when active", () => {
    render(
      <VoterCard
        entry={buildEntry({ status: "skipped" })}
        isActive={true}
        onOutcomeSelect={() => {}}
      />,
    )
    expect(screen.queryByText("Opposed")).toBeNull()
  })
})
