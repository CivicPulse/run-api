import { describe, it, beforeEach } from "vitest"
import { setupLeafletMocks } from "./__mocks__/leaflet"

beforeEach(() => {
  setupLeafletMocks()
})

describe("VoterMarkerLayer", () => {
  it.todo("MAP-04: renders clustered voter markers within turf")
  it.todo("MAP-04: shows voter name in marker tooltip")
  it.todo("MAP-04: handles voters with null coordinates gracefully")
})
