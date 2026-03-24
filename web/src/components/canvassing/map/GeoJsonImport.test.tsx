import { describe, it, beforeEach } from "vitest"
import { setupLeafletMocks } from "./__mocks__/leaflet"

beforeEach(() => {
  setupLeafletMocks()
})

describe("GeoJsonImport", () => {
  it.todo("MAP-06: accepts valid GeoJSON file upload")
  it.todo("MAP-06: rejects non-polygon GeoJSON geometries")
  it.todo("MAP-06: emits parsed boundary on successful import")
})
