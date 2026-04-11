import L from "leaflet"
import type { Marker as LeafletMarker } from "leaflet"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { Marker, Tooltip, useMap } from "react-leaflet"
import { AlertTriangle, LocateFixed, MapIcon, MapPin } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapProvider } from "@/components/canvassing/map/MapProvider"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
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

// Phase 108 Spike A2 — Converted from L.Icon to L.DivIcon so the marker root
// is a <div> that can host a ::before pseudo-element for the Contract 2b
// 44×44 hit-area expansion. Void <img> roots cannot host ::before, so the
// Contract 2b rule would silently fail without this conversion.
const householdIcon = new L.DivIcon({
  html: '<img src="/leaflet/marker-icon.png" srcset="/leaflet/marker-icon-2x.png 2x" width="25" height="41" alt="" />',
  className: "canvassing-map-household-marker",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const activeHouseholdIcon = new L.DivIcon({
  html: '<img src="/leaflet/marker-icon.png" srcset="/leaflet/marker-icon-2x.png 2x" width="30" height="49" alt="" />',
  className: "canvassing-map-household-marker canvassing-map-active-marker",
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
})

interface CanvassingMapProps {
  households: Household[]
  activeHouseholdKey?: string | null
  locationStatus: CanvassingLocationStatus
  locationSnapshot: CoordinatePoint | null
  onHouseholdSelect: (index: number) => void
}

interface InteractiveHouseholdMarkerProps {
  household: Household
  isActive: boolean
  onClick: (household: Household) => void
}

// Per Phase 108 Spike A1: Leaflet 1.9.4 routes Enter-key activation via the
// browser's role="button" synthetic click path, but does NOT handle Space.
// We attach a post-mount keydown listener that matches event.key === " " to
// close Contract 2c (Enter + Space activation).
function InteractiveHouseholdMarker({
  household,
  isActive,
  onClick,
}: InteractiveHouseholdMarkerProps) {
  const markerRef = useRef<LeafletMarker | null>(null)
  // WR-02: stash onClick in a ref so the keydown listener does not re-bind
  // every time the upstream `households` memo produces a fresh callback
  // identity (distance-sort memo churns on every geolocation tick).
  const onClickRef = useRef(onClick)
  useLayoutEffect(() => {
    onClickRef.current = onClick
  }, [onClick])

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    const el = marker.getElement()
    if (!el) return
    el.setAttribute("role", "button")
    el.setAttribute("aria-label", `Activate door: ${household.address}`)
    el.setAttribute("aria-pressed", isActive ? "true" : "false")
    el.setAttribute("tabindex", "0")

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault()
        onClickRef.current(household)
      }
    }
    el.addEventListener("keydown", handleKeyDown)
    return () => {
      el.removeEventListener("keydown", handleKeyDown)
    }
  }, [household, isActive])

  return (
    <Marker
      ref={markerRef}
      position={[household.latitude as number, household.longitude as number]}
      icon={isActive ? activeHouseholdIcon : householdIcon}
      zIndexOffset={isActive ? 1000 : 0}
      keyboard={true}
      eventHandlers={{
        click: () => onClick(household),
      }}
    >
      <Tooltip>
        {isActive ? `Current door: ${household.address}` : household.address}
      </Tooltip>
    </Marker>
  )
}

interface CanvassingMapMarkersProps {
  households: Household[]
  mappableHouseholds: Household[]
  activeHouseholdKey: string | null
  onHouseholdSelect: (index: number) => void
  volunteerLocation: CoordinatePoint | null
}

// Inner component so `useMap()` + `usePrefersReducedMotion()` resolve inside
// the MapProvider subtree (research Pitfall 4). Must be rendered as a child
// of <MapProvider>.
function CanvassingMapMarkers({
  households,
  mappableHouseholds,
  activeHouseholdKey,
  onHouseholdSelect,
  volunteerLocation,
}: CanvassingMapMarkersProps) {
  const map = useMap()
  const prefersReducedMotion = usePrefersReducedMotion()

  const handleMarkerClick = useCallback(
    (household: Household) => {
      // Resolve to the ORIGINAL households[] index (research Pitfall 3).
      // A loop counter would return the mappableHouseholds index, which
      // diverges whenever any household is missing coordinates.
      const index = households.findIndex(
        (h) => h.householdKey === household.householdKey,
      )
      if (index < 0) return

      onHouseholdSelect(index)
      map.panTo([household.latitude as number, household.longitude as number], {
        animate: !prefersReducedMotion,
        duration: 0.5,
      })
    },
    [households, onHouseholdSelect, map, prefersReducedMotion],
  )

  return (
    <>
      {volunteerLocation && (
        <Marker
          position={[volunteerLocation.latitude, volunteerLocation.longitude]}
          icon={volunteerIcon}
          keyboard={false}
          interactive={false}
        >
          <Tooltip>Your saved location</Tooltip>
        </Marker>
      )}
      {mappableHouseholds.map((household) => (
        <InteractiveHouseholdMarker
          key={household.householdKey}
          household={household}
          isActive={household.householdKey === activeHouseholdKey}
          onClick={handleMarkerClick}
        />
      ))}
    </>
  )
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
  onHouseholdSelect,
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
              <CanvassingMapMarkers
                households={households}
                mappableHouseholds={mappableHouseholds}
                activeHouseholdKey={activeHouseholdKey}
                onHouseholdSelect={onHouseholdSelect}
                volunteerLocation={volunteerLocation}
              />
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
