export interface CampaignIdentity {
  campaign_id?: string;
  id?: string;
  campaign_name?: string;
  name?: string;
}

const SEED_CAMPAIGN_NAME_PATTERNS = [
  /macon.?bibb/i,
  /E2E Test Campaign \(CAMP-01\)/i,
  /Admin Smoke Test Campaign/i,
];

export function getCampaignIdentity(
  campaign: CampaignIdentity,
): string | undefined {
  return campaign.campaign_id ?? campaign.id;
}

export function isSeedCampaignName(name: string): boolean {
  return SEED_CAMPAIGN_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function pickSeedCampaignId(
  campaigns: CampaignIdentity[],
): string | undefined {
  // Iterate patterns in priority order so Macon-Bibb always wins when present,
  // falling back to CAMP-01 / Admin Smoke only if the primary seed is absent.
  // Under parallel E2E load the campaigns list can contain several matching
  // entries (phase12 renames Macon-Bibb -> "E2E Test Campaign (CAMP-01)",
  // cross-cutting creates empty "E2E Test Campaign" rows) and picking the
  // first API-order match was picking an empty campaign and breaking
  // voter-dependent tests.
  for (const pattern of SEED_CAMPAIGN_NAME_PATTERNS) {
    const match = campaigns.find((campaign) =>
      pattern.test(campaign.campaign_name ?? campaign.name ?? ""),
    );
    if (match) {
      return getCampaignIdentity(match);
    }
  }

  if (campaigns.length === 1) {
    return getCampaignIdentity(campaigns[0]);
  }

  return undefined;
}
