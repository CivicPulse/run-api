import { describe, it, beforeEach } from "vitest"
import { setupLeafletMocks } from "./__mocks__/leaflet"

beforeEach(() => {
  setupLeafletMocks()
})

describe("TurfMapEditor", () => {
  it.todo("MAP-01: renders draw controls for polygon creation")
  it.todo("MAP-01: emits GeoJSON on polygon complete")
  it.todo("MAP-02: loads existing boundary for editing")
  it.todo("MAP-02: emits updated GeoJSON on edit complete")
  it.todo("MAP-07: exports turf boundary as GeoJSON file")
  it.todo("MAP-08: syncs boundary JSON with map drawing")
})
