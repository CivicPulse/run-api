import MarkerClusterGroup from "react-leaflet-cluster"
import { Marker, Tooltip } from "react-leaflet"
import L from "leaflet"
import type { VoterLocation } from "@/types/turf"

// Fix default marker icon issue with Leaflet + bundlers
const voterIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface VoterMarkerLayerProps {
  voters: VoterLocation[]
  isLoading?: boolean
}

export function VoterMarkerLayer({ voters }: VoterMarkerLayerProps) {
  const validVoters = voters.filter(
    (v) => v.latitude != null && v.longitude != null,
  )

  if (validVoters.length === 0) return null

  return (
    <MarkerClusterGroup chunkedLoading disableClusteringAtZoom={17}>
      {validVoters.map((voter) => (
        <Marker
          key={voter.id}
          position={[voter.latitude!, voter.longitude!]}
          icon={voterIcon}
        >
          <Tooltip>{voter.name || "Unknown"}</Tooltip>
        </Marker>
      ))}
    </MarkerClusterGroup>
  )
}
