import { describe, it, expect, vi } from "vitest"

// Mock the PNG asset imports so Vitest doesn't try to resolve binary files.
vi.mock("leaflet/dist/images/marker-icon.png", () => ({
  default: "/mocked/marker-icon.png",
}))
vi.mock("leaflet/dist/images/marker-icon-2x.png", () => ({
  default: "/mocked/marker-icon-2x.png",
}))
vi.mock("leaflet/dist/images/marker-shadow.png", () => ({
  default: "/mocked/marker-shadow.png",
}))

// Mock leaflet with Icon and DivIcon classes that stash options on the instance
// so the tests can assert against `.options` directly.
vi.mock("leaflet", () => {
  class Icon {
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) {
      this.options = options
    }
  }
  class DivIcon {
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) {
      this.options = options
    }
  }
  return { default: { Icon, DivIcon }, Icon, DivIcon }
})

import {
  voterIcon,
  volunteerIcon,
  householdIcon,
  activeHouseholdIcon,
} from "./leafletIcons"

describe("leafletIcons (MAP-01)", () => {
  it("voterIcon.options.iconUrl is truthy and not an unpkg URL", () => {
    const url = (voterIcon as unknown as { options: { iconUrl: string } })
      .options.iconUrl
    expect(url).toBeTruthy()
    expect(url).not.toMatch(/unpkg\.com/)
  })

  it("voterIcon.options.iconRetinaUrl is truthy and not an unpkg URL", () => {
    const url = (voterIcon as unknown as { options: { iconRetinaUrl: string } })
      .options.iconRetinaUrl
    expect(url).toBeTruthy()
    expect(url).not.toMatch(/unpkg\.com/)
  })

  it("voterIcon.options.shadowUrl is truthy and not an unpkg URL", () => {
    const url = (voterIcon as unknown as { options: { shadowUrl: string } })
      .options.shadowUrl
    expect(url).toBeTruthy()
    expect(url).not.toMatch(/unpkg\.com/)
  })

  it("volunteerIcon.options.iconUrl is truthy", () => {
    const url = (volunteerIcon as unknown as { options: { iconUrl: string } })
      .options.iconUrl
    expect(url).toBeTruthy()
  })

  it("householdIcon.options.html contains <img and src=", () => {
    const html = (householdIcon as unknown as { options: { html: string } })
      .options.html
    expect(html).toBeTruthy()
    expect(html).toContain("<img")
    expect(html).toContain("src=")
  })

  it("activeHouseholdIcon.options.html contains canvassing-map-active-marker className", () => {
    const opts = (
      activeHouseholdIcon as unknown as {
        options: { html: string; className: string }
      }
    ).options
    expect(opts.html).toBeTruthy()
    expect(opts.className).toContain("canvassing-map-active-marker")
  })

  it("householdIcon.options.className === 'canvassing-map-household-marker'", () => {
    const className = (
      householdIcon as unknown as { options: { className: string } }
    ).options.className
    expect(className).toBe("canvassing-map-household-marker")
  })

  it("activeHouseholdIcon.options.className contains 'canvassing-map-active-marker'", () => {
    const className = (
      activeHouseholdIcon as unknown as { options: { className: string } }
    ).options.className
    expect(className).toContain("canvassing-map-active-marker")
  })
})

describe("leafletIcons integration regression guards (TEST-02)", () => {
  it("every icon's asset paths come from bundled modules (no remote URLs)", () => {
    const urls: string[] = []
    const v = voterIcon as unknown as {
      options: { iconUrl: string; iconRetinaUrl: string; shadowUrl: string }
    }
    urls.push(v.options.iconUrl, v.options.iconRetinaUrl, v.options.shadowUrl)
    const vo = volunteerIcon as unknown as {
      options: { iconUrl: string; iconRetinaUrl: string; shadowUrl: string }
    }
    urls.push(vo.options.iconUrl, vo.options.iconRetinaUrl, vo.options.shadowUrl)

    // Household + active household use DivIcon with an inline <img src=...>.
    const hh = householdIcon as unknown as { options: { html: string } }
    const ah = activeHouseholdIcon as unknown as { options: { html: string } }
    const srcRe = /src="([^"]+)"/g
    for (const html of [hh.options.html, ah.options.html]) {
      for (const match of html.matchAll(srcRe)) {
        urls.push(match[1])
      }
      // srcset may also contain URLs
      const srcsetRe = /srcset="([^"]+)"/g
      for (const match of html.matchAll(srcsetRe)) {
        for (const part of match[1].split(",")) {
          urls.push(part.trim().split(/\s+/)[0])
        }
      }
    }

    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url).toBeTruthy()
      expect(url).not.toMatch(/^https?:\/\//)
      expect(url).not.toMatch(/^\/\//)
      expect(url).not.toMatch(/unpkg\.com/)
      expect(url).not.toMatch(/cdn\./)
    }
  })

  it("voterIcon and volunteerIcon share the same bundled marker-icon asset URL", () => {
    const v = voterIcon as unknown as { options: { iconUrl: string } }
    const vo = volunteerIcon as unknown as { options: { iconUrl: string } }
    expect(v.options.iconUrl).toBe(vo.options.iconUrl)
  })
})

