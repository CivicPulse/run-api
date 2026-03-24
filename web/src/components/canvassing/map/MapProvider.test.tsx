import { describe, it, beforeEach } from "vitest"
import { setupLeafletMocks } from "./__mocks__/leaflet"

beforeEach(() => {
  setupLeafletMocks()
})

describe("MapProvider", () => {
  it.todo("MAP-11: renders map container with default tile layer")
  it.todo("MAP-11: supports multiple tile layer options")
  it.todo("MAP-11: sets default center and zoom level")
})
