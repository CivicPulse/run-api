import { useState, useEffect, useMemo, useCallback } from "react"
import { GeoJSON, Popup, useMap } from "react-leaflet"
import { Link } from "@tanstack/react-router"
import L from "leaflet"
import { MapProvider } from "./MapProvider"
import { VoterMarkerLayer } from "./VoterMarkerLayer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, MapIcon } from "lucide-react"
import { useTurfVoters } from "@/hooks/useTurfs"
import { resolveCssColor } from "@/lib/cssColor"
import type { TurfResponse } from "@/types/turf"

// Per D-05: Three distinct colors for turf status — reads CSS tokens as hex for Leaflet
function getTurfColors(status: string): { fill: string; stroke: string } {
  const key = status === "draft" || status === "active" || status === "completed" ? status : "default"
  return {
    fill: resolveCssColor(`--turf-${key}`) || resolveCssColor("--turf-default"),
    stroke: resolveCssColor(`--turf-${key}-stroke`) || resolveCssColor("--turf-default-stroke"),
  }
}

interface TurfOverviewMapProps {
  turfs: TurfResponse[]
  campaignId: string
}

function OverviewMapContent({
  turfs,
  campaignId,
}: TurfOverviewMapProps) {
  const map = useMap()
  const [selectedTurfId, setSelectedTurfId] = useState<string | null>(null)

  const selectedTurf = useMemo(
    () => turfs.find((t) => t.id === selectedTurfId) ?? null,
    [turfs, selectedTurfId],
  )

  const { data: voterData } = useTurfVoters(
    campaignId,
    selectedTurfId,
  )

  // Auto-fit bounds to all turfs on mount and when turfs change
  useEffect(() => {
    if (turfs.length === 0) return

    try {
      const allBounds = L.latLngBounds([])
      for (const turf of turfs) {
        const layer = L.geoJSON(turf.boundary as GeoJSON.GeoJsonObject)
        allBounds.extend(layer.getBounds())
      }
      if (allBounds.isValid()) {
        map.fitBounds(allBounds, { padding: [20, 20] })
      }
    } catch {
      // If boundary parsing fails, stay at default center
    }
  }, [turfs, map])

  // Memoize style map so GeoJSON layers don't get new objects each render
  const turfStyles = useMemo(
    () =>
      Object.fromEntries(
        turfs.map((turf) => {
          const colors = getTurfColors(turf.status)
          return [
            turf.id,
            { fillColor: colors.fill, color: colors.stroke, weight: 2, fillOpacity: 0.3 },
          ]
        }),
      ),
    [turfs],
  )

  return (
    <>
      {turfs.map((turf) => (
        <GeoJSON
          key={turf.id}
          data={turf.boundary as GeoJSON.GeoJsonObject}
          style={turfStyles[turf.id]}
          eventHandlers={{
            click: () => setSelectedTurfId(turf.id),
          }}
        />
      ))}

      {selectedTurf && (
        <Popup
          position={
            L.geoJSON(
              selectedTurf.boundary as GeoJSON.GeoJsonObject,
            )
              .getBounds()
              .getCenter()
          }
          eventHandlers={{
            remove: () => setSelectedTurfId(null),
          }}
        >
          <div className="space-y-2 min-w-[180px]">
            <p className="font-semibold text-sm">{selectedTurf.name}</p>
            <Badge variant="outline">{selectedTurf.status}</Badge>
            <p className="text-xs text-muted-foreground">
              {selectedTurf.voter_count} voter
              {selectedTurf.voter_count !== 1 ? "s" : ""}
            </p>
            <Button size="sm" asChild>
              <Link
                to={
                  `/campaigns/${campaignId}/canvassing/turfs/${selectedTurf.id}` as string
                }
              >
                View Details
              </Link>
            </Button>
          </div>
        </Popup>
      )}

      <VoterMarkerLayer voters={voterData ?? []} />
    </>
  )
}

export function TurfOverviewMap({ turfs, campaignId }: TurfOverviewMapProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (turfs.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-md font-medium">Map</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed((c) => !c)}
          className="md:hidden"
          aria-label={collapsed ? "Expand map" : "Collapse map"}
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <MapProvider className="h-64 md:h-96 w-full rounded-md border">
          <OverviewMapContent turfs={turfs} campaignId={campaignId} />
        </MapProvider>
      )}
    </section>
  )
}
