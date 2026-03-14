import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useCampaignTags } from "@/hooks/useVoterTags"
import { useDistinctValues } from "@/hooks/useVoters"
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

function countSectionFilters(value: VoterFilter, section: string): number {
  let count = 0
  switch (section) {
    case "demographics":
      if (value.parties?.length) count++
      if (value.age_min !== undefined) count++
      if (value.age_max !== undefined) count++
      if (value.gender) count++
      if (value.ethnicities?.length) count++
      if (value.spoken_languages?.length) count++
      if (value.military_statuses?.length) count++
      break
    case "location":
      if (value.registration_city) count++
      if (value.registration_state) count++
      if (value.registration_zip) count++
      if (value.precinct) count++
      if (value.mailing_city) count++
      if (value.mailing_state) count++
      if (value.mailing_zip) count++
      break
    case "political":
      if (value.congressional_district) count++
      if (value.voted_in?.length) count++
      if (value.not_voted_in?.length) count++
      break
    case "scoring":
      if (value.propensity_general_min !== undefined) count++
      if (value.propensity_general_max !== undefined) count++
      if (value.propensity_primary_min !== undefined) count++
      if (value.propensity_primary_max !== undefined) count++
      if (value.propensity_combined_min !== undefined) count++
      if (value.propensity_combined_max !== undefined) count++
      break
    case "advanced":
      if (value.has_phone !== undefined) count++
      if (value.registered_after) count++
      if (value.registered_before) count++
      if (value.logic && value.logic !== "AND") count++
      break
  }
  return count
}

function hasActiveFilters(value: VoterFilter): boolean {
  return Object.entries(value).some(([, v]) => {
    if (v === undefined || v === null) return false
    if (typeof v === "string" && v === "") return false
    if (Array.isArray(v) && v.length === 0) return false
    return true
  })
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {count > 0 && (
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      )}
    </span>
  )
}

function DynamicCheckboxGroup({
  label,
  options,
  isLoading,
  selected,
  onToggle,
}: {
  label: string
  options: { value: string; count: number }[] | undefined
  isLoading: boolean
  selected: string[]
  onToggle: (value: string, checked: boolean) => void
}) {
  if (isLoading) {
    return (
      <div>
        <Label className="text-sm font-medium mb-2 block">{label}</Label>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-5 w-16 animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      </div>
    )
  }

  if (!options || options.length === 0) {
    return null
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-2 block">
        {label} ({options.length})
      </Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={(checked) => onToggle(opt.value, !!checked)}
            />
            <span className="text-sm">
              {opt.value} ({opt.count})
            </span>
          </label>
        ))}
      </div>
    </div>
  )
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

function PropensitySlider({
  label,
  minValue,
  maxValue,
  onCommit,
}: {
  label: string
  minValue: number | undefined
  maxValue: number | undefined
  onCommit: (min: number | undefined, max: number | undefined) => void
}) {
  const currentMin = minValue ?? 0
  const currentMax = maxValue ?? 100

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium block">{label}</Label>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[currentMin, currentMax]}
        onValueCommit={([min, max]) => {
          onCommit(
            min === 0 ? undefined : min,
            max === 100 ? undefined : max
          )
        }}
      />
      <p className="text-xs text-muted-foreground">
        {currentMin} - {currentMax}
      </p>
    </div>
  )
}

export function VoterFilterBuilder({
  value,
  onChange,
  className,
  campaignId: campaignIdProp,
}: VoterFilterBuilderProps) {
  // Attempt to get campaignId from URL params if not provided as prop
  let resolvedCampaignId = campaignIdProp ?? ""
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const params = useParams({ strict: false }) as { campaignId?: string }
    if (!resolvedCampaignId && params.campaignId) {
      resolvedCampaignId = params.campaignId
    }
  } catch {
    // useParams unavailable in test environment -- use prop
  }

  const { data: distinctData, isLoading: distinctLoading } = useDistinctValues(
    resolvedCampaignId,
    ["ethnicity", "spoken_language", "military_status"]
  )

  const update = (partial: Partial<VoterFilter>) => onChange({ ...value, ...partial })

  const toggleArrayValue = (
    field: "ethnicities" | "spoken_languages" | "military_statuses",
    itemValue: string,
    checked: boolean
  ) => {
    const current = value[field] ?? []
    update({
      [field]: checked
        ? [...current, itemValue]
        : current.filter((v) => v !== itemValue),
    })
  }

  const demographicsCount = countSectionFilters(value, "demographics")
  const locationCount = countSectionFilters(value, "location")
  const politicalCount = countSectionFilters(value, "political")
  const scoringCount = countSectionFilters(value, "scoring")
  const advancedCount = countSectionFilters(value, "advanced")

  return (
    <div className={cn("space-y-3 p-4 border rounded-lg bg-muted/30", className)}>
      {/* Clear all button - only visible when filters are active */}
      {hasActiveFilters(value) && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            Clear all
          </Button>
        </div>
      )}

      <Accordion type="multiple" defaultValue={["demographics"]}>
        {/* Demographics Section */}
        <AccordionItem value="demographics">
          <AccordionTrigger>
            <SectionHeader label="Demographics" count={demographicsCount} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
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

              {/* Age Range */}
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
                  <span className="text-muted-foreground">&ndash;</span>
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

              {/* Gender */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Gender</Label>
                <Input
                  placeholder="Gender"
                  value={value.gender ?? ""}
                  onChange={(e) => update({ gender: e.target.value || undefined })}
                />
              </div>

              {/* Ethnicity - dynamic */}
              <DynamicCheckboxGroup
                label="Ethnicity"
                options={distinctData?.ethnicity}
                isLoading={distinctLoading}
                selected={value.ethnicities ?? []}
                onToggle={(v, checked) => toggleArrayValue("ethnicities", v, checked)}
              />

              {/* Language - dynamic */}
              <DynamicCheckboxGroup
                label="Language"
                options={distinctData?.spoken_language}
                isLoading={distinctLoading}
                selected={value.spoken_languages ?? []}
                onToggle={(v, checked) => toggleArrayValue("spoken_languages", v, checked)}
              />

              {/* Military Status - dynamic */}
              <DynamicCheckboxGroup
                label="Military Status"
                options={distinctData?.military_status}
                isLoading={distinctLoading}
                selected={value.military_statuses ?? []}
                onToggle={(v, checked) => toggleArrayValue("military_statuses", v, checked)}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Location Section */}
        <AccordionItem value="location">
          <AccordionTrigger>
            <SectionHeader label="Location" count={locationCount} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Registration City</Label>
                <Input
                  placeholder="City"
                  value={value.registration_city ?? ""}
                  onChange={(e) => update({ registration_city: e.target.value || undefined })}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Registration State</Label>
                <Input
                  placeholder="State"
                  value={value.registration_state ?? ""}
                  onChange={(e) => update({ registration_state: e.target.value || undefined })}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Registration ZIP</Label>
                <Input
                  placeholder="ZIP code"
                  value={value.registration_zip ?? ""}
                  onChange={(e) => update({ registration_zip: e.target.value || undefined })}
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

              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Mailing Address</p>

              <div>
                <Label className="text-sm font-medium mb-2 block">Mailing City</Label>
                <Input
                  placeholder="City"
                  value={value.mailing_city ?? ""}
                  onChange={(e) => update({ mailing_city: e.target.value || undefined })}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Mailing State</Label>
                <Input
                  placeholder="State"
                  value={value.mailing_state ?? ""}
                  onChange={(e) => update({ mailing_state: e.target.value || undefined })}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Mailing ZIP</Label>
                <Input
                  placeholder="ZIP code"
                  value={value.mailing_zip ?? ""}
                  onChange={(e) => update({ mailing_zip: e.target.value || undefined })}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Political Section */}
        <AccordionItem value="political">
          <AccordionTrigger>
            <SectionHeader label="Political" count={politicalCount} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
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
              <VotingHistoryFilter value={value} onChange={update} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Scoring Section */}
        <AccordionItem value="scoring">
          <AccordionTrigger>
            <SectionHeader label="Scoring" count={scoringCount} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <PropensitySlider
                label="General Propensity"
                minValue={value.propensity_general_min}
                maxValue={value.propensity_general_max}
                onCommit={(min, max) =>
                  update({ propensity_general_min: min, propensity_general_max: max })
                }
              />
              <PropensitySlider
                label="Primary Propensity"
                minValue={value.propensity_primary_min}
                maxValue={value.propensity_primary_max}
                onCommit={(min, max) =>
                  update({ propensity_primary_min: min, propensity_primary_max: max })
                }
              />
              <PropensitySlider
                label="Combined Propensity"
                minValue={value.propensity_combined_min}
                maxValue={value.propensity_combined_max}
                onCommit={(min, max) =>
                  update({ propensity_combined_min: min, propensity_combined_max: max })
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Advanced Section */}
        <AccordionItem value="advanced">
          <AccordionTrigger>
            <SectionHeader label="Advanced" count={advancedCount} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {/* Phone Number */}
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

              {/* Registered After */}
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

              {/* Registered Before */}
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

              {/* Tags */}
              {resolvedCampaignId ? (
                <TagsFilter value={value} onChange={update} campaignId={resolvedCampaignId} />
              ) : (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Tags</Label>
                  <p className="text-xs text-muted-foreground">No tags available</p>
                </div>
              )}

              {/* Filter Logic AND/OR */}
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
