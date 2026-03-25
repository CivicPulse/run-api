import { GeoJSON } from "react-leaflet"
import type { OverlappingTurf } from "@/types/turf"

interface OverlapHighlightProps {
  overlaps: OverlappingTurf[]
}

const OVERLAP_STYLE = {
  fillColor: "#ef4444", // red-500
  color: "#dc2626", // red-600
  weight: 2,
  fillOpacity: 0.3,
  dashArray: "5 5",
}

export function OverlapHighlight({ overlaps }: OverlapHighlightProps) {
  if (overlaps.length === 0) return null

  return (
    <>
      {overlaps.map((turf) => (
        <GeoJSON
          key={turf.id}
          data={turf.boundary as GeoJSON.GeoJsonObject}
          style={OVERLAP_STYLE}
        />
      ))}
    </>
  )
}
