import { describe, it, beforeEach } from "vitest"
import { setupLeafletMocks } from "./__mocks__/leaflet"

beforeEach(() => {
  setupLeafletMocks()
})

describe("TurfOverviewMap", () => {
  it.todo("MAP-03: renders turf polygons with status-based colors")
  it.todo("MAP-03: shows popup with turf name and voter count on click")
  it.todo("MAP-03: fits map bounds to all turf boundaries")
})
