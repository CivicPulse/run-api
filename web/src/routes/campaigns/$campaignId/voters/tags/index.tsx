import { useState } from "react"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, Tag } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable } from "@/components/shared/DataTable"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { RequireRole } from "@/components/shared/RequireRole"
import {
  useCampaignTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
} from "@/hooks/useVoterTags"
import type { VoterTag } from "@/types/voter-tag"

// ---- Color palette for visual differentiation ----
const PALETTE = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#06b6d4", // cyan-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
]

function hashTagId(id: string): number {
  return id.charCodeAt(0) % 8
}

// ---- Form schema ----
const tagSchema = z.object({
  name: z.string().min(1, "Tag name required"),
})
type TagFormValues = z.infer<typeof tagSchema>

// ---- Tag form dialog (shared for create and edit) ----
interface TagFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  defaultValues?: TagFormValues
  isPending: boolean
  onSubmit: (values: TagFormValues) => Promise<void>
}

function TagFormDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  isPending,
  onSubmit,
}: TagFormDialogProps) {
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagSchema),
    defaultValues: defaultValues ?? { name: "" },
  })

  // Reset form when dialog opens with new defaults
  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset(defaultValues ?? { name: "" })
    }
    onOpenChange(next)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values)
    form.reset()
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tag-name">Tag name</Label>
            <Input
              id="tag-name"
              placeholder="e.g. Undecided"
              disabled={isPending}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- Row-level action cell ----
interface TagActionsProps {
  tag: VoterTag
  onEdit: (tag: VoterTag) => void
  onDelete: (tag: VoterTag) => void
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
function VoterTagsPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/voters/tags/",
  })

  const { data: tags = [], isLoading } = useCampaignTags(campaignId)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const createTag = useCreateTag(campaignId)

  // Edit dialog
  const [editTag, setEditTag] = useState<VoterTag | null>(null)

  // Delete dialog
  const [deleteTag, setDeleteTag] = useState<VoterTag | null>(null)

  // Per-row mutations keyed by tag id in the actions cell — we use a top-level
  // hook pair and drive them off editTag / deleteTag state.
  const updateTag = useUpdateTag(campaignId, editTag?.id ?? "")
  const deleteTagMutation = useDeleteTag(campaignId, deleteTag?.id ?? "")

  const handleCreate = async (values: TagFormValues) => {
    try {
      await createTag.mutateAsync({ name: values.name })
      toast.success("Tag created")
      setCreateOpen(false)
    } catch {
      toast.error("Failed to create tag")
    }
  }

  const handleUpdate = async (values: TagFormValues) => {
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

  const columns: ColumnDef<VoterTag, unknown>[] = [
    {
      id: "color",
      header: "",
      cell: ({ row }) => (
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: PALETTE[hashTagId(row.original.id)] }}
        />
      ),
    },
    {
      accessorKey: "name",
      header: "Tag name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
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
        <h2 className="text-lg font-semibold">Campaign Tags</h2>
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
        emptyTitle="No tags yet"
        emptyDescription="Create tags to organize your voters"
        emptyAction={
          <RequireRole minimum="manager">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              + New Tag
            </Button>
          </RequireRole>
        }
      />

      {/* Create Tag Dialog */}
      <TagFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New Tag"
        isPending={createTag.isPending}
        onSubmit={handleCreate}
      />

      {/* Edit Tag Dialog */}
      <TagFormDialog
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
        description="This will remove the tag from all voters in this campaign."
        confirmText={deleteTag?.name ?? ""}
        onConfirm={handleDelete}
        isPending={deleteTagMutation.isPending}
      />
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/tags/")({
  component: VoterTagsPage,
})
