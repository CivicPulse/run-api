import { createControlComponent } from "@react-leaflet/core"
import * as L from "leaflet"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"

interface GeomanOptions extends L.ControlOptions {
  position: L.ControlPosition
  drawPolygon?: boolean
  editMode?: boolean
  dragMode?: boolean
  removalMode?: boolean
}

const Geoman = L.Control.extend({
  options: {} as GeomanOptions,
  initialize(options: GeomanOptions) {
    L.setOptions(this, options)
  },
  addTo(map: L.Map) {
    if (!map.pm) return this
    map.pm.addControls({
      ...this.options,
      // Only polygon drawing and editing -- disable everything else
      drawMarker: false,
      drawCircle: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircleMarker: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    })
    return this
  },
})

export const GeomanControl = createControlComponent(
  (props: GeomanOptions) => new Geoman(props),
)
