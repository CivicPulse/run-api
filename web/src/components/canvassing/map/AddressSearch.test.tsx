import { describe, it, beforeEach } from "vitest"
import { setupLeafletMocks } from "./__mocks__/leaflet"

beforeEach(() => {
  setupLeafletMocks()
})

describe("AddressSearch", () => {
  it.todo("MAP-09: renders search input with debounced query")
  it.todo("MAP-09: displays Nominatim results in dropdown")
  it.todo("MAP-09: pans map to selected result coordinates")
})
