import { describe, it, expect } from "vitest"
import {
  formatPropensityChip,
  formatMultiSelectChip,
  CATEGORY_CLASSES,
  getFilterCategory,
  buildStaticChipDescriptors,
} from "./filterChipUtils"
import type { VoterFilter } from "@/types/voter"

// ─── formatPropensityChip ────────────────────────────────────────────────────

describe("formatPropensityChip", () => {
  it("returns null when both bounds are undefined (defaults)", () => {
    expect(formatPropensityChip("Gen.", undefined, undefined)).toBeNull()
  })

  it("returns null when both bounds are at defaults (min=0, max=100)", () => {
    expect(formatPropensityChip("Gen.", 0, 100)).toBeNull()
  })

  it("returns formatted label with both bounds", () => {
    expect(formatPropensityChip("Gen.", 50, 80)).toBe("Gen. Propensity: 50\u201380")
  })

  it("returns formatted label with min only (max undefined)", () => {
    expect(formatPropensityChip("Gen.", 50, undefined)).toBe("Gen. Propensity: 50\u2013")
  })

  it("returns formatted label with max only (min undefined)", () => {
    expect(formatPropensityChip("Gen.", undefined, 80)).toBe("Gen. Propensity: \u201380")
  })

  it("treats min=0 as default (returns max-only label)", () => {
    expect(formatPropensityChip("Pri.", 0, 80)).toBe("Pri. Propensity: \u201380")
  })
})

// ─── formatMultiSelectChip ───────────────────────────────────────────────────

describe("formatMultiSelectChip", () => {
  it("shows all values when count <= maxVisible (2 values)", () => {
    const result = formatMultiSelectChip("Ethnicity", ["Hispanic", "Black"])
    expect(result.display).toBe("Ethnicity: Hispanic, Black")
    expect(result.tooltip).toBeUndefined()
  })

  it("shows all values when count equals maxVisible (3 values, no truncation)", () => {
    const result = formatMultiSelectChip("Ethnicity", ["Hispanic", "Black", "Asian"])
    expect(result.display).toBe("Ethnicity: Hispanic, Black, Asian")
    expect(result.tooltip).toBeUndefined()
  })

  it("truncates with +N more and provides tooltip when count > maxVisible (5 values)", () => {
    const result = formatMultiSelectChip("Ethnicity", [
      "Hispanic",
      "Black",
      "Asian",
      "White",
      "Other",
    ])
    expect(result.display).toBe("Ethnicity: Hispanic, Black, Asian +2 more")
    expect(result.tooltip).toBe("Hispanic, Black, Asian, White, Other")
  })
})

// ─── CATEGORY_CLASSES ────────────────────────────────────────────────────────

describe("CATEGORY_CLASSES", () => {
  it("maps demographics to blue classes", () => {
    expect(CATEGORY_CLASSES.demographics).toContain("bg-blue-100")
    expect(CATEGORY_CLASSES.demographics).toContain("text-blue-800")
  })

  it("maps location to green classes", () => {
    expect(CATEGORY_CLASSES.location).toContain("bg-green-100")
    expect(CATEGORY_CLASSES.location).toContain("text-green-800")
  })

  it("maps scoring to amber classes", () => {
    expect(CATEGORY_CLASSES.scoring).toContain("bg-amber-100")
    expect(CATEGORY_CLASSES.scoring).toContain("text-amber-800")
  })

  it("maps voting to purple classes", () => {
    expect(CATEGORY_CLASSES.voting).toContain("bg-purple-100")
    expect(CATEGORY_CLASSES.voting).toContain("text-purple-800")
  })

  it("maps other to empty string", () => {
    expect(CATEGORY_CLASSES.other).toBe("")
  })
})

// ─── getFilterCategory ───────────────────────────────────────────────────────

describe("getFilterCategory", () => {
  it("classifies parties as demographics", () => {
    expect(getFilterCategory("parties")).toBe("demographics")
  })

  it("classifies registration_city as location", () => {
    expect(getFilterCategory("registration_city")).toBe("location")
  })

  it("classifies propensity_general_min as scoring", () => {
    expect(getFilterCategory("propensity_general_min")).toBe("scoring")
  })

  it("classifies voted_in as voting", () => {
    expect(getFilterCategory("voted_in")).toBe("voting")
  })

  it("classifies tags as other", () => {
    expect(getFilterCategory("tags")).toBe("other")
  })

  it("classifies mailing_city as location", () => {
    expect(getFilterCategory("mailing_city")).toBe("location")
  })
})

// ─── buildStaticChipDescriptors ──────────────────────────────────────────────

describe("buildStaticChipDescriptors", () => {
  it("returns correct descriptors for a sample filter", () => {
    const filter: VoterFilter = {
      parties: ["DEM", "REP"],
      gender: "F",
      propensity_general_min: 50,
      propensity_general_max: 80,
      registration_city: "Miami",
      mailing_city: "Orlando",
      voted_in: ["General_2020"],
      tags: ["canvassed"],
    }

    const chips = buildStaticChipDescriptors(filter)

    // Check ordering: demographics first, then scoring, location, voting, other
    const labels = chips.map((c) => c.label)
    expect(labels).toContain("Party: DEM, REP")
    expect(labels).toContain("Gender: F")
    expect(labels).toContain("Gen. Propensity: 50\u201380")
    expect(labels).toContain("City: Miami")
    expect(labels).toContain("Mail City: Orlando")
    expect(labels).toContain("Voted in: General_2020")
    expect(labels).toContain("Tags (all): 1")

    // Verify category ordering
    const partyIdx = labels.indexOf("Party: DEM, REP")
    const propIdx = labels.indexOf("Gen. Propensity: 50\u201380")
    const cityIdx = labels.indexOf("City: Miami")
    const votedIdx = labels.indexOf("Voted in: General_2020")
    const tagsIdx = labels.indexOf("Tags (all): 1")

    expect(partyIdx).toBeLessThan(propIdx) // demographics before scoring
    expect(propIdx).toBeLessThan(cityIdx) // scoring before location
    expect(cityIdx).toBeLessThan(votedIdx) // location before voting
    expect(votedIdx).toBeLessThan(tagsIdx) // voting before other
  })

  it("omits propensity chip when at defaults", () => {
    const filter: VoterFilter = {
      propensity_general_min: 0,
      propensity_general_max: 100,
    }
    const chips = buildStaticChipDescriptors(filter)
    expect(chips).toHaveLength(0)
  })

  it("uses mailing prefix for mailing address fields", () => {
    const filter: VoterFilter = {
      mailing_city: "Tampa",
      mailing_state: "FL",
      mailing_zip: "33601",
    }
    const chips = buildStaticChipDescriptors(filter)
    const labels = chips.map((c) => c.label)
    expect(labels).toContain("Mail City: Tampa")
    expect(labels).toContain("Mail State: FL")
    expect(labels).toContain("Mail Zip: 33601")
  })
})
