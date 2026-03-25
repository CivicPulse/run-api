import { GeoJSON } from "react-leaflet"
import { resolveCssColor } from "@/lib/cssColor"
import type { OverlappingTurf } from "@/types/turf"

interface OverlapHighlightProps {
  overlaps: OverlappingTurf[]
}

function getOverlapStyle() {
  return {
    fillColor: resolveCssColor("--overlap-fill"),
    color: resolveCssColor("--overlap-stroke"),
    weight: 2,
    fillOpacity: 0.3,
    dashArray: "5 5",
  }
}

export function OverlapHighlight({ overlaps }: OverlapHighlightProps) {
  if (overlaps.length === 0) return null

  const overlapStyle = getOverlapStyle()

  return (
    <>
      {overlaps.map((turf) => (
        <GeoJSON
          key={turf.id}
          data={turf.boundary as GeoJSON.GeoJsonObject}
          style={overlapStyle}
        />
      ))}
    </>
  )
}
