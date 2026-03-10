import { createFileRoute, useParams } from "@tanstack/react-router"
import { usePhoneBankSessions, useCallLists } from "@/hooks/useFieldOps"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

function formatSchedule(start: string | null, end: string | null): string {
  if (!start) return "Not scheduled"
  const startDate = new Date(start)
  const formatted = startDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  if (!end) return formatted
  const endDate = new Date(end)
  const endFormatted = endDate.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${formatted} - ${endFormatted}`
}

function PhoneBankingPage() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/phone-banking" })
  const { data: sessionsData, isLoading: sessionsLoading } = usePhoneBankSessions(campaignId)
  const { data: callListsData, isLoading: callListsLoading } = useCallLists(campaignId)

  const sessions = sessionsData?.items ?? []
  const callLists = callListsData?.items ?? []

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Phone Banking</h2>
        <p className="text-sm text-muted-foreground">
          Manage phone banking campaigns and call lists
        </p>
      </div>

      {/* Sessions Section */}
      <section className="space-y-4">
        <h3 className="text-md font-medium">Sessions</h3>
        {sessionsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions found.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <Card key={session.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{session.name}</CardTitle>
                    <Badge variant="outline">{session.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatSchedule(session.scheduled_start, session.scheduled_end)}
                  </p>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Call Lists Section */}
      <section className="space-y-4">
        <h3 className="text-md font-medium">Call Lists</h3>
        {callListsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : callLists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No call lists found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {callLists.map((callList) => {
                const progress =
                  callList.total_entries > 0
                    ? Math.round(
                        (callList.completed_entries / callList.total_entries) * 100,
                      )
                    : 0
                return (
                  <TableRow key={callList.id}>
                    <TableCell className="font-medium">{callList.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{callList.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {callList.completed_entries}/{callList.total_entries}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(callList.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking")({
  component: PhoneBankingPage,
})
