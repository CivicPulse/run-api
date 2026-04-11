import MarkerClusterGroup from "react-leaflet-cluster"
import { Marker, Tooltip } from "react-leaflet"
import { voterIcon } from "./leafletIcons"
import type { VoterLocation } from "@/types/turf"

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
