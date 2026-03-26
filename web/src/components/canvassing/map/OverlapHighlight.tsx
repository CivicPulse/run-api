import { useMemo } from "react"
import { GeoJSON } from "react-leaflet"
import { resolveCssColor } from "@/lib/cssColor"
import type { OverlappingTurf } from "@/types/turf"

interface OverlapHighlightProps {
  overlaps: OverlappingTurf[]
}

export function OverlapHighlight({ overlaps }: OverlapHighlightProps) {
  const overlapStyle = useMemo(
    () => ({
      fillColor: resolveCssColor("--overlap-fill"),
      color: resolveCssColor("--overlap-stroke"),
      weight: 2,
      fillOpacity: 0.3,
      dashArray: "5 5",
    }),
    [],
  )

  if (overlaps.length === 0) return null

  return (
    <>
      {overlaps.map((turf) => (
        <GeoJSON
          key={turf.id}
          data={turf.boundary as unknown as GeoJSON.GeoJsonObject}
          style={overlapStyle}
        />
      ))}
    </>
  )
}
