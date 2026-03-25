import { useMemo } from "react"
import { createFileRoute, useParams } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  useDashboardOverview,
  useCanvasserBreakdown,
  useTurfBreakdown,
  useCallerBreakdown,
  useSessionBreakdown,
  useVolunteerBreakdown,
  useShiftBreakdown,
} from "@/hooks/useDashboard"

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function StatCard({
  title,
  value,
  description,
  isLoading,
}: {
  title: string
  value: string | number
  description?: string
  isLoading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <CardTitle className="text-2xl">{value}</CardTitle>
        )}
      </CardHeader>
      {description && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      )}
    </Card>
  )
}

function CanvassingTab({ campaignId }: { campaignId: string }) {
  const { data: canvassers, isLoading: canvassersLoading } =
    useCanvasserBreakdown(campaignId)
  const { data: turfs, isLoading: turfsLoading } =
    useTurfBreakdown(campaignId)

  const chartData = useMemo(
    () =>
      (canvassers ?? [])
        .sort((a, b) => b.doors_knocked - a.doors_knocked)
        .slice(0, 10)
        .map((c) => ({
          name: c.display_name,
          doors_knocked: c.doors_knocked,
          contacts_made: c.contacts_made,
        })),
    [canvassers],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Top Canvassers</CardTitle>
          <CardDescription>Doors knocked by canvasser (top 10)</CardDescription>
        </CardHeader>
        <CardContent>
          {canvassersLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No canvassing data yet
            </p>
          ) : (
            <div>
              <div aria-hidden="true">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="doors_knocked"
                      name="Doors Knocked"
                      fill="var(--chart-1)"
                    />
                    <Bar
                      dataKey="contacts_made"
                      name="Contacts Made"
                      fill="var(--chart-2)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="sr-only">
                <caption>Top canvassers by doors knocked and contacts made</caption>
                <thead>
                  <tr><th>Canvasser</th><th>Doors Knocked</th><th>Contacts Made</th></tr>
                </thead>
                <tbody>
                  {chartData.map((row) => (
                    <tr key={row.name}><td>{row.name}</td><td>{row.doors_knocked}</td><td>{row.contacts_made}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Turf Performance</CardTitle>
          <CardDescription>Breakdown by turf assignment</CardDescription>
        </CardHeader>
        <CardContent>
          {turfsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !turfs || turfs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No turf data yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Turf</TableHead>
                  <TableHead className="text-right">Doors Knocked</TableHead>
                  <TableHead className="text-right">Contacts Made</TableHead>
                  <TableHead className="text-right">Contact Rate</TableHead>
                  <TableHead className="text-right">Supporters</TableHead>
                  <TableHead className="text-right">Undecided</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turfs.map((turf) => {
                  const rate =
                    turf.doors_knocked > 0
                      ? turf.contacts_made / turf.doors_knocked
                      : 0
                  return (
                    <TableRow key={turf.turf_id}>
                      <TableCell className="font-medium">
                        {turf.turf_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {turf.doors_knocked}
                      </TableCell>
                      <TableCell className="text-right">
                        {turf.contacts_made}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRate(rate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {turf.outcomes.supporter}
                      </TableCell>
                      <TableCell className="text-right">
                        {turf.outcomes.undecided}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PhoneBankingTab({ campaignId }: { campaignId: string }) {
  const { data: sessions, isLoading: sessionsLoading } =
    useSessionBreakdown(campaignId)
  const { data: callers, isLoading: callersLoading } =
    useCallerBreakdown(campaignId)

  const sessionChartData = useMemo(
    () =>
      (sessions ?? []).map((s) => ({
        name: s.session_name,
        calls_made: s.calls_made,
        contacts_reached: s.contacts_reached,
      })),
    [sessions],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Session Progress</CardTitle>
          <CardDescription>Calls and contacts by session</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : sessionChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No phone banking data yet
            </p>
          ) : (
            <div>
              <div aria-hidden="true">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sessionChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="calls_made"
                      name="Calls Made"
                      fill="var(--chart-1)"
                    />
                    <Bar
                      dataKey="contacts_reached"
                      name="Contacts Reached"
                      fill="var(--chart-3)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="sr-only">
                <caption>Calls made and contacts reached by session</caption>
                <thead>
                  <tr><th>Session</th><th>Calls Made</th><th>Contacts Reached</th></tr>
                </thead>
                <tbody>
                  {sessionChartData.map((row) => (
                    <tr key={row.name}><td>{row.name}</td><td>{row.calls_made}</td><td>{row.contacts_reached}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caller Performance</CardTitle>
          <CardDescription>Individual caller statistics</CardDescription>
        </CardHeader>
        <CardContent>
          {callersLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !callers || callers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No caller data yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead className="text-right">Calls Made</TableHead>
                  <TableHead className="text-right">
                    Contacts Reached
                  </TableHead>
                  <TableHead className="text-right">Contact Rate</TableHead>
                  <TableHead className="text-right">Answered</TableHead>
                  <TableHead className="text-right">No Answer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callers.map((caller) => {
                  const rate =
                    caller.calls_made > 0
                      ? caller.contacts_reached / caller.calls_made
                      : 0
                  return (
                    <TableRow key={caller.user_id}>
                      <TableCell className="font-medium">
                        {caller.display_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {caller.calls_made}
                      </TableCell>
                      <TableCell className="text-right">
                        {caller.contacts_reached}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRate(rate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {caller.outcomes.answered}
                      </TableCell>
                      <TableCell className="text-right">
                        {caller.outcomes.no_answer}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status.toLowerCase()) {
    case "active":
      return "default"
    case "inactive":
      return "secondary"
    case "completed":
      return "outline"
    case "cancelled":
      return "destructive"
    default:
      return "secondary"
  }
}

function VolunteersTab({ campaignId }: { campaignId: string }) {
  const { data: volunteers, isLoading: volunteersLoading } =
    useVolunteerBreakdown(campaignId)
  const { data: shifts, isLoading: shiftsLoading } =
    useShiftBreakdown(campaignId)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Volunteer Activity</CardTitle>
          <CardDescription>
            Individual volunteer hours and shifts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {volunteersLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !volunteers || volunteers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No volunteer data yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">
                    Shifts Completed
                  </TableHead>
                  <TableHead className="text-right">Hours Worked</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {volunteers.map((vol) => (
                  <TableRow key={vol.volunteer_id}>
                    <TableCell className="font-medium">
                      {vol.first_name} {vol.last_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {vol.shifts_completed}
                    </TableCell>
                    <TableCell className="text-right">
                      {vol.hours_worked.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(vol.status)}>
                        {vol.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift Fill Rates</CardTitle>
          <CardDescription>Volunteer sign-ups per shift</CardDescription>
        </CardHeader>
        <CardContent>
          {shiftsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !shifts || shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No shift data yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shift</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Signed Up</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Fill Rate</TableHead>
                  <TableHead className="text-right">Checked In</TableHead>
                  <TableHead className="text-right">Checked Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => {
                  const fillRate =
                    shift.max_volunteers > 0
                      ? shift.signed_up / shift.max_volunteers
                      : 0
                  return (
                    <TableRow key={shift.shift_id}>
                      <TableCell className="font-medium">
                        {shift.shift_name}
                      </TableCell>
                      <TableCell>{shift.type}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(shift.status)}>
                          {shift.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {shift.signed_up}
                      </TableCell>
                      <TableCell className="text-right">
                        {shift.max_volunteers}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRate(fillRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {shift.checked_in}
                      </TableCell>
                      <TableCell className="text-right">
                        {shift.checked_out}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DashboardPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/dashboard",
  })
  const { data: overview, isLoading: overviewLoading } =
    useDashboardOverview(campaignId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Campaign overview and statistics
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Doors Knocked"
          value={overview?.canvassing.doors_knocked ?? 0}
          description="Total doors visited by canvassers"
          isLoading={overviewLoading}
        />
        <StatCard
          title="Contacts Made"
          value={overview?.canvassing.contacts_made ?? 0}
          description="Successful door contacts"
          isLoading={overviewLoading}
        />
        <StatCard
          title="Canvass Contact Rate"
          value={formatRate(overview?.canvassing.contact_rate ?? 0)}
          description="Percentage of knocks resulting in contact"
          isLoading={overviewLoading}
        />
        <StatCard
          title="Calls Made"
          value={overview?.phone_banking.calls_made ?? 0}
          description="Total phone bank calls"
          isLoading={overviewLoading}
        />
        <StatCard
          title="Contacts Reached"
          value={overview?.phone_banking.contacts_reached ?? 0}
          description="Successful phone contacts"
          isLoading={overviewLoading}
        />
        <StatCard
          title="Active Volunteers"
          value={overview?.volunteers.active_volunteers ?? 0}
          description={`${overview?.volunteers.total_volunteers ?? 0} total volunteers`}
          isLoading={overviewLoading}
        />
      </div>

      <Tabs defaultValue="canvassing">
        <TabsList>
          <TabsTrigger value="canvassing">Canvassing</TabsTrigger>
          <TabsTrigger value="phone-banking">Phone Banking</TabsTrigger>
          <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
        </TabsList>
        <TabsContent value="canvassing" className="mt-4">
          <CanvassingTab campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="phone-banking" className="mt-4">
          <PhoneBankingTab campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="volunteers" className="mt-4">
          <VolunteersTab campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/dashboard")({
  component: DashboardPage,
})
