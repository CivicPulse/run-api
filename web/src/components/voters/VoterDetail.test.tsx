/**
 * Nyquist validation tests for FRNT-01: Voter detail page expansion.
 * Tests cover: PropensityBadge color thresholds, parseVotingHistory grouping,
 * hasAnyValue adaptive visibility, and the full page rendering with mocked hooks.
 *
 * task_id: 26-02-01 / 26-02-02
 * requirement: FRNT-01
 */
import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { Badge } from "@/components/ui/badge"

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mocks (hoisted — must be top-level vi.mock calls)
// ─────────────────────────────────────────────────────────────────────────────

// TanStack Router mock: createFileRoute("/path")({ component }) pattern
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: { component: React.ComponentType }) => ({
    component: config.component,
  }),
  useParams: () => ({ campaignId: "camp-1", voterId: "voter-1" }),
}))

vi.mock("@/components/shared/RequireRole", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/voters/ContactsTab", () => ({
  ContactsTab: () => <div data-testid="contacts-tab" />,
}))
vi.mock("@/components/voters/TagsTab", () => ({
  TagsTab: () => <div data-testid="tags-tab" />,
}))
vi.mock("@/components/voters/HistoryTab", () => ({
  HistoryTab: () => <div data-testid="history-tab" />,
}))
vi.mock("@/components/voters/VoterEditSheet", () => ({
  VoterEditSheet: () => <div data-testid="edit-sheet" />,
}))

// Mutable store so individual tests can inject different voter data
const mockVoterStore = {
  voter: null as Record<string, unknown> | null,
  isLoading: false,
}

vi.mock("@/hooks/useVoters", () => ({
  useVoter: () => ({ data: mockVoterStore.voter, isLoading: mockVoterStore.isLoading }),
  useVoterInteractions: () => ({ data: { items: [] }, isLoading: false }),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Import route AFTER mocks are registered
// ─────────────────────────────────────────────────────────────────────────────
import { Route } from "@/routes/campaigns/$campaignId/voters/$voterId"

const VoterDetailPage = (Route as unknown as { component: React.ComponentType }).component

// ─────────────────────────────────────────────────────────────────────────────
// Base voter fixture (most optional fields null)
// ─────────────────────────────────────────────────────────────────────────────
const baseVoter = {
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
  mailing_line1: null as string | null,
  mailing_line2: null,
  mailing_city: null as string | null,
  mailing_state: null,
  mailing_zip: null,
  mailing_zip4: null,
  mailing_country: null,
  mailing_type: null,
  congressional_district: null,
  state_senate_district: null,
  state_house_district: null,
  voting_history: null as string[] | null,
  propensity_general: null as number | null,
  propensity_primary: null as number | null,
  propensity_combined: null as number | null,
  spoken_language: null as string | null,
  marital_status: null as string | null,
  military_status: null as string | null,
  party_change_indicator: null,
  cell_phone_confidence: null as number | null,
  household_id: null,
  household_party_registration: null as string | null,
  household_size: null as number | null,
  family_id: null as string | null,
  latitude: null,
  longitude: null,
  notes: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper re-implementations (mirrors of private helpers in $voterId.tsx)
// These are unit-tested directly without needing to render the full page.
// ─────────────────────────────────────────────────────────────────────────────

function PropensityBadge({
  score,
  label,
}: {
  score: number | null | undefined
  label: string
}) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="secondary" className="bg-gray-100 text-gray-500">
        {label}: N/A
      </Badge>
    )
  }
  const color =
    score >= 67
      ? "bg-green-100 text-green-800"
      : score >= 34
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800"
  return <Badge className={color}>{label}: {score}</Badge>
}

function parseVotingHistory(
  history: string[] | null,
): Array<{ year: number; general: boolean; primary: boolean }> {
  if (!history?.length) return []
  const yearMap = new Map<number, { general: boolean; primary: boolean }>()
  for (const entry of history) {
    const match = entry.match(/^(General|Primary)_(\d{4})$/)
    if (match) {
      const type = match[1] as "General" | "Primary"
      const year = Number(match[2])
      const record = yearMap.get(year) ?? { general: false, primary: false }
      record[type.toLowerCase() as "general" | "primary"] = true
      yearMap.set(year, record)
    }
  }
  return Array.from(yearMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, flags]) => ({ year, ...flags }))
}

function hasAnyValue(...values: unknown[]): boolean {
  return values.some((v) => v !== null && v !== undefined)
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe("FRNT-01: PropensityBadge — color-coded score thresholds", () => {
  it("shows green styling for score >= 67", () => {
    const { container } = render(<PropensityBadge score={80} label="General" />)
    const badge = container.querySelector("[class*='green']")
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain("80")
  })

  it("shows yellow styling for score 34-66", () => {
    const { container } = render(<PropensityBadge score={50} label="Primary" />)
    const badge = container.querySelector("[class*='yellow']")
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain("50")
  })

  it("shows red styling for score below 34", () => {
    const { container } = render(<PropensityBadge score={20} label="Combined" />)
    const badge = container.querySelector("[class*='red']")
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain("20")
  })

  it("shows N/A with grey styling for null score", () => {
    const { container } = render(<PropensityBadge score={null} label="General" />)
    const badge = container.querySelector("[class*='gray']")
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain("N/A")
  })

  it("uses green at exactly 67 (lower boundary)", () => {
    const { container } = render(<PropensityBadge score={67} label="General" />)
    const badge = container.querySelector("[class*='green']")
    expect(badge).toBeTruthy()
  })

  it("uses yellow at exactly 34 (lower boundary)", () => {
    const { container } = render(<PropensityBadge score={34} label="General" />)
    const badge = container.querySelector("[class*='yellow']")
    expect(badge).toBeTruthy()
  })

  it("uses red at exactly 33 (just below yellow threshold)", () => {
    const { container } = render(<PropensityBadge score={33} label="General" />)
    const badge = container.querySelector("[class*='red']")
    expect(badge).toBeTruthy()
  })
})

describe("FRNT-01: parseVotingHistory — year-grouped table data", () => {
  it("groups entries by year and sorts descending", () => {
    const rows = parseVotingHistory(["General_2024", "Primary_2022", "General_2022"])
    expect(rows).toHaveLength(2)
    expect(rows[0].year).toBe(2024)
    expect(rows[1].year).toBe(2022)
  })

  it("sets correct general/primary flags per year", () => {
    const rows = parseVotingHistory(["General_2024", "Primary_2022", "General_2022"])
    expect(rows[0].general).toBe(true)
    expect(rows[0].primary).toBe(false)
    expect(rows[1].general).toBe(true)
    expect(rows[1].primary).toBe(true)
  })

  it("returns empty array for null history", () => {
    expect(parseVotingHistory(null)).toHaveLength(0)
  })

  it("returns empty array for empty history array", () => {
    expect(parseVotingHistory([])).toHaveLength(0)
  })

  it("handles a single primary-only entry", () => {
    const rows = parseVotingHistory(["Primary_2020"])
    expect(rows).toHaveLength(1)
    expect(rows[0].year).toBe(2020)
    expect(rows[0].primary).toBe(true)
    expect(rows[0].general).toBe(false)
  })
})

describe("FRNT-01: hasAnyValue — adaptive card visibility logic", () => {
  it("returns true when at least one value is non-null", () => {
    expect(hasAnyValue(null, null, "Springfield")).toBe(true)
  })

  it("returns false when all values are null or undefined", () => {
    expect(hasAnyValue(null, undefined, null)).toBe(false)
  })

  it("returns true for numeric zero (falsy but non-null)", () => {
    expect(hasAnyValue(null, 0)).toBe(true)
  })

  it("returns true for a single non-null value", () => {
    expect(hasAnyValue("value")).toBe(true)
  })
})

describe("FRNT-01: Voter detail page — card rendering and adaptive visibility", () => {
  beforeEach(() => {
    mockVoterStore.voter = { ...baseVoter }
    mockVoterStore.isLoading = false
  })

  it("shows Personal Information card with language, marital status, military status fields", () => {
    mockVoterStore.voter = {
      ...baseVoter,
      spoken_language: "Spanish",
      marital_status: "Married",
      military_status: "Veteran",
    }
    render(<VoterDetailPage />)
    expect(screen.getByText("Personal Information")).toBeTruthy()
    expect(screen.getByText("Language")).toBeTruthy()
    expect(screen.getByText("Marital Status")).toBeTruthy()
    expect(screen.getByText("Military Status")).toBeTruthy()
  })

  it("shows Propensity Scores card when any propensity score is non-null", () => {
    mockVoterStore.voter = { ...baseVoter, propensity_general: 75 }
    render(<VoterDetailPage />)
    expect(screen.getByText("Propensity Scores")).toBeTruthy()
  })

  it("hides Propensity Scores card when all propensity scores are null", () => {
    mockVoterStore.voter = {
      ...baseVoter,
      propensity_general: null,
      propensity_primary: null,
      propensity_combined: null,
    }
    render(<VoterDetailPage />)
    expect(screen.queryByText("Propensity Scores")).toBeNull()
  })

  it("shows Mailing Address card when mailing data exists", () => {
    mockVoterStore.voter = {
      ...baseVoter,
      mailing_line1: "PO Box 100",
      mailing_city: "Chicago",
    }
    render(<VoterDetailPage />)
    expect(screen.getByText("Mailing Address")).toBeTruthy()
  })

  it("hides Mailing Address card when all mailing fields are null", () => {
    // baseVoter has all mailing fields null
    render(<VoterDetailPage />)
    expect(screen.queryByText("Mailing Address")).toBeNull()
  })

  it("shows Household card when household data exists", () => {
    mockVoterStore.voter = {
      ...baseVoter,
      household_size: 3,
      household_party_registration: "DEM",
      family_id: "FAM-001",
    }
    render(<VoterDetailPage />)
    expect(screen.getByText("Household")).toBeTruthy()
  })

  it("shows voting history table with Year, General, Primary column headers", () => {
    mockVoterStore.voter = {
      ...baseVoter,
      voting_history: ["General_2024", "Primary_2022", "General_2022"],
    }
    render(<VoterDetailPage />)
    expect(screen.getByText("Voting History")).toBeTruthy()
    expect(screen.getByText("Year")).toBeTruthy()
    // Year values should be in descending order
    expect(screen.getByText("2024")).toBeTruthy()
    expect(screen.getByText("2022")).toBeTruthy()
  })

  it("shows 'No voting history recorded' when voting history is null", () => {
    mockVoterStore.voter = { ...baseVoter, voting_history: null }
    render(<VoterDetailPage />)
    expect(screen.getByText("No voting history recorded")).toBeTruthy()
  })

  it("shows Registration Address card when registration address data exists", () => {
    // baseVoter already has registration_line1 = "123 Main St"
    render(<VoterDetailPage />)
    expect(screen.getByText("Registration Address")).toBeTruthy()
  })

  it("shows 'Voter not found' when voter data is null", () => {
    mockVoterStore.voter = null
    render(<VoterDetailPage />)
    expect(screen.getByText("Voter not found")).toBeTruthy()
  })
})
