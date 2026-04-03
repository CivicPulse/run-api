import { describe, expect, it } from "vitest"

import { pickSeedCampaignId } from "./seed-campaign"

describe("pickSeedCampaignId", () => {
  it("prefers known seed campaign names", () => {
    expect(
      pickSeedCampaignId([
        { campaign_id: "other-1", campaign_name: "Neighborhood Outreach" },
        { campaign_id: "seed-1", campaign_name: "Macon-Bibb Demo Campaign" },
      ]),
    ).toBe("seed-1")

    expect(
      pickSeedCampaignId([
        { campaign_id: "seed-2", campaign_name: "Admin Smoke Test Campaign" },
      ]),
    ).toBe("seed-2")
  })

  it("falls back to the only accessible campaign when names drift", () => {
    expect(
      pickSeedCampaignId([
        { campaign_id: "only-1", campaign_name: "Freshly Seeded Campaign" },
      ]),
    ).toBe("only-1")
  })

  it("returns undefined when multiple campaigns exist and none match known names", () => {
    expect(
      pickSeedCampaignId([
        { campaign_id: "camp-1", campaign_name: "Neighborhood Outreach" },
        { campaign_id: "camp-2", campaign_name: "Volunteer Pipeline" },
      ]),
    ).toBeUndefined()
  })
})
