import { useState } from "react"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { MoreHorizontal, Tag } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable } from "@/components/shared/DataTable"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { RequireRole } from "@/components/shared/RequireRole"
import { VolunteerTagFormDialog } from "@/components/volunteers/VolunteerTagFormDialog"
import {
  useVolunteerCampaignTags,
  useCreateVolunteerTag,
  useUpdateVolunteerTag,
  useDeleteVolunteerTag,
} from "@/hooks/useVolunteerTags"
import type { VolunteerTagResponse } from "@/types/volunteer"

// ---- Row-level action cell ----
interface TagActionsProps {
  tag: VolunteerTagResponse
  onEdit: (tag: VolunteerTagResponse) => void
  onDelete: (tag: VolunteerTagResponse) => void
}

function TagActions({ tag, onEdit, onDelete }: TagActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(tag)}>Edit</DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(tag)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---- Main page ----
function VolunteerTagsPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/volunteers/tags/",
  })

  const { data: tags = [], isLoading } = useVolunteerCampaignTags(campaignId)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const createTag = useCreateVolunteerTag(campaignId)

  // Edit dialog
  const [editTag, setEditTag] = useState<VolunteerTagResponse | null>(null)

  // Delete dialog
  const [deleteTag, setDeleteTag] = useState<VolunteerTagResponse | null>(null)

  // Per-row mutations keyed by selected tag
  const updateTag = useUpdateVolunteerTag(campaignId, editTag?.id ?? "")
  const deleteTagMutation = useDeleteVolunteerTag(
    campaignId,
    deleteTag?.id ?? "",
  )

  const handleCreate = async (values: { name: string }) => {
    try {
      await createTag.mutateAsync({ name: values.name })
      toast.success("Tag created")
      setCreateOpen(false)
    } catch {
      toast.error("Failed to create tag")
    }
  }

  const handleUpdate = async (values: { name: string }) => {
    if (!editTag) return
    try {
      await updateTag.mutateAsync({ name: values.name })
      toast.success("Tag updated")
      setEditTag(null)
    } catch {
      toast.error("Failed to update tag")
    }
  }

  const handleDelete = async () => {
    if (!deleteTag) return
    try {
      await deleteTagMutation.mutateAsync()
      toast.success("Tag deleted")
      setDeleteTag(null)
    } catch {
      toast.error("Failed to delete tag")
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  const columns: ColumnDef<VolunteerTagResponse, unknown>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RequireRole minimum="manager">
          <TagActions
            tag={row.original}
            onEdit={(tag) => setEditTag(tag)}
            onDelete={(tag) => setDeleteTag(tag)}
          />
        </RequireRole>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Volunteer Tags</h2>
        <RequireRole minimum="manager">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            + New Tag
          </Button>
        </RequireRole>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={tags}
        isLoading={isLoading}
        emptyIcon={Tag}
        emptyTitle="No volunteer tags yet"
        emptyDescription="Create tags to organize and categorize volunteers."
        emptyAction={
          <RequireRole minimum="manager">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              + New Tag
            </Button>
          </RequireRole>
        }
      />

      {/* Create Tag Dialog */}
      <VolunteerTagFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Tag"
        isPending={createTag.isPending}
        onSubmit={handleCreate}
      />

      {/* Edit Tag Dialog */}
      <VolunteerTagFormDialog
        open={!!editTag}
        onOpenChange={(open) => {
          if (!open) setEditTag(null)
        }}
        title="Edit Tag"
        defaultValues={editTag ? { name: editTag.name } : undefined}
        isPending={updateTag.isPending}
        onSubmit={handleUpdate}
      />

      {/* Delete Tag Dialog */}
      <DestructiveConfirmDialog
        open={!!deleteTag}
        onOpenChange={(open) => {
          if (!open) setDeleteTag(null)
        }}
        title={`Delete "${deleteTag?.name ?? "tag"}"?`}
        description="This will remove the tag from all volunteers in this campaign."
        confirmText={deleteTag?.name ?? ""}
        onConfirm={handleDelete}
        isPending={deleteTagMutation.isPending}
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/volunteers/tags/",
)({
  component: VolunteerTagsPage,
})
