import { createFileRoute, useParams, Link } from "@tanstack/react-router"
import { useTurfs } from "@/hooks/useTurfs"
import { useWalkLists, useDeleteWalkList } from "@/hooks/useWalkLists"
import { useDeleteTurf } from "@/hooks/useTurfs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { WalkListGenerateDialog } from "@/components/canvassing/WalkListGenerateDialog"
import { Map, Plus, Trash2, List } from "lucide-react"
import { useState } from "react"

function CanvassingIndex() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/canvassing/" })
  const { data: turfsData, isLoading: turfsLoading } = useTurfs(campaignId)
  const { data: walkListsData, isLoading: walkListsLoading } = useWalkLists(campaignId)
  const deleteTurf = useDeleteTurf(campaignId)
  const deleteWalkList = useDeleteWalkList(campaignId)

  const turfs = turfsData?.items ?? []
  const walkLists = walkListsData?.items ?? []

  const [deleteTurfId, setDeleteTurfId] = useState<string | null>(null)
  const [deleteWalkListId, setDeleteWalkListId] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)

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
        <div className="flex items-center justify-between">
          <h3 className="text-md font-medium">Turfs</h3>
          <Button size="sm" asChild>
            <Link to={`/campaigns/${campaignId}/canvassing/turfs/new` as string}>
              <Plus className="mr-1 h-4 w-4" /> New Turf
            </Link>
          </Button>
        </div>
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
          <EmptyState
            icon={Map}
            title="No turfs yet"
            description="Create a turf to define canvassing areas on the map."
            action={
              <Button size="sm" asChild>
                <Link to={`/campaigns/${campaignId}/canvassing/turfs/new` as string}>
                  <Plus className="mr-1 h-4 w-4" /> Create Turf
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {turfs.map((turf) => (
              <Card key={turf.id} className="group relative">
                <Link
                  to={`/campaigns/${campaignId}/canvassing/turfs/${turf.id}` as string}
                  className="absolute inset-0 z-10"
                />
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{turf.name}</CardTitle>
                    <Badge variant="outline">{turf.status}</Badge>
                  </div>
                  {turf.description && (
                    <CardDescription>{turf.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative z-20"
                    onClick={(e) => {
                      e.preventDefault()
                      setDeleteTurfId(turf.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Walk Lists Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-medium">Walk Lists</h3>
          <Button size="sm" onClick={() => setGenerateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Generate Walk List
          </Button>
        </div>
        {walkListsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : walkLists.length === 0 ? (
          <EmptyState
            icon={List}
            title="No walk lists yet"
            description="Create a walk list from a turf to assign to canvassers."
            action={
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Generate Walk List
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
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
                  <TableRow key={walkList.id} className="relative">
                    <TableCell className="font-medium">
                      <Link
                        to={`/campaigns/${campaignId}/canvassing/walk-lists/${walkList.id}` as string}
                        className="hover:underline"
                      >
                        {walkList.name}
                      </Link>
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
                          {walkList.visited_entries}/{walkList.total_entries}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(walkList.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteWalkListId(walkList.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <ConfirmDialog
        open={!!deleteTurfId}
        onOpenChange={(open) => { if (!open) setDeleteTurfId(null) }}
        title="Delete Turf"
        description="Are you sure you want to delete this turf? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteTurf.isPending}
        onConfirm={() => {
          if (deleteTurfId) {
            deleteTurf.mutate(deleteTurfId, { onSuccess: () => setDeleteTurfId(null) })
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteWalkListId}
        onOpenChange={(open) => { if (!open) setDeleteWalkListId(null) }}
        title="Delete Walk List"
        description="Are you sure you want to delete this walk list? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteWalkList.isPending}
        onConfirm={() => {
          if (deleteWalkListId) {
            deleteWalkList.mutate(deleteWalkListId, { onSuccess: () => setDeleteWalkListId(null) })
          }
        }}
      />

      <WalkListGenerateDialog
        campaignId={campaignId}
        turfs={turfs}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
      />
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/canvassing/")({
  component: CanvassingIndex,
})
