import { createFileRoute, useParams } from "@tanstack/react-router"
import { useVoter, useVoterInteractions } from "@/hooks/useVoters"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

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

function VoterDetailPage() {
  const { campaignId, voterId } = useParams({
    from: "/campaigns/$campaignId/voters/$voterId",
  })

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

  const addressParts = [
    voter.address_line1,
    voter.address_line2,
    [voter.city, voter.state].filter(Boolean).join(", "),
    voter.zip_code,
  ].filter(Boolean)

  const interactions = interactionsData?.items ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{fullName}</h2>
          {voter.party && <Badge variant="secondary">{voter.party}</Badge>}
        </div>
        {addressParts.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {addressParts.join(", ")}
          </p>
        )}
      </div>

      <Separator />

      {/* Two-column layout */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left column: voter info cards */}
        <div className="space-y-6">
          {/* Personal Info */}
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
                  <dd className="font-medium">{voter.age ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Gender</dt>
                  <dd className="font-medium">{voter.gender ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ethnicity</dt>
                  <dd className="font-medium">{voter.ethnicity ?? "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Address</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Street</dt>
                  <dd className="font-medium">
                    {[voter.address_line1, voter.address_line2]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">City</dt>
                  <dd className="font-medium">{voter.city ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">State</dt>
                  <dd className="font-medium">{voter.state ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ZIP Code</dt>
                  <dd className="font-medium">{voter.zip_code ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">County</dt>
                  <dd className="font-medium">{voter.county ?? "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Registration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registration</CardTitle>
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
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Right column: interaction timeline */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interactions</CardTitle>
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
                        {interaction.type}
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
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/voters/$voterId",
)({
  component: VoterDetailPage,
})
