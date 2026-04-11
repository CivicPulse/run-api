import { beforeEach, describe, expect, test, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { CanvassingMap } from "@/components/field/CanvassingMap"
import type { Household } from "@/types/canvassing"

// Top-level vi.mock calls are hoisted by Vitest's transformer, so the
// mocks below apply to the CanvassingMap import above even though they
// appear later in source order.
vi.mock("leaflet", () => ({
  default: {
    Icon: vi.fn(),
    DivIcon: vi.fn(),
  },
  Icon: vi.fn(),
  DivIcon: vi.fn(),
}))

// Module-level spies extended by the react-leaflet mock below, so tests can
// capture the props passed to each <Marker> and assert click wiring + panTo.
type CapturedMarkerProps = {
  position?: [number, number]
  eventHandlers?: { click?: () => void }
  icon?: unknown
  zIndexOffset?: number
  interactive?: boolean
  keyboard?: boolean
  children?: unknown
}
const capturedMarkerProps: CapturedMarkerProps[] = []
const panToSpy = vi.fn()

vi.mock("react-leaflet", async () => {
  const React = await import("react")
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => children,
    TileLayer: () => null,
    GeoJSON: () => null,
    Popup: ({ children }: { children: React.ReactNode }) => children,
    Marker: (props: CapturedMarkerProps) => {
      capturedMarkerProps.push(props)
      return (props.children as React.ReactNode) ?? null
    },
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
    LayersControl: Object.assign(
      ({ children }: { children: React.ReactNode }) => children,
      {
        BaseLayer: ({ children }: { children: React.ReactNode }) => children,
      },
    ),
    useMap: () => ({
      panTo: panToSpy,
      fitBounds: vi.fn(),
      setView: vi.fn(),
    }),
  }
})

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: vi.fn(() => false),
}))

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
    capturedMarkerProps.length = 0
    panToSpy.mockClear()
  })

  test("SELECT-02 — marker click invokes onHouseholdSelect with households[] index (not mappable index)", () => {
    const onHouseholdSelect = vi.fn()
    const households = [
      makeHousehold({ householdKey: "hh-a", address: "1 A St", sequence: 1, latitude: 32.84, longitude: -83.63 }),
      makeHousehold({ householdKey: "hh-b-unmapped", address: "2 B St", sequence: 2, latitude: null, longitude: null }),
      makeHousehold({ householdKey: "hh-c", address: "3 C St", sequence: 3, latitude: 32.85, longitude: -83.62 }),
    ]
    render(
      <CanvassingMap
        households={households}
        activeHouseholdKey="hh-a"
        locationStatus="idle"
        locationSnapshot={null}
        onHouseholdSelect={onHouseholdSelect}
      />,
    )

    const hhcMarker = capturedMarkerProps.find(
      (p) => p.position?.[0] === 32.85 && p.position?.[1] === -83.62,
    )
    expect(hhcMarker?.eventHandlers?.click).toBeTypeOf("function")
    hhcMarker!.eventHandlers!.click!()

    // CRITICAL (research Pitfall 3): must resolve to the ORIGINAL households[]
    // index (2 — the unmapped row is at index 1), NOT the mappableHouseholds
    // index (1).
    expect(onHouseholdSelect).toHaveBeenCalledWith(2)
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
        onHouseholdSelect={vi.fn()}
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
        onHouseholdSelect={vi.fn()}
      />,
    )

    expect(screen.getByText(/permission was denied/i)).toBeInTheDocument()
    expect(screen.getByText(/sequence order and keep using door cards or google maps links/i)).toBeInTheDocument()
    expect(screen.getByTestId("canvassing-map-container")).toHaveTextContent("Current door: 123 Main St")
    expect(screen.getByText("Sequence order still available")).toBeInTheDocument()
  })

  test("surfaces unavailable geolocation state and keeps the route recoverable", () => {
    render(
      <CanvassingMap
        households={[makeHousehold({ householdKey: "hh-1", address: "123 Main St" })]}
        activeHouseholdKey="hh-1"
        locationStatus="unavailable"
        locationSnapshot={null}
        onHouseholdSelect={vi.fn()}
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
        onHouseholdSelect={vi.fn()}
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
        onHouseholdSelect={vi.fn()}
      />,
    )

    expect(screen.getByTestId("canvassing-map-fallback")).toBeInTheDocument()
    expect(screen.getByText(/map pins unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/does not have enough coordinate data/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /open current door in google maps/i })).toBeInTheDocument()
  })

  test("SELECT-02 — marker click calls map.panTo with animate=true when motion is allowed", async () => {
    const { usePrefersReducedMotion } = await import("@/hooks/usePrefersReducedMotion")
    ;(usePrefersReducedMotion as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)

    render(
      <CanvassingMap
        households={[
          makeHousehold({ householdKey: "hh-1", sequence: 1, latitude: 32.84, longitude: -83.63 }),
          makeHousehold({ householdKey: "hh-2", sequence: 2, latitude: 32.85, longitude: -83.62 }),
        ]}
        activeHouseholdKey="hh-1"
        locationStatus="idle"
        locationSnapshot={null}
        onHouseholdSelect={vi.fn()}
      />,
    )

    const second = capturedMarkerProps.find(
      (p) => p.position?.[0] === 32.85 && p.position?.[1] === -83.62,
    )
    second?.eventHandlers?.click?.()

    expect(panToSpy).toHaveBeenCalledWith(
      [32.85, -83.62],
      expect.objectContaining({ animate: true, duration: 0.5 }),
    )
  })

  test("SELECT-02 — marker click calls map.panTo with animate=false under prefers-reduced-motion", async () => {
    const { usePrefersReducedMotion } = await import("@/hooks/usePrefersReducedMotion")
    ;(usePrefersReducedMotion as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true)

    render(
      <CanvassingMap
        households={[
          makeHousehold({ householdKey: "hh-1", sequence: 1, latitude: 32.84, longitude: -83.63 }),
          makeHousehold({ householdKey: "hh-2", sequence: 2, latitude: 32.85, longitude: -83.62 }),
        ]}
        activeHouseholdKey="hh-1"
        locationStatus="idle"
        locationSnapshot={null}
        onHouseholdSelect={vi.fn()}
      />,
    )

    const second = capturedMarkerProps.find(
      (p) => p.position?.[0] === 32.85 && p.position?.[1] === -83.62,
    )
    second?.eventHandlers?.click?.()

    expect(panToSpy).toHaveBeenCalledWith(
      [32.85, -83.62],
      expect.objectContaining({ animate: false, duration: 0.5 }),
    )

    // Restore default for subsequent tests
    ;(usePrefersReducedMotion as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
  })

  test("SELECT-02 — volunteer location marker is non-interactive (Contract 2c exclusion)", () => {
    render(
      <CanvassingMap
        households={[makeHousehold({ householdKey: "hh-1", latitude: 32.85, longitude: -83.62 })]}
        activeHouseholdKey="hh-1"
        locationStatus="ready"
        locationSnapshot={{ latitude: 32.841, longitude: -83.631 }}
        onHouseholdSelect={vi.fn()}
      />,
    )

    const volunteerMarker = capturedMarkerProps.find(
      (p) => p.position?.[0] === 32.841 && p.position?.[1] === -83.631,
    )
    expect(volunteerMarker).toBeDefined()
    expect(volunteerMarker?.interactive).toBe(false)
    expect(volunteerMarker?.keyboard).toBe(false)
    expect(volunteerMarker?.eventHandlers?.click).toBeUndefined()
  })

  test("SELECT-02 — active household marker gets zIndexOffset=1000 for visual emphasis", () => {
    render(
      <CanvassingMap
        households={[
          makeHousehold({ householdKey: "hh-1", sequence: 1, latitude: 32.84, longitude: -83.63 }),
          makeHousehold({ householdKey: "hh-2", sequence: 2, latitude: 32.85, longitude: -83.62 }),
        ]}
        activeHouseholdKey="hh-2"
        locationStatus="idle"
        locationSnapshot={null}
        onHouseholdSelect={vi.fn()}
      />,
    )

    const active = capturedMarkerProps.find(
      (p) => p.position?.[0] === 32.85 && p.position?.[1] === -83.62,
    )
    const idle = capturedMarkerProps.find(
      (p) => p.position?.[0] === 32.84 && p.position?.[1] === -83.63,
    )
    expect(active?.zIndexOffset).toBe(1000)
    expect(idle?.zIndexOffset).toBe(0)
  })
})
