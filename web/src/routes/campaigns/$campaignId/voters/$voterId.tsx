import { useState } from "react"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { Check, Minus, Pencil, PlusCircle } from "lucide-react"
import { useVoter, useVoterInteractions } from "@/hooks/useVoters"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { calculateAge, formatEventType } from "@/lib/utils"
import { RequireRole } from "@/components/shared/RequireRole"
import { ContactsTab } from "@/components/voters/ContactsTab"
import { TagsTab } from "@/components/voters/TagsTab"
import { HistoryTab } from "@/components/voters/HistoryTab"
import { VoterEditSheet } from "@/components/voters/VoterEditSheet"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Returns true if any of the provided values is non-null and non-undefined. */
function hasAnyValue(...values: unknown[]): boolean {
  return values.some((v) => v !== null && v !== undefined)
}

/** Color-coded propensity score badge. */
function PropensityBadge({
  score,
  label,
}: {
  score: number | null | undefined
  label: string
}) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="secondary" className="bg-gray-100 text-gray-500">
        {label}: N/A
      </Badge>
    )
  }
  const color =
    score >= 67
      ? "bg-green-100 text-green-800"
      : score >= 34
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800"
  return <Badge className={color}>{label}: {score}</Badge>
}

/** Parses voting history strings into year-grouped rows sorted descending. */
function parseVotingHistory(
  history: string[] | null,
): Array<{ year: number; general: boolean; primary: boolean }> {
  if (!history?.length) return []
  const yearMap = new Map<number, { general: boolean; primary: boolean }>()
  for (const entry of history) {
    const match = entry.match(/^(General|Primary)_(\d{4})$/)
    if (match) {
      const type = match[1] as "General" | "Primary"
      const year = Number(match[2])
      const record = yearMap.get(year) ?? { general: false, primary: false }
      record[type.toLowerCase() as "general" | "primary"] = true
      yearMap.set(year, record)
    }
  }
  return Array.from(yearMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, flags]) => ({ year, ...flags }))
}

function VoterDetailPage() {
  const { campaignId, voterId } = useParams({
    from: "/campaigns/$campaignId/voters/$voterId",
  })

  const [activeTab, setActiveTab] = useState("overview")
  const [editSheetOpen, setEditSheetOpen] = useState(false)

  const { data: voter, isLoading: voterLoading } = useVoter(
    campaignId,
    voterId,
  )
  const { data: interactionsData, isLoading: interactionsLoading } =
    useVoterInteractions(campaignId, voterId)

  if (voterLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-6 md:grid-cols-2 mt-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (!voter) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Voter not found
      </div>
    )
  }

  const fullName =
    [voter.first_name, voter.middle_name, voter.last_name, voter.suffix]
      .filter(Boolean)
      .join(" ") || "Unknown Voter"

  const interactions = interactionsData?.items ?? []
  const votingRows = parseVotingHistory(voter.voting_history)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{fullName}</h2>
          {voter.party && <Badge variant="secondary">{voter.party}</Badge>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RequireRole minimum="manager">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditSheetOpen(true)}
            >
              <Pencil className="size-4 mr-1" />
              Edit
            </Button>
          </RequireRole>
          <Button
            size="sm"
            onClick={() => setActiveTab("history")}
          >
            <PlusCircle className="size-4 mr-1" />
            Add Interaction
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left column */}
            <div className="space-y-6">
              {/* 1. Propensity Scores */}
              {hasAnyValue(
                voter.propensity_general,
                voter.propensity_primary,
                voter.propensity_combined,
              ) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Propensity Scores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <PropensityBadge score={voter.propensity_general} label="General" />
                      <PropensityBadge score={voter.propensity_primary} label="Primary" />
                      <PropensityBadge score={voter.propensity_combined} label="Combined" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 2. Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personal Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Date of Birth</dt>
                      <dd className="font-medium">
                        {voter.date_of_birth
                          ? formatDate(voter.date_of_birth)
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Age</dt>
                      <dd className="font-medium">{voter.age ?? (voter.date_of_birth ? calculateAge(voter.date_of_birth) : null) ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Gender</dt>
                      <dd className="font-medium">{voter.gender ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Ethnicity</dt>
                      <dd className="font-medium">{voter.ethnicity ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Language</dt>
                      <dd className="font-medium">{voter.spoken_language ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Marital Status</dt>
                      <dd className="font-medium">{voter.marital_status ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Military Status</dt>
                      <dd className="font-medium">{voter.military_status ?? "-"}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {/* 3. Registration Address */}
              {hasAnyValue(
                voter.registration_line1,
                voter.registration_line2,
                voter.registration_city,
                voter.registration_state,
                voter.registration_zip,
                voter.registration_zip4,
                voter.registration_county,
                voter.registration_apartment_type,
              ) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Registration Address</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Street</dt>
                        <dd className="font-medium">
                          {[voter.registration_line1, voter.registration_line2]
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">City</dt>
                        <dd className="font-medium">{voter.registration_city ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">State</dt>
                        <dd className="font-medium">{voter.registration_state ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">ZIP</dt>
                        <dd className="font-medium">{voter.registration_zip ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">ZIP+4</dt>
                        <dd className="font-medium">{voter.registration_zip4 ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">County</dt>
                        <dd className="font-medium">{voter.registration_county ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Apartment Type</dt>
                        <dd className="font-medium">{voter.registration_apartment_type ?? "-"}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              )}

              {/* 4. Registration & Districts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Registration &amp; Districts</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Party</dt>
                      <dd className="font-medium">{voter.party ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Precinct</dt>
                      <dd className="font-medium">{voter.precinct ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Registration Date</dt>
                      <dd className="font-medium">
                        {voter.registration_date
                          ? formatDate(voter.registration_date)
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Source</dt>
                      <dd className="font-medium">{voter.source_type}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Congressional Dist.</dt>
                      <dd className="font-medium">
                        {voter.congressional_district ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">State Senate Dist.</dt>
                      <dd className="font-medium">
                        {voter.state_senate_district ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">State House Dist.</dt>
                      <dd className="font-medium">
                        {voter.state_house_district ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Party Change</dt>
                      <dd className="font-medium">
                        {voter.party_change_indicator ?? "-"}
                      </dd>
                    </div>
                  </dl>

                  {/* Voting History sub-section */}
                  <Separator className="my-4" />
                  <h4 className="text-sm font-medium mb-3">Voting History</h4>
                  {votingRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No voting history recorded
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left font-medium">Year</th>
                          <th className="pb-2 text-center font-medium">General</th>
                          <th className="pb-2 text-center font-medium">Primary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {votingRows.map((row) => (
                          <tr key={row.year} className="border-b last:border-0">
                            <td className="py-2 font-medium">{row.year}</td>
                            <td className="py-2 text-center">
                              {row.general ? (
                                <Check className="inline-block size-4 text-green-600" />
                              ) : (
                                <Minus className="inline-block size-4 text-muted-foreground" />
                              )}
                            </td>
                            <td className="py-2 text-center">
                              {row.primary ? (
                                <Check className="inline-block size-4 text-green-600" />
                              ) : (
                                <Minus className="inline-block size-4 text-muted-foreground" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* 5. Mailing Address */}
              {hasAnyValue(
                voter.mailing_line1,
                voter.mailing_line2,
                voter.mailing_city,
                voter.mailing_state,
                voter.mailing_zip,
                voter.mailing_zip4,
                voter.mailing_country,
                voter.mailing_type,
              ) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Mailing Address</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Street</dt>
                        <dd className="font-medium">
                          {[voter.mailing_line1, voter.mailing_line2]
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">City</dt>
                        <dd className="font-medium">{voter.mailing_city ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">State</dt>
                        <dd className="font-medium">{voter.mailing_state ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">ZIP</dt>
                        <dd className="font-medium">{voter.mailing_zip ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">ZIP+4</dt>
                        <dd className="font-medium">{voter.mailing_zip4 ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Country</dt>
                        <dd className="font-medium">{voter.mailing_country ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Type</dt>
                        <dd className="font-medium">{voter.mailing_type ?? "-"}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              )}

              {/* 6. Household */}
              {hasAnyValue(
                voter.household_size,
                voter.household_party_registration,
                voter.family_id,
                voter.cell_phone_confidence,
              ) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Household</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Household Size</dt>
                        <dd className="font-medium">{voter.household_size ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Party Registration</dt>
                        <dd className="font-medium">
                          {voter.household_party_registration ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Family ID</dt>
                        <dd className="font-medium">{voter.family_id ?? "-"}</dd>
                      </div>
                      {voter.cell_phone_confidence !== null &&
                        voter.cell_phone_confidence !== undefined && (
                          <div>
                            <dt className="text-muted-foreground">Cell Phone Confidence</dt>
                            <dd className="font-medium">{voter.cell_phone_confidence}</dd>
                          </div>
                        )}
                    </dl>
                  </CardContent>
                </Card>
              )}

              {/* 7. Recent Interactions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Interactions</CardTitle>
                </CardHeader>
                <CardContent>
                  {interactionsLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : interactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No interactions recorded
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {interactions.map((interaction) => (
                        <div
                          key={interaction.id}
                          className="flex items-start gap-3 rounded-md border p-3"
                        >
                          <Badge variant="outline" className="mt-0.5 shrink-0">
                            {formatEventType(interaction.type)}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">
                              {formatTimestamp(interaction.created_at)}
                            </p>
                            {Object.keys(interaction.payload).length > 0 && (
                              <p className="mt-1 text-sm text-foreground truncate">
                                {Object.entries(interaction.payload)
                                  .map(([k, v]) => `${k}: ${String(v)}`)
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="mt-6">
          <ContactsTab campaignId={campaignId} voterId={voterId} />
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="mt-6">
          <TagsTab campaignId={campaignId} voterId={voterId} />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <HistoryTab campaignId={campaignId} voterId={voterId} />
        </TabsContent>
      </Tabs>

      {/* Edit Sheet — outside Tabs */}
      <VoterEditSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        voter={voter}
        campaignId={campaignId}
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/voters/$voterId",
)({
  component: VoterDetailPage,
})
