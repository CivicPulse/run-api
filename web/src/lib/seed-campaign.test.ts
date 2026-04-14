import { describe, expect, it } from "vitest";

import { pickSeedCampaignId } from "./seed-campaign";

describe("pickSeedCampaignId", () => {
  it("prefers known seed campaign names", () => {
    expect(
      pickSeedCampaignId([
        { campaign_id: "other-1", campaign_name: "Neighborhood Outreach" },
        { campaign_id: "seed-1", campaign_name: "Macon-Bibb Demo Campaign" },
      ]),
    ).toBe("seed-1");

    expect(
      pickSeedCampaignId([
        { campaign_id: "seed-2", campaign_name: "Admin Smoke Test Campaign" },
      ]),
    ).toBe("seed-2");
  });

  it("prefers Macon-Bibb over CAMP-01 when both are present (parallel pollution)", () => {
    // Under parallel E2E load, phase12-settings-verify renames Macon-Bibb to
    // "E2E Test Campaign (CAMP-01)" and cross-cutting can create extra
    // "E2E Test Campaign" rows. Picking the API-order first match was
    // selecting an empty CAMP-01 and breaking voter-dependent tests.
    expect(
      pickSeedCampaignId([
        {
          campaign_id: "camp-01",
          campaign_name: "E2E Test Campaign (CAMP-01)",
        },
        {
          campaign_id: "macon-bibb",
          campaign_name: "Macon-Bibb Demo Campaign",
        },
      ]),
    ).toBe("macon-bibb");
  });

  it("falls back to the only accessible campaign when names drift", () => {
    expect(
      pickSeedCampaignId([
        { campaign_id: "only-1", campaign_name: "Freshly Seeded Campaign" },
      ]),
    ).toBe("only-1");
  });

  it("returns undefined when multiple campaigns exist and none match known names", () => {
    expect(
      pickSeedCampaignId([
        { campaign_id: "camp-1", campaign_name: "Neighborhood Outreach" },
        { campaign_id: "camp-2", campaign_name: "Volunteer Pipeline" },
      ]),
    ).toBeUndefined();
  });
});
