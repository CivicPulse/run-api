interface StatsBarProps {
  activeCampaignCount: number
  memberCount: number
}

export function StatsBar({ activeCampaignCount, memberCount }: StatsBarProps) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-sm text-muted-foreground">
        <span className="text-2xl font-bold text-foreground">{activeCampaignCount}</span>{" "}
        active campaigns{" "}
        <span className="mx-1">&middot;</span>{" "}
        <span className="text-2xl font-bold text-foreground">{memberCount}</span>{" "}
        members
      </p>
    </div>
  )
}
