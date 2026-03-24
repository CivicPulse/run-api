import { describe, it, beforeEach } from "vitest"
import { setupLeafletMocks } from "./__mocks__/leaflet"

beforeEach(() => {
  setupLeafletMocks()
})

describe("OverlapHighlight", () => {
  it.todo("MAP-10: highlights overlapping turf boundaries in red")
  it.todo("MAP-10: shows overlap warning message with turf names")
  it.todo("MAP-10: clears highlights when boundary changes")
})
