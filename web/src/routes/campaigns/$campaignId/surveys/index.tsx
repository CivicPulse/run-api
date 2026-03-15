import { createFileRoute, useParams, Link } from "@tanstack/react-router"
import { useSurveyScripts, useDeleteScript, useCreateScript } from "@/hooks/useSurveys"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ClipboardList, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import type { ScriptStatus } from "@/types/survey"

const statusVariant: Record<ScriptStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  archived: "secondary",
}

function SurveysIndex() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/surveys/" })
  const { data, isLoading } = useSurveyScripts(campaignId)
  const deleteScript = useDeleteScript(campaignId)
  const createScript = useCreateScript(campaignId)

  const scripts = data?.items ?? []

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")

  const handleCreate = () => {
    createScript.mutate(
      { title, description: description || undefined },
      {
        onSuccess: () => {
          setCreateOpen(false)
          setTitle("")
          setDescription("")
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Surveys</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage survey scripts for canvassing and phone banking
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Script
        </Button>
      </div>

      {isLoading ? (
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
      ) : scripts.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No survey scripts yet"
          description="Create a survey script to start building questionnaires for your volunteers."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Create Script
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scripts.map((script) => (
            <Card key={script.id} className="group relative">
              <Link
                to={`/campaigns/${campaignId}/surveys/${script.id}` as string}
                className="absolute inset-0 z-10"
              />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{script.title}</CardTitle>
                  <Badge variant={statusVariant[script.status]}>
                    {script.status}
                  </Badge>
                </div>
                {script.description && (
                  <CardDescription>{script.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {new Date(script.created_at).toLocaleDateString()}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative z-20"
                  onClick={(e) => {
                    e.preventDefault()
                    setDeleteId(script.id)
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Delete Script"
        description="Are you sure you want to delete this survey script? This action cannot be undone. Only draft scripts can be deleted."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteScript.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteScript.mutate(deleteId, {
              onSuccess: () => setDeleteId(null),
            })
          }
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Survey Script</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="script-title">Title</Label>
              <Input
                id="script-title"
                placeholder="e.g. Voter Issue Survey"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="script-desc">Description (optional)</Label>
              <Textarea
                id="script-desc"
                placeholder="Brief description of this survey..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createScript.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!title.trim() || createScript.isPending}
            >
              {createScript.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/surveys/")({
  component: SurveysIndex,
})
