import { createFileRoute, useParams } from "@tanstack/react-router"
import { useVolunteers, useShifts } from "@/hooks/useFieldOps"
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

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startFormatted = startDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  const endFormatted = endDate.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${startFormatted} - ${endFormatted}`
}

function VolunteersPage() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/volunteers" })
  const { data: volunteersData, isLoading: volunteersLoading } = useVolunteers(campaignId)
  const { data: shiftsData, isLoading: shiftsLoading } = useShifts(campaignId)

  const volunteers = volunteersData?.items ?? []
  const shifts = shiftsData?.items ?? []

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Volunteers</h2>
        <p className="text-sm text-muted-foreground">
          Manage volunteer roster and shifts
        </p>
      </div>

      {/* Volunteer Roster Section */}
      <section className="space-y-4">
        <h3 className="text-md font-medium">Volunteer Roster</h3>
        {volunteersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : volunteers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No volunteers found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Skills</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {volunteers.map((volunteer) => (
                <TableRow key={volunteer.id}>
                  <TableCell className="font-medium">
                    {volunteer.first_name} {volunteer.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {volunteer.email ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {volunteer.phone ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{volunteer.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {volunteer.skills.length > 0 ? (
                        volunteer.skills.map((skill) => (
                          <Badge key={skill} variant="secondary">
                            {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Separator />

      {/* Shifts Section */}
      <section className="space-y-4">
        <h3 className="text-md font-medium">Shifts</h3>
        {shiftsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shifts found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Signups</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium">{shift.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{shift.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateRange(shift.start_at, shift.end_at)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {shift.signed_up_count}/{shift.max_volunteers}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{shift.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/volunteers")({
  component: VolunteersPage,
})
