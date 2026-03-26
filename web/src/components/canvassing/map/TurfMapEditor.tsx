import { useEffect, useRef, useCallback } from "react"
import { useMap } from "react-leaflet"
import * as L from "leaflet"
import { MapProvider } from "./MapProvider"
import { GeomanControl } from "./GeomanControl"
import { OverlapHighlight } from "./OverlapHighlight"
import type { OverlappingTurf } from "@/types/turf"

interface TurfMapEditorProps {
  value: string // GeoJSON string from form field
  onChange: (value: string) => void // Update form field
  defaultBoundary?: Record<string, unknown> // Existing boundary for edit mode
  searchCenter?: { lat: number; lng: number } | null // from AddressSearch
  overlaps?: OverlappingTurf[] // from useTurfOverlaps
}

function MapEditor({
  value,
  onChange,
  defaultBoundary,
  searchCenter,
  overlaps,
}: TurfMapEditorProps) {
  const map = useMap()
  const editLayerRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  const syncFromMapRef = useRef(false)
  const initializedRef = useRef(false)

  // Add the edit layer group to the map on mount
  useEffect(() => {
    const fg = editLayerRef.current
    fg.addTo(map)
    return () => {
      fg.remove()
    }
  }, [map])

  // Render existing boundary on mount (edit mode)
  useEffect(() => {
    if (!defaultBoundary || initializedRef.current) return
    initializedRef.current = true

    try {
      const layer = L.geoJSON(defaultBoundary as unknown as GeoJSON.GeoJsonObject)
      const fg = editLayerRef.current

      layer.eachLayer((l) => {
        fg.addLayer(l)
        // Enable editing on the layer
        if ("pm" in l && typeof (l as L.Layer & { pm: { enable: () => void } }).pm?.enable === "function") {
          ;(l as L.Layer & { pm: { enable: () => void } }).pm.enable()
        }
      })

      // Fit map to the boundary
      const bounds = fg.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] })
      }
    } catch {
      // Invalid GeoJSON in defaultBoundary, ignore
    }
  }, [map, defaultBoundary])

  // Pan/zoom map when address search result arrives
  useEffect(() => {
    if (!searchCenter) return
    map.setView([searchCenter.lat, searchCenter.lng], 16)
  }, [map, searchCenter])

  // Extract geometry from a layer and call onChange
  const updateFromLayer = useCallback(
    (layer: L.Layer) => {
      syncFromMapRef.current = true
      const geojson = (layer as L.Polygon).toGeoJSON()
      onChange(JSON.stringify(geojson.geometry, null, 2))
      // Reset sync flag after a tick to allow the value useEffect to skip
      setTimeout(() => {
        syncFromMapRef.current = false
      }, 0)
    },
    [onChange],
  )

  // Listen for Geoman draw/edit/remove events
  useEffect(() => {
    const handleCreate = (e: { layer: L.Layer }) => {
      const fg = editLayerRef.current
      // Only allow one polygon at a time -- clear previous
      fg.clearLayers()
      fg.addLayer(e.layer)
      updateFromLayer(e.layer)
    }

    const handleEdit = (e: { layer: L.Layer }) => {
      updateFromLayer(e.layer)
    }

    const handleRemove = () => {
      syncFromMapRef.current = true
      onChange("")
      setTimeout(() => {
        syncFromMapRef.current = false
      }, 0)
    }

    map.on("pm:create", handleCreate)
    map.on("pm:edit", handleEdit)
    map.on("pm:remove", handleRemove)

    return () => {
      map.off("pm:create", handleCreate)
      map.off("pm:edit", handleEdit)
      map.off("pm:remove", handleRemove)
    }
  }, [map, onChange, updateFromLayer])

  // Sync from JSON textarea -> map (bidirectional sync for Advanced toggle)
  useEffect(() => {
    // Skip if this update originated from the map itself
    if (syncFromMapRef.current) return
    // Skip empty values
    if (!value) return

    try {
      const parsed = JSON.parse(value) as GeoJSON.GeoJsonObject
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("type" in parsed) ||
        parsed.type !== "Polygon"
      ) {
        return
      }

      const fg = editLayerRef.current
      fg.clearLayers()

      const layer = L.geoJSON(parsed)
      layer.eachLayer((l) => {
        fg.addLayer(l)
        if ("pm" in l && typeof (l as L.Layer & { pm: { enable: () => void } }).pm?.enable === "function") {
          ;(l as L.Layer & { pm: { enable: () => void } }).pm.enable()
        }
      })

      const bounds = fg.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] })
      }
    } catch {
      // Invalid JSON, ignore -- user is still typing
    }
  }, [value, map])

  return (
    <>
      <GeomanControl
        position="topleft"
        drawPolygon
        editMode
        dragMode
        removalMode
      />
      <OverlapHighlight overlaps={overlaps ?? []} />
    </>
  )
}

export function TurfMapEditor(props: TurfMapEditorProps) {
  return (
    <MapProvider>
      <MapEditor {...props} />
    </MapProvider>
  )
}
