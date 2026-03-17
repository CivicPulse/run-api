import { useState } from "react"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { MoreHorizontal, List, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { useCallLists, useCreateCallList, useUpdateCallList, useDeleteCallList } from "@/hooks/useCallLists"
import { useVoterLists } from "@/hooks/useVoterLists"
import { useFormGuard } from "@/hooks/useFormGuard"
import { DataTable } from "@/components/shared/DataTable"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { RequireRole } from "@/components/shared/RequireRole"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CallListSummary, CallListCreate, CallListUpdate } from "@/types/call-list"
import type { ColumnDef } from "@tanstack/react-table"

const ALL_VALUE = "__all__"

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking/call-lists/")({
  component: CallListsPage,
})

// Determine status badge variant based on call list status string
function statusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "active":
      return "success"
    case "completed":
      return "info"
    case "draft":
      return "default"
    default:
      return "default"
  }
}

interface CallListFormValues {
  name: string
  voter_list_id: string
  max_attempts: number
  claim_timeout_minutes: number
  cooldown_minutes: number
}

function CallListDialog({
  open,
  onOpenChange,
  editList,
  campaignId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editList: CallListSummary | null
  campaignId: string
}) {
  const isEdit = editList !== null

  const form = useForm<CallListFormValues>({
    defaultValues: {
      name: editList?.name ?? "",
      voter_list_id: ALL_VALUE,
      max_attempts: 3,
      claim_timeout_minutes: 30,
      cooldown_minutes: 60,
    },
  })

  const [advancedOpen, setAdvancedOpen] = useState(false)

  useFormGuard({ form })

  const { data: voterListsData } = useVoterLists(campaignId)
  const voterLists = voterListsData ?? []

  const createMutation = useCreateCallList(campaignId)
  const updateMutation = useUpdateCallList(campaignId, editList?.id ?? "")

  const isPending = createMutation.isPending || updateMutation.isPending

  // Reset form when dialog opens/closes or editList changes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset({
        name: "",
        voter_list_id: ALL_VALUE,
        max_attempts: 3,
        claim_timeout_minutes: 30,
        cooldown_minutes: 60,
      })
      setAdvancedOpen(false)
    }
    onOpenChange(nextOpen)
  }

  // When editList changes and dialog is open, populate form with edit values
  // (caller resets by closing and reopening with new editList)

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const voterListId = values.voter_list_id === ALL_VALUE ? undefined : values.voter_list_id
      if (isEdit) {
        const updateData: CallListUpdate = {
          name: values.name,
          voter_list_id: voterListId ?? null,
        }
        await updateMutation.mutateAsync(updateData)
        toast.success("Call list updated")
      } else {
        const createData: CallListCreate = {
          name: values.name,
          voter_list_id: voterListId,
          max_attempts: values.max_attempts,
          claim_timeout_minutes: values.claim_timeout_minutes,
          cooldown_minutes: values.cooldown_minutes,
        }
        await createMutation.mutateAsync(createData)
        toast.success("Call list created")
      }
      handleOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred"
      toast.error(isEdit ? `Failed to update call list: ${message}` : `Failed to create call list: ${message}`)
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Call List" : "New Call List"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="call-list-name">Name</Label>
            <Input
              id="call-list-name"
              placeholder="e.g. Ward 3 Phone Bank"
              {...form.register("name", { required: true, minLength: 1 })}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">Name is required</p>
            )}
          </div>

          {/* Voter list selector */}
          <div className="space-y-2">
            <Label htmlFor="call-list-voter-list">Voter List</Label>
            <Select
              value={form.watch("voter_list_id") || "__none__"}
              onValueChange={(val) => form.setValue("voter_list_id", val === "__none__" ? "" : val, { shouldDirty: true })}
            >
              <SelectTrigger id="call-list-voter-list">
                <SelectValue placeholder="All voters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">All voters</SelectItem>
                {voterLists.map((vl) => (
                  <SelectItem key={vl.id} value={vl.id}>
                    {vl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advanced settings — collapsible via toggle button */}
          {!isEdit && (
            <div className="rounded-md border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setAdvancedOpen((prev) => !prev)}
                aria-expanded={advancedOpen}
              >
                {advancedOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Advanced settings
              </button>

              {advancedOpen && (
                <div className="border-t px-3 pb-3 pt-3 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="max-attempts">Max attempts</Label>
                    <Input
                      id="max-attempts"
                      type="number"
                      min={1}
                      {...form.register("max_attempts", { valueAsNumber: true })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="claim-timeout">
                      Claim timeout{" "}
                      <span className="text-muted-foreground font-normal">(minutes)</span>
                    </Label>
                    <Input
                      id="claim-timeout"
                      type="number"
                      min={1}
                      {...form.register("claim_timeout_minutes", { valueAsNumber: true })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cooldown">
                      Cooldown{" "}
                      <span className="text-muted-foreground font-normal">(minutes)</span>
                    </Label>
                    <Input
                      id="cooldown"
                      type="number"
                      min={0}
                      {...form.register("cooldown_minutes", { valueAsNumber: true })}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CallListsPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/call-lists/",
  })

  const { data: callListsData, isLoading } = useCallLists(campaignId)
  const callLists = callListsData?.items ?? []

  // Create/Edit dialog state — null = closed, non-null = edit mode, special sentinel for create
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editList, setEditList] = useState<CallListSummary | null>(null)

  // Delete dialog state
  const [deleteList, setDeleteList] = useState<CallListSummary | null>(null)

  const deleteMutation = useDeleteCallList(campaignId)

  const handleOpenCreate = () => {
    setEditList(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (list: CallListSummary) => {
    setEditList(list)
    setDialogOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditList(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteList) return
    try {
      await deleteMutation.mutateAsync(deleteList.id)
      toast.success("Call list deleted")
      setDeleteList(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred"
      toast.error(`Failed to delete call list: ${message}`)
    }
  }

  const columns: ColumnDef<CallListSummary>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          to="/campaigns/$campaignId/phone-banking/call-lists/$callListId"
          params={{ campaignId, callListId: row.original.id }}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          variant={statusVariant(row.original.status)}
        />
      ),
    },
    {
      id: "progress",
      header: "Progress",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.completed_entries} / {row.original.total_entries}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RequireRole minimum="manager">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleOpenEdit(row.original)
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteList(row.original)
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RequireRole>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Call Lists</h2>
        <RequireRole minimum="manager">
          <Button size="sm" onClick={handleOpenCreate}>
            + New Call List
          </Button>
        </RequireRole>
      </div>

      <DataTable
        columns={columns}
        data={callLists}
        isLoading={isLoading}
        emptyIcon={List}
        emptyTitle="No call lists yet"
        emptyDescription="Create your first call list to start phone banking"
      />

      {/* Create / Edit Dialog */}
      {dialogOpen && (
        <CallListDialog
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          editList={editList}
          campaignId={campaignId}
        />
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteList}
        onOpenChange={(open) => {
          if (!open) setDeleteList(null)
        }}
        title={`Delete "${deleteList?.name ?? "this call list"}"?`}
        description="This will permanently delete the call list and all its entries. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
