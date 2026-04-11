import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import type React from "react"
import { VoterMarkerLayer } from "./VoterMarkerLayer"
import { voterIcon } from "./leafletIcons"
import type { VoterLocation } from "@/types/turf"

// Top-level vi.mock (hoisted) — replaces the previous setupLeafletMocks()
// helper so we can capture the props passed to each <Marker>. Mirrors the
// resolution 108-03 applied when extending CanvassingMap.test.tsx (see
// 108-03-SUMMARY.md "Auto-fixed Issues"): a shared non-capturing helper
// cannot coexist with a capturing mock in the same file.

type CapturedMarkerProps = {
  position?: [number, number]
  icon?: unknown
  children?: unknown
}
const capturedMarkerProps: CapturedMarkerProps[] = []

vi.mock("react-leaflet", async () => {
  const React = await import("react")
  const Marker = (props: CapturedMarkerProps) => {
    capturedMarkerProps.push(props)
    return React.createElement(
      "div",
      { "data-testid": "mock-marker" },
      (props.children as React.ReactNode) ?? null,
    )
  }
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => children,
    TileLayer: () => null,
    GeoJSON: () => null,
    Popup: ({ children }: { children: React.ReactNode }) => children,
    Marker,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
    useMap: vi.fn(),
  }
})

vi.mock("react-leaflet-cluster", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))

beforeEach(() => {
  capturedMarkerProps.length = 0
})

function makeVoter(overrides: Partial<VoterLocation> = {}): VoterLocation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    latitude: "latitude" in overrides ? (overrides.latitude as number | null) : 32.84,
    longitude: "longitude" in overrides ? (overrides.longitude as number | null) : -83.63,
    name: overrides.name ?? "Test Voter",
  }
}

describe("VoterMarkerLayer (MAP-01 / TEST-01)", () => {
  it("renders one Marker per valid voter with voterIcon", () => {
    const fixtures: VoterLocation[] = [
      makeVoter({ id: "v1", latitude: 32.84, longitude: -83.63, name: "Alice" }),
      makeVoter({ id: "v2", latitude: 32.85, longitude: -83.64, name: "Bob" }),
      makeVoter({ id: "v3", latitude: null, longitude: -83.65, name: "NullLat" }),
    ]

    render(<VoterMarkerLayer voters={fixtures} />)

    expect(capturedMarkerProps).toHaveLength(2)
    for (const props of capturedMarkerProps) {
      expect(props.icon).toBe(voterIcon)
    }
    expect(capturedMarkerProps[0].position).toEqual([
      fixtures[0].latitude,
      fixtures[0].longitude,
    ])
    expect(capturedMarkerProps[1].position).toEqual([
      fixtures[1].latitude,
      fixtures[1].longitude,
    ])
  })

  it("voterIcon bundles a non-unpkg asset (MAP-01 regression guard)", () => {
    const url = (voterIcon as unknown as { options: { iconUrl: string } })
      .options.iconUrl
    expect(url).toBeTruthy()
    expect(typeof url).toBe("string")
    expect(url).not.toMatch(/unpkg\.com/)
  })

  it("renders nothing when every voter has null coords", () => {
    const fixtures: VoterLocation[] = [
      makeVoter({ id: "n1", latitude: null, longitude: null, name: "A" }),
      makeVoter({ id: "n2", latitude: null, longitude: null, name: "B" }),
      makeVoter({ id: "n3", latitude: null, longitude: null, name: "C" }),
    ]

    const { container } = render(<VoterMarkerLayer voters={fixtures} />)

    expect(capturedMarkerProps).toHaveLength(0)
    expect(
      container.querySelectorAll('[data-testid="mock-marker"]'),
    ).toHaveLength(0)
  })
})
