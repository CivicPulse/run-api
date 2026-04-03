export interface CampaignIdentity {
  campaign_id?: string
  id?: string
  campaign_name?: string
  name?: string
}

const SEED_CAMPAIGN_NAME_PATTERNS = [
  /macon.?bibb/i,
  /E2E Test Campaign \(CAMP-01\)/i,
  /Admin Smoke Test Campaign/i,
]

export function getCampaignIdentity(campaign: CampaignIdentity): string | undefined {
  return campaign.campaign_id ?? campaign.id
}

export function isSeedCampaignName(name: string): boolean {
  return SEED_CAMPAIGN_NAME_PATTERNS.some((pattern) => pattern.test(name))
}

export function pickSeedCampaignId(campaigns: CampaignIdentity[]): string | undefined {
  const namedMatch = campaigns.find((campaign) =>
    isSeedCampaignName(campaign.campaign_name ?? campaign.name ?? ""),
  )
  if (namedMatch) {
    return getCampaignIdentity(namedMatch)
  }

  if (campaigns.length === 1) {
    return getCampaignIdentity(campaigns[0])
  }

  return undefined
}
