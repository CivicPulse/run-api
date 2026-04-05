import L from "leaflet"
import { useMemo } from "react"
import { Marker, Tooltip } from "react-leaflet"
import { AlertTriangle, LocateFixed, MapIcon, MapPin } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapProvider } from "@/components/canvassing/map/MapProvider"
import {
  getGoogleMapsUrl,
  hasAddress,
  isMappableHousehold,
  isValidCoordinatePoint,
  type CoordinatePoint,
  type Household,
} from "@/types/canvassing"
import type { CanvassingLocationStatus } from "@/stores/canvassingStore"

const volunteerIcon = new L.Icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const activeHouseholdIcon = new L.Icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "canvassing-map-active-marker",
})

const householdIcon = new L.Icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface CanvassingMapProps {
  households: Household[]
  activeHouseholdKey?: string | null
  locationStatus: CanvassingLocationStatus
  locationSnapshot: CoordinatePoint | null
}

function getGeolocationCopy(locationStatus: CanvassingLocationStatus): string {
  switch (locationStatus) {
    case "denied":
      return "Location permission was denied. You can stay in sequence order and keep using door cards or Google Maps links."
    case "unavailable":
      return "Current location is unavailable right now. Keep canvassing in sequence order or use Google Maps links for each household."
    case "ready":
      return "Showing your saved location snapshot for this route. Distance order stays frozen until you capture a new location."
    case "idle":
    default:
      return "Capture your location when you want a distance-aware order. Until then, the walk list stays in sequence order."
  }
}

export function CanvassingMap({
  households,
  activeHouseholdKey = null,
  locationStatus,
  locationSnapshot,
}: CanvassingMapProps) {
  const volunteerLocation = isValidCoordinatePoint(locationSnapshot)
    ? locationSnapshot
    : null

  const mappableHouseholds = useMemo(
    () => households.filter(isMappableHousehold),
    [households],
  )
  const unmappedCount = households.length - mappableHouseholds.length
  const activeHousehold =
    households.find((household) => household.householdKey === activeHouseholdKey) ?? null
  const activeMappableHousehold =
    mappableHouseholds.find((household) => household.householdKey === activeHouseholdKey) ?? null

  const mapCenter: [number, number] | undefined = volunteerLocation
    ? [volunteerLocation.latitude, volunteerLocation.longitude]
    : activeMappableHousehold
      ? [activeMappableHousehold.latitude, activeMappableHousehold.longitude]
      : mappableHouseholds[0]
        ? [mappableHouseholds[0].latitude, mappableHouseholds[0].longitude]
        : undefined

  const hasMapMarkers = mappableHouseholds.length > 0
  const geolocationCopy = getGeolocationCopy(locationStatus)

  return (
    <section className="space-y-3" aria-labelledby="canvassing-map-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-muted-foreground" />
          <h2 id="canvassing-map-title" className="text-md font-medium">
            Route map
          </h2>
        </div>
        <Badge variant="outline">
          {mappableHouseholds.length}/{households.length} mapped
        </Badge>
      </div>

      <Card className="p-3 space-y-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <LocateFixed className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{geolocationCopy}</p>
        </div>

        {unmappedCount > 0 && (
          <div
            className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            role="status"
          >
            {unmappedCount === households.length
              ? "No household coordinates are available yet, so the in-app map is hidden. Keep canvassing from the door list and use external navigation links when needed."
              : `${unmappedCount} household${unmappedCount === 1 ? "" : "s"} ${unmappedCount === 1 ? "is" : "are"} missing coordinates, so only mapped doors appear on the in-app map. Unmapped doors stay available in sequence order and via Google Maps links.`}
          </div>
        )}

        {!hasMapMarkers ? (
          <div
            className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-4 py-6 text-center"
            data-testid="canvassing-map-fallback"
          >
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">Map pins unavailable</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This walk list does not have enough coordinate data to draw household markers yet.
            </p>
            {activeHousehold && hasAddress(activeHousehold.entries[0].voter) && (
              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={getGoogleMapsUrl(activeHousehold.entries[0].voter)}
                rel="noreferrer"
                target="_blank"
              >
                <MapPin className="h-4 w-4" />
                Open current door in Google Maps
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-2" data-testid="canvassing-map-container">
            <MapProvider
              center={mapCenter}
              className="h-64 md:h-96 w-full rounded-md border"
            >
              {volunteerLocation && (
                <Marker
                  position={[volunteerLocation.latitude, volunteerLocation.longitude]}
                  icon={volunteerIcon}
                >
                  <Tooltip>Your saved location</Tooltip>
                </Marker>
              )}

              {mappableHouseholds.map((household) => {
                const isActive = household.householdKey === activeHouseholdKey

                return (
                  <Marker
                    key={household.householdKey}
                    position={[household.latitude, household.longitude]}
                    icon={isActive ? activeHouseholdIcon : householdIcon}
                  >
                    <Tooltip>
                      {isActive
                        ? `Current door: ${household.address}`
                        : household.address}
                    </Tooltip>
                  </Marker>
                )
              })}
            </MapProvider>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {volunteerLocation && <Badge variant="secondary">Saved location on map</Badge>}
              {activeMappableHousehold && <Badge variant="secondary">Current door highlighted</Badge>}
              {!volunteerLocation && (
                <Badge variant="outline">Sequence order still available</Badge>
              )}
            </div>

            {activeMappableHousehold && (
              <p className="text-xs text-muted-foreground">
                Current door: {activeMappableHousehold.address}
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}
