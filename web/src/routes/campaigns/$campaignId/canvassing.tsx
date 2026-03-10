import { createFileRoute, useParams } from "@tanstack/react-router"
import { useTurfs, useWalkLists } from "@/hooks/useFieldOps"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

function CanvassingPage() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/canvassing" })
  const { data: turfsData, isLoading: turfsLoading } = useTurfs(campaignId)
  const { data: walkListsData, isLoading: walkListsLoading } = useWalkLists(campaignId)

  const turfs = turfsData?.items ?? []
  const walkLists = walkListsData?.items ?? []

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Canvassing</h2>
        <p className="text-sm text-muted-foreground">
          Manage door-to-door canvassing operations
        </p>
      </div>

      {/* Turfs Section */}
      <section className="space-y-4">
        <h3 className="text-md font-medium">Turfs</h3>
        {turfsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-16" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : turfs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No turfs found.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {turfs.map((turf) => (
              <Card key={turf.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{turf.name}</CardTitle>
                    <Badge variant="outline">{turf.status}</Badge>
                  </div>
                  {turf.description && (
                    <CardDescription>{turf.description}</CardDescription>
                  )}
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Walk Lists Section */}
      <section className="space-y-4">
        <h3 className="text-md font-medium">Walk Lists</h3>
        {walkListsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : walkLists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No walk lists found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {walkLists.map((walkList) => {
                const progress =
                  walkList.total_entries > 0
                    ? Math.round(
                        (walkList.visited_entries / walkList.total_entries) * 100,
                      )
                    : 0
                return (
                  <TableRow key={walkList.id}>
                    <TableCell className="font-medium">{walkList.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {walkList.visited_entries}/{walkList.total_entries}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(walkList.created_at).toLocaleDateString()}
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

export const Route = createFileRoute("/campaigns/$campaignId/canvassing")({
  component: CanvassingPage,
})
