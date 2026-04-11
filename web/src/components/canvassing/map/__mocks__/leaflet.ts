import { vi } from "vitest"
import type React from "react"

// Mock leaflet map and layer objects
export const mockMap = {
  setView: vi.fn().mockReturnThis(),
  fitBounds: vi.fn().mockReturnThis(),
  remove: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  pm: {
    addControls: vi.fn(),
    enableDraw: vi.fn(),
    disableDraw: vi.fn(),
  },
}

export const mockLayer = {
  toGeoJSON: vi.fn().mockReturnValue({
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
  }),
  getBounds: vi.fn().mockReturnValue({
    getNorthEast: vi.fn().mockReturnValue({ lat: 1, lng: 1 }),
    getSouthWest: vi.fn().mockReturnValue({ lat: 0, lng: 0 }),
  }),
  remove: vi.fn(),
  addTo: vi.fn(),
}

export function setupLeafletMocks() {
  vi.mock("leaflet", () => ({
    default: {
      Map: vi.fn(() => mockMap),
      map: vi.fn(() => mockMap),
      Icon: vi.fn(),
      DivIcon: vi.fn(),
      icon: vi.fn(),
      divIcon: vi.fn(),
      geoJSON: vi.fn(() => mockLayer),
      latLngBounds: vi.fn(() => ({
        extend: vi.fn().mockReturnThis(),
        isValid: vi.fn().mockReturnValue(true),
      })),
      Control: { extend: vi.fn(() => vi.fn()) },
      setOptions: vi.fn(),
      control: { layers: vi.fn() },
      tileLayer: vi.fn(),
    },
    Map: vi.fn(() => mockMap),
    Icon: vi.fn(),
    DivIcon: vi.fn(),
    geoJSON: vi.fn(() => mockLayer),
    latLngBounds: vi.fn(),
    Control: { extend: vi.fn(() => vi.fn()) },
    setOptions: vi.fn(),
  }))

  vi.mock("react-leaflet", () => ({
    MapContainer: ({ children }: { children: React.ReactNode }) => children,
    TileLayer: () => null,
    GeoJSON: () => null,
    Popup: ({ children }: { children: React.ReactNode }) => children,
    Marker: ({ children }: { children: React.ReactNode }) => children,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
    LayersControl: Object.assign(
      ({ children }: { children: React.ReactNode }) => children,
      {
        BaseLayer: ({ children }: { children: React.ReactNode }) => children,
      },
    ),
    useMap: vi.fn(() => mockMap),
  }))

  vi.mock("react-leaflet-cluster", () => ({
    default: ({ children }: { children: React.ReactNode }) => children,
  }))

  vi.mock("@react-leaflet/core", () => ({
    createControlComponent: vi.fn(() => () => null),
  }))

  vi.mock("@geoman-io/leaflet-geoman-free", () => ({}))
}
