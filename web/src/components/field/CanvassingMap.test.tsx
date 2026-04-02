import { beforeEach, describe, expect, test } from "vitest"
import { render, screen } from "@testing-library/react"
import { setupLeafletMocks } from "@/components/canvassing/map/__mocks__/leaflet"
import { CanvassingMap } from "@/components/field/CanvassingMap"
import type { Household } from "@/types/canvassing"

function makeHousehold(overrides: Partial<Household>): Household {
  const latitude = overrides.latitude === undefined ? 32.84 : overrides.latitude
  const longitude = overrides.longitude === undefined ? -83.63 : overrides.longitude
  const householdKey = overrides.householdKey ?? crypto.randomUUID()
  const sequence = overrides.sequence ?? 1

  return {
    householdKey,
    address: overrides.address ?? "123 Main St, Springfield, IL 62701",
    sequence,
    latitude,
    longitude,
    entries: overrides.entries ?? [
      {
        id: crypto.randomUUID(),
        voter_id: crypto.randomUUID(),
        household_key: householdKey,
        sequence,
        status: "pending",
        latitude,
        longitude,
        voter: {
          first_name: "Avery",
          last_name: "Walker",
          party: null,
          age: null,
          propensity_combined: null,
          registration_line1: "123 Main St",
          registration_line2: null,
          registration_city: "Springfield",
          registration_state: "IL",
          registration_zip: "62701",
        },
        prior_interactions: {
          attempt_count: 0,
          last_result: null,
          last_date: null,
        },
      },
    ],
  }
}

describe("CanvassingMap", () => {
  beforeEach(() => {
    setupLeafletMocks()
  })

  test("renders saved location, active household emphasis, and mapped-count summary", () => {
    render(
      <CanvassingMap
        households={[
          makeHousehold({ householdKey: "hh-1", address: "123 Main St", sequence: 1 }),
          makeHousehold({ householdKey: "hh-2", address: "456 Oak Ave", sequence: 2, latitude: 32.85, longitude: -83.62 }),
        ]}
        activeHouseholdKey="hh-2"
        locationStatus="ready"
        locationSnapshot={{ latitude: 32.841, longitude: -83.631 }}
      />,
    )

    expect(screen.getByText("Route map")).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === "2/2 mapped")).toBeInTheDocument()
    expect(screen.getByText(/saved location snapshot/i)).toBeInTheDocument()
    expect(screen.getByTestId("canvassing-map-container")).toHaveTextContent("Your saved location")
    expect(screen.getByTestId("canvassing-map-container")).toHaveTextContent("Current door: 456 Oak Ave")
    expect(screen.getByText("Saved location on map")).toBeInTheDocument()
    expect(screen.getByText("Current door highlighted")).toBeInTheDocument()
  })

  test("surfaces denied geolocation state without hiding usable mapped households", () => {
    render(
      <CanvassingMap
        households={[makeHousehold({ householdKey: "hh-1", address: "123 Main St" })]}
        activeHouseholdKey="hh-1"
        locationStatus="denied"
        locationSnapshot={null}
      />,
    )

    expect(screen.getByText(/permission was denied/i)).toBeInTheDocument()
    expect(screen.getByText(/sequence order and keep using door cards or google maps links/i)).toBeInTheDocument()
    expect(screen.getByText("Current door: 123 Main St")).toBeInTheDocument()
    expect(screen.getByText("Sequence order still available")).toBeInTheDocument()
  })

  test("surfaces unavailable geolocation state and keeps the route recoverable", () => {
    render(
      <CanvassingMap
        households={[makeHousehold({ householdKey: "hh-1", address: "123 Main St" })]}
        activeHouseholdKey="hh-1"
        locationStatus="unavailable"
        locationSnapshot={null}
      />,
    )

    expect(screen.getByText(/current location is unavailable right now/i)).toBeInTheDocument()
    expect(screen.getByText(/keep canvassing in sequence order/i)).toBeInTheDocument()
  })

  test("shows partial-coordinate coverage copy when only some households can be mapped", () => {
    render(
      <CanvassingMap
        households={[
          makeHousehold({ householdKey: "mapped", address: "123 Main St", sequence: 1 }),
          makeHousehold({ householdKey: "unmapped", address: "789 Pine Rd", sequence: 2, latitude: null, longitude: null }),
        ]}
        activeHouseholdKey="mapped"
        locationStatus="ready"
        locationSnapshot={{ latitude: 32.841, longitude: -83.631 }}
      />,
    )

    expect(screen.getByText((_, node) => node?.textContent === "1/2 mapped")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/missing coordinates/i)
    expect(screen.getByText(/only mapped doors appear on the in-app map/i)).toBeInTheDocument()
    expect(screen.getByTestId("canvassing-map-container")).toHaveTextContent("Current door: 123 Main St")
    expect(screen.getByTestId("canvassing-map-container")).not.toHaveTextContent("Current door: 789 Pine Rd")
  })

  test("renders a map fallback when zero households are mappable", () => {
    render(
      <CanvassingMap
        households={[
          makeHousehold({ householdKey: "hh-1", address: "123 Main St", latitude: null, longitude: null }),
        ]}
        activeHouseholdKey="hh-1"
        locationStatus="idle"
        locationSnapshot={null}
      />,
    )

    expect(screen.getByTestId("canvassing-map-fallback")).toBeInTheDocument()
    expect(screen.getByText(/map pins unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/does not have enough coordinate data/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /open current door in google maps/i })).toBeInTheDocument()
  })
})
