import { MapContainer, TileLayer, LayersControl } from "react-leaflet"
import type { ReactNode } from "react"
import "leaflet/dist/leaflet.css"

// Per D-12: Street + satellite tile layers via Leaflet LayersControl
const STREET_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
const STREET_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const SATELLITE_ATTR = "Tiles &copy; Esri"

// Default center: Macon, GA (seed data location)
const DEFAULT_CENTER: [number, number] = [32.8407, -83.6324]
const DEFAULT_ZOOM = 12

interface MapProviderProps {
  children: ReactNode
  center?: [number, number]
  zoom?: number
  className?: string
}

export function MapProvider({
  children,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  className = "h-64 md:h-96 w-full rounded-md border",
}: MapProviderProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={className}
      scrollWheelZoom={true}
      role="application"
      aria-label="Interactive map"
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Street">
          <TileLayer url={STREET_TILES} attribution={STREET_ATTR} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer url={SATELLITE_TILES} attribution={SATELLITE_ATTR} />
        </LayersControl.BaseLayer>
      </LayersControl>
      {children}
    </MapContainer>
  )
}
