import { useState } from "react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useCampaignTags } from "@/hooks/useVoterTags"
import { useParams } from "@tanstack/react-router"
import type { VoterFilter } from "@/types/voter"

const PARTY_OPTIONS = ["DEM", "REP", "NPA", "LIB", "GRN", "OTH"]

const CURRENT_YEAR = new Date().getFullYear()
const ELECTION_YEARS = Array.from({ length: 9 }, (_, i) => CURRENT_YEAR - i)

interface VoterFilterBuilderProps {
  value: VoterFilter
  onChange: (filters: VoterFilter) => void
  className?: string
  campaignId?: string
}

function VotingHistoryFilter({
  value,
  onChange,
}: {
  value: VoterFilter
  onChange: (partial: Partial<VoterFilter>) => void
}) {
  return (
    <div>
      <Label className="text-sm font-medium mb-2 block">Voting History</Label>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Voted in:</p>
          <div className="flex flex-wrap gap-2">
            {ELECTION_YEARS.map((year) => {
              const yearStr = String(year)
              return (
                <label key={yearStr} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={value.voted_in?.includes(yearStr) ?? false}
                    onCheckedChange={(checked) => {
                      const current = value.voted_in ?? []
                      onChange({
                        voted_in: checked
                          ? [...current, yearStr]
                          : current.filter((y) => y !== yearStr),
                      })
                    }}
                  />
                  <span className="text-sm">{year}</span>
                </label>
              )
            })}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Did not vote in:</p>
          <div className="flex flex-wrap gap-2">
            {ELECTION_YEARS.map((year) => {
              const yearStr = String(year)
              return (
                <label key={yearStr} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={value.not_voted_in?.includes(yearStr) ?? false}
                    onCheckedChange={(checked) => {
                      const current = value.not_voted_in ?? []
                      onChange({
                        not_voted_in: checked
                          ? [...current, yearStr]
                          : current.filter((y) => y !== yearStr),
                      })
                    }}
                  />
                  <span className="text-sm">{year}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function TagsFilter({
  value,
  onChange,
  campaignId,
}: {
  value: VoterFilter
  onChange: (partial: Partial<VoterFilter>) => void
  campaignId: string
}) {
  const { data: allTags = [] } = useCampaignTags(campaignId)

  if (allTags.length === 0) {
    return (
      <div>
        <Label className="text-sm font-medium mb-2 block">Tags</Label>
        <p className="text-xs text-muted-foreground">No tags available</p>
      </div>
    )
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-2 block">Tags</Label>
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const isSelected = value.tags?.includes(tag.id) ?? false
          return (
            <Badge
              key={tag.id}
              variant={isSelected ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                const current = value.tags ?? []
                onChange({
                  tags: isSelected
                    ? current.filter((t) => t !== tag.id)
                    : [...current, tag.id],
                })
              }}
            >
              {tag.name}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}

export function VoterFilterBuilder({
  value,
  onChange,
  className,
  campaignId: campaignIdProp,
}: VoterFilterBuilderProps) {
  const [showMore, setShowMore] = useState(false)

  // Attempt to get campaignId from URL params if not provided as prop
  let resolvedCampaignId = campaignIdProp ?? ""
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const params = useParams({ strict: false }) as { campaignId?: string }
    if (!resolvedCampaignId && params.campaignId) {
      resolvedCampaignId = params.campaignId
    }
  } catch {
    // useParams unavailable in test environment — use prop
  }

  const update = (partial: Partial<VoterFilter>) => onChange({ ...value, ...partial })

  return (
    <div className={cn("space-y-4 p-4 border rounded-lg bg-muted/30", className)}>
      {/* Party */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Party</Label>
        <div className="flex flex-wrap gap-3">
          {PARTY_OPTIONS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={value.parties?.includes(p) ?? false}
                onCheckedChange={(checked) => {
                  const current = value.parties ?? []
                  update({
                    parties: checked
                      ? [...current, p]
                      : current.filter((x) => x !== p),
                  })
                }}
              />
              <span className="text-sm">{p}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Age range */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Age Range</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            className="w-20"
            value={value.age_min ?? ""}
            onChange={(e) =>
              update({ age_min: e.target.value ? +e.target.value : undefined })
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="Max"
            className="w-20"
            value={value.age_max ?? ""}
            onChange={(e) =>
              update({ age_max: e.target.value ? +e.target.value : undefined })
            }
          />
        </div>
      </div>

      {/* Voting history */}
      <VotingHistoryFilter value={value} onChange={update} />

      {/* Tags */}
      {resolvedCampaignId ? (
        <TagsFilter value={value} onChange={update} campaignId={resolvedCampaignId} />
      ) : (
        <div>
          <Label className="text-sm font-medium mb-2 block">Tags</Label>
          <p className="text-xs text-muted-foreground">No tags available</p>
        </div>
      )}

      {/* City */}
      <div>
        <Label className="text-sm font-medium mb-2 block">City</Label>
        <Input
          placeholder="Filter by city"
          value={value.city ?? ""}
          onChange={(e) => update({ city: e.target.value || undefined })}
        />
      </div>

      {/* More filters toggle */}
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => setShowMore((v) => !v)}
      >
        {showMore ? "Fewer filters ▲" : "More filters ▼"}
      </Button>

      {showMore && (
        <div className="space-y-4 pt-2 border-t">
          <div>
            <Label className="text-sm font-medium mb-2 block">Zip Code</Label>
            <Input
              placeholder="Zip code"
              value={value.zip_code ?? ""}
              onChange={(e) => update({ zip_code: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">State</Label>
            <Input
              placeholder="State"
              value={value.state ?? ""}
              onChange={(e) => update({ state: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Gender</Label>
            <Input
              placeholder="Gender"
              value={value.gender ?? ""}
              onChange={(e) => update({ gender: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Precinct</Label>
            <Input
              placeholder="Precinct"
              value={value.precinct ?? ""}
              onChange={(e) => update({ precinct: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Congressional District</Label>
            <Input
              placeholder="Congressional district"
              value={value.congressional_district ?? ""}
              onChange={(e) =>
                update({ congressional_district: e.target.value || undefined })
              }
            />
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Phone Number</Label>
            <div className="flex gap-3">
              {(
                [
                  { label: "Any", value: undefined },
                  { label: "Has phone", value: true },
                  { label: "No phone", value: false },
                ] as const
              ).map(({ label, value: optValue }) => (
                <label key={label} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={value.has_phone === optValue}
                    onChange={() => update({ has_phone: optValue })}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Registered After</Label>
            <Input
              type="date"
              value={value.registered_after ?? ""}
              onChange={(e) =>
                update({ registered_after: e.target.value || undefined })
              }
            />
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Registered Before</Label>
            <Input
              type="date"
              value={value.registered_before ?? ""}
              onChange={(e) =>
                update({ registered_before: e.target.value || undefined })
              }
            />
          </div>
          {/* Filter logic AND/OR */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Filter Logic</Label>
            <div className="flex gap-3">
              {(["AND", "OR"] as const).map((l) => (
                <label key={l} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={(value.logic ?? "AND") === l}
                    onChange={() => update({ logic: l })}
                  />
                  <span className="text-sm">{l}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
